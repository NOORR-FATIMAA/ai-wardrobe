# Offline tests for scripts/deploy-backend.ps1. No Supabase, no network, no real keys:
# - each scenario runs a copy of the script in its own throwaway sandbox folder (its own app/,
#   supabase/.temp and tmp/), so the repository's app/.env.local and CLI link are never touched;
# - TEMP and TMP point at the scenario's own tmp/ while it runs, so the script's temporary secret
#   folders and its stale-folder cleanup never see the real user temp directory (a decoy folder there
#   proves it);
# - `npx` and `Read-Host` are replaced by functions defined here, which the script calls instead of the
#   real commands (PowerShell resolves functions before applications and cmdlets);
# - as a safety net, a fake npx.cmd that always fails is first on PATH, so a real npx is never reached;
# - every sandbox, the decoy and the shared state are removed in `finally` blocks, even after a failure.
#
#   powershell -NoProfile -File scripts/tests/deploy-backend.tests.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$source = Join-Path $repo 'scripts/deploy-backend.ps1'

$REF = 'abcdefghijklmnopqrst'
$OTHER = 'zyxwvutsrqponmlkjihg'
$SECRET_DIR_FILTER = 'wardrobe-deploy-secret-*'
# Fake values, distinctive so the tests can prove none of them is ever printed.
$FAKE = @{
  Db          = 'fake-db-password-Q7x2'
  Gemini      = 'fake-gemini-key-Z9w4'
  Service     = 'sb_secret_fake_service_key_K3v8'
  Publishable = 'sb_publishable_fake_key_M5t1'
  Limit       = '4321987'
}

$script:passed = 0
$script:failed = 0
$script:secretDirsLeftTotal = 0
function Check([string] $name, [bool] $condition) {
  if ($condition) { $script:passed++; Write-Host "  ok   $name" }
  else { $script:failed++; Write-Host "  FAIL $name" -ForegroundColor Red }
}

# The real temp directory and environment, captured before any scenario changes them.
$realTemp = [IO.Path]::GetTempPath()
$savedEnv = @{ TEMP = $env:TEMP; TMP = $env:TMP; PATH = $env:PATH }
$harnessRoot = Join-Path $realTemp ('wardrobe-deploy-tests-' + [guid]::NewGuid().ToString('N'))
# A folder in the real temp directory that matches the script's stale-cleanup filter. If any scenario
# looked at the real temp directory, the script would delete it.
$decoy = Join-Path $realTemp ('wardrobe-deploy-secret-harness-decoy-' + [guid]::NewGuid().ToString('N'))

# ---------------------------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------------------------
# Shared state of the fakes. It is global because the fakes are called from inside the deploy script,
# where `$script:` would mean the deploy script's scope, not this file's. Removed again at the end.
$global:DT = @{
  fake = $FAKE; calls = $null; answers = $null; prompts = $null; remoteSecrets = $null
  secretFile = $null; secretPath = $null; failSecretsSet = $false; smokeEnv = $null; sandbox = $null
}

function npx {
  $argList = @($args | ForEach-Object { "$_" })
  $line = $argList -join ' '
  $global:DT.calls.Add($line)
  $global:LASTEXITCODE = 0
  if ($line -like '*projects api-keys*') {
    return (ConvertTo-Json @(
        [ordered]@{ name = 'default'; api_key = $global:DT.fake.Publishable; type = 'publishable' },
        [ordered]@{ name = 'service_role'; api_key = $global:DT.fake.Service; type = 'legacy' }
      ))
  }
  if ($line -like '*secrets list*') {
    if ($global:DT.remoteSecrets -is [string]) { return $global:DT.remoteSecrets } # raw (malformed) output
    if (@($global:DT.remoteSecrets).Count -eq 0) { return '[]' }
    return (ConvertTo-Json @(@($global:DT.remoteSecrets) | ForEach-Object { [ordered]@{ name = $_; value = "digest-of-$_" } }))
  }
  if ($line -like '*secrets set*') {
    $path = $argList[[array]::IndexOf($argList, '--env-file') + 1]
    $global:DT.secretPath = $path
    $global:DT.secretFile = [IO.File]::ReadAllText($path)
    if ($global:DT.failSecretsSet) { $global:LASTEXITCODE = 1 }
    return
  }
  if ($line -like '*smoke_test.ts*') {
    $global:DT.smokeEnv = @{ API_URL = $env:API_URL; LIVE_AI = $env:LIVE_AI; HasServiceKey = [bool]$env:SERVICE_ROLE_KEY }
    return
  }
  if ($line -like '* link --project-ref *') {
    # What the real CLI does: record the new link.
    $ref = $argList[[array]::IndexOf($argList, '--project-ref') + 1]
    [IO.File]::WriteAllText((Join-Path $global:DT.sandbox 'supabase/.temp/project-ref'), $ref)
  }
}

function Read-Host {
  param([string] $Prompt, [switch] $AsSecureString)
  $global:DT.prompts.Add($Prompt)
  if ($global:DT.answers.Count -eq 0) { throw 'non-interactive (test)' }
  $answer = [string]$global:DT.answers.Dequeue()
  if ($AsSecureString) {
    if ($answer -eq '') { return (New-Object System.Security.SecureString) }
    return (ConvertTo-SecureString $answer -AsPlainText -Force)
  }
  $answer
}

# ---------------------------------------------------------------------------------------------
# Scenario runner
# ---------------------------------------------------------------------------------------------
function New-Sandbox([string] $linkedRef, [bool] $staleSecretDir) {
  $dir = Join-Path $harnessRoot ([guid]::NewGuid().ToString('N'))
  foreach ($sub in 'scripts', 'app', 'supabase/.temp', 'bin', 'tmp') { New-Item -ItemType Directory -Path (Join-Path $dir $sub) -Force | Out-Null }
  Copy-Item -LiteralPath $source -Destination (Join-Path $dir 'scripts/deploy-backend.ps1')
  if ($linkedRef) { [IO.File]::WriteAllText((Join-Path $dir 'supabase/.temp/project-ref'), $linkedRef) }
  [IO.File]::WriteAllText((Join-Path $dir 'bin/npx.cmd'), "@echo off`r`necho REAL-NPX-REACHED 1>&2`r`nexit /b 97`r`n")
  if ($staleSecretDir) {
    # As left by an earlier deployment window that was force-closed.
    $stale = Join-Path $dir 'tmp/wardrobe-deploy-secret-left-by-earlier-run'
    New-Item -ItemType Directory -Path $stale | Out-Null
    [IO.File]::WriteAllText((Join-Path $stale 'secrets.env'), 'OLD=1')
  }
  $dir
}

<#
  Runs the deploy script once in a fresh sandbox. $params are its parameters; $answers are the replies to
  Read-Host in order (an empty queue behaves like a non-interactive session); $remoteSecrets are the
  secret names the project already has (or a raw string for malformed CLI output). DB password and Gemini
  key come from environment variables unless $noGeminiEnv. $failSecretsSet makes `secrets set` fail;
  $staleSecretDir leaves a folder from an "earlier run" in the scenario's temp directory.
#>
function Invoke-Scenario {
  param([hashtable] $params, [string[]] $answers = @(), [object] $remoteSecrets = @(),
    [string] $linkedRef = $REF, [switch] $noGeminiEnv, [switch] $failSecretsSet, [switch] $staleSecretDir,
    [string] $geminiEnv = $FAKE.Gemini)
  $sandbox = New-Sandbox $linkedRef $staleSecretDir
  try {
    $tmp = Join-Path $sandbox 'tmp'
    $global:DT.sandbox = $sandbox
    $global:DT.calls = New-Object System.Collections.Generic.List[string]
    $global:DT.prompts = New-Object System.Collections.Generic.List[string]
    $global:DT.answers = New-Object System.Collections.Queue
    foreach ($a in $answers) { $global:DT.answers.Enqueue($a) }
    $global:DT.remoteSecrets = $remoteSecrets
    $global:DT.secretFile = $null
    $global:DT.secretPath = $null
    $global:DT.failSecretsSet = [bool]$failSecretsSet
    $global:DT.smokeEnv = $null

    $env:PATH = (Join-Path $sandbox 'bin') + ';' + $savedEnv.PATH
    $env:TEMP = $tmp
    $env:TMP = $tmp
    $env:SUPABASE_DB_PASSWORD = $FAKE.Db
    if ($noGeminiEnv) { Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue } else { $env:GEMINI_API_KEY = $geminiEnv }
    $output = New-Object System.Collections.Generic.List[string]
    $errorMessage = $null
    $envLeft = $null
    $scenarioTemp = $null
    try {
      $scenarioTemp = [IO.Path]::GetTempPath()
      & (Join-Path $sandbox 'scripts/deploy-backend.ps1') @params *>&1 | ForEach-Object { $output.Add(($_ | Out-String)) }
    } catch {
      $errorMessage = $_.Exception.Message
    } finally {
      # What the script itself left behind, checked before this runner cleans up.
      $envLeft = @('SUPABASE_DB_PASSWORD', 'API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'LIVE_AI' |
          Where-Object { [Environment]::GetEnvironmentVariable($_) })
      $env:PATH = $savedEnv.PATH
      $env:TEMP = $savedEnv.TEMP
      $env:TMP = $savedEnv.TMP
      foreach ($name in 'SUPABASE_DB_PASSWORD', 'GEMINI_API_KEY', 'API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'LIVE_AI') {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
      }
    }
    $linkFile = Join-Path $sandbox 'supabase/.temp/project-ref'
    $secretDirsLeft = @(Get-ChildItem -LiteralPath $tmp -Directory -Filter $SECRET_DIR_FILTER -Force -ErrorAction SilentlyContinue).Count
    $script:secretDirsLeftTotal += $secretDirsLeft
    $result = [pscustomobject]@{
      Calls          = @($global:DT.calls)
      Text           = ($output -join '') + "`n" + $errorMessage
      Error          = $errorMessage
      Prompts        = @($global:DT.prompts)
      SecretFile     = $global:DT.secretFile
      SecretPath     = $global:DT.secretPath
      SmokeEnv       = $global:DT.smokeEnv
      LinkedRef      = if (Test-Path -LiteralPath $linkFile) { [IO.File]::ReadAllText($linkFile) } else { $null }
      EnvWritten     = Test-Path -LiteralPath (Join-Path $sandbox 'app/.env.local')
      EnvLeft        = $envLeft
      ScenarioTemp   = $scenarioTemp
      SandboxTemp    = $tmp
      SecretDirsLeft = $secretDirsLeft
    }
    # Only fake values are involved, so the script's own error can be shown to explain a failure.
    if ($env:DEPLOY_TEST_VERBOSE -and $errorMessage) { Write-Host "       script error: $errorMessage" -ForegroundColor DarkGray }
    $result
  } finally {
    Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Has([object[]] $calls, [string] $pattern) { @($calls | Where-Object { $_ -like $pattern }).Count -gt 0 }
$changeCalls = '*link --project-ref*', '*db push*', '*secrets set*', '*functions deploy*', '*smoke_test.ts*'
function NoChanges($r) {
  foreach ($pattern in $changeCalls) { if (Has $r.Calls $pattern) { return $false } }
  -not $r.EnvWritten
}
function NoSecretsShown($r) {
  foreach ($value in $FAKE.Db, $FAKE.Gemini, $FAKE.Service, $FAKE.Limit, 'digest-of-') {
    if ($r.Text.Contains($value)) { return $false }
  }
  -not $r.Text.Contains('REAL-NPX-REACHED')
}
function InSandboxTemp($r, [string] $path) {
  $path -and $path.StartsWith($r.SandboxTemp.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
}

try {
  New-Item -ItemType Directory -Path $harnessRoot | Out-Null
  New-Item -ItemType Directory -Path $decoy | Out-Null
  [IO.File]::WriteAllText((Join-Path $decoy 'keep.txt'), 'decoy')

  # Sanity check of the harness itself: the fakes must shadow the real commands.
  Check 'harness: npx resolves to the fake function' ((Get-Command npx).CommandType -eq 'Function')
  Check 'harness: Read-Host resolves to the fake function' ((Get-Command Read-Host).CommandType -eq 'Function')

  # -------------------------------------------------------------------------------------------
  Write-Host 'Default deployment'
  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = $FAKE.Limit } -answers @('yes')
  Check 'deploys without error' ($null -eq $r.Error)
  Check 'runs no smoke test by default' (-not (Has $r.Calls '*smoke_test.ts*') -and $null -eq $r.SmokeEnv)
  Check 'keeps the existing CLI link (no link command)' (-not (Has $r.Calls '*link --project-ref*') -and $r.LinkedRef -eq $REF)
  Check 'stores both function secrets' ($r.SecretFile -match '(?m)^GEMINI_API_KEY=' -and $r.SecretFile -match '(?m)^GLOBAL_AI_DAILY_LIMIT=')
  Check 'does not list remote secrets when both are given' (-not (Has $r.Calls '*secrets list*'))
  $order = @('*projects api-keys*', '*db push --linked --dry-run*', '*db push --linked', '*secrets set*', '*functions deploy*') | ForEach-Object {
    $p = $_; [array]::FindIndex([string[]]$r.Calls, [Predicate[string]] { param($c) $c -like $p })
  }
  Check 'runs the steps in order: keys, dry run, migrations, secrets, functions' (($order -join ',') -eq (($order | Sort-Object) -join ',') -and $order -notcontains -1)
  Check 'writes app/.env.local only inside the sandbox' $r.EnvWritten
  Check 'never prints secret values or the limit' (NoSecretsShown $r)

  Write-Host 'Temporary secret folders'
  Check 'the scenario temp directory is the sandbox, not the real one' ((InSandboxTemp $r $r.ScenarioTemp) -and $r.ScenarioTemp -ne $realTemp)
  Check 'the secrets file was written inside the scenario temp directory' (InSandboxTemp $r $r.SecretPath)
  Check 'no secret folder remains after a successful secrets set' ($r.SecretDirsLeft -eq 0 -and $null -ne $r.SecretPath)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = $FAKE.Limit } -answers @('yes') -failSecretsSet
  Check 'a failed secrets set stops the deployment' ($r.Error -like '*secrets set failed*')
  Check '... before deploying functions or writing app/.env.local' (-not (Has $r.Calls '*functions deploy*') -and -not $r.EnvWritten)
  Check '... after the secrets file had been written in the scenario temp directory' (InSandboxTemp $r $r.SecretPath)
  Check '... and still removes the secret folder' ($r.SecretDirsLeft -eq 0)
  Check '... without printing any secret' (NoSecretsShown $r)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50' } -answers @('yes') -staleSecretDir
  Check 'a secret folder left by an earlier run is removed from the scenario temp directory' ($null -eq $r.Error -and $r.SecretDirsLeft -eq 0 -and $r.Text -like '*Removed 1 leftover temporary secret folder*')

  Write-Host 'GLOBAL_AI_DAILY_LIMIT preflight'
  $r = Invoke-Scenario @{ ProjectRef = $REF } -answers @('yes') -remoteSecrets @('GEMINI_API_KEY', 'SUPABASE_URL')
  Check 'missing remote GLOBAL_AI_DAILY_LIMIT stops before any change' ($r.Error -like '*no GLOBAL_AI_DAILY_LIMIT secret*' -and (NoChanges $r))
  Check '... after only read-only calls' ((Has $r.Calls '*secrets list*') -and $r.Calls.Count -eq 2)

  $r = Invoke-Scenario @{ ProjectRef = $REF } -answers @('', 'yes') -remoteSecrets @('GEMINI_API_KEY', 'GLOBAL_AI_DAILY_LIMIT') -noGeminiEnv
  Check 'existing remote secrets are kept and nothing is re-set' ($null -eq $r.Error -and -not (Has $r.Calls '*secrets set*'))
  Check '... and the deployment still runs' (Has $r.Calls '*functions deploy*')

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50' } -answers @('') -remoteSecrets @('GLOBAL_AI_DAILY_LIMIT') -noGeminiEnv
  Check 'no Gemini key anywhere stops before any change' ($r.Error -like '*no GEMINI_API_KEY secret*' -and (NoChanges $r))

  # Ctrl+V in a hidden prompt (control character), a space inside, and a non-ASCII character.
  $badKeys = [ordered]@{ 'a control character' = $FAKE.Gemini + [char]0x16; 'a space' = 'fake gemini-key'; 'a non-ASCII character' = 'fake-gemini-key-' + [char]0xE9 }
  foreach ($case in $badKeys.Keys) {
    $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50' } -answers @('yes') -geminiEnv $badKeys[$case]
    Check "a Gemini key with $case stops before any change" ($r.Error -like '*Gemini API key contains*' -and (NoChanges $r) -and (NoSecretsShown $r))
  }
  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50' } -answers @('yes') -geminiEnv "  $($FAKE.Gemini)`r`n"
  Check 'surrounding whitespace in the Gemini key is trimmed, not stored' ($null -eq $r.Error -and $r.SecretFile -cmatch "(?m)^GEMINI_API_KEY=$($FAKE.Gemini)$")

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '0' } -answers @('', 'yes') -remoteSecrets @() -noGeminiEnv
  Check 'GlobalAiDailyLimit 0 deploys with AI switched off, with a warning' ($null -eq $r.Error -and $r.Text -like '*AI features stay switched off*')
  Check '... and stores only GLOBAL_AI_DAILY_LIMIT' ($r.SecretFile -match '^GLOBAL_AI_DAILY_LIMIT=0$')

  foreach ($bad in '-1', '10000000', 'abc', '1.5', ' 5', '5 ', '', '1e3', "5`n") {
    $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = $bad } -answers @('yes')
    Check "invalid GlobalAiDailyLimit $(ConvertTo-Json $bad) stops before any call" ($r.Error -like '*must be a whole number*' -and $r.Calls.Count -eq 0)
  }
  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '-4321987' } -answers @('yes')
  Check 'an invalid limit is not echoed' (-not $r.Text.Contains('4321987'))

  $r = Invoke-Scenario @{ ProjectRef = $REF } -answers @('yes') -remoteSecrets 'not json digest-of-x'
  Check 'malformed secrets list output stops safely without echoing it' ($r.Error -like '*could not read the project*' -and (NoChanges $r) -and (NoSecretsShown $r))

  Write-Host 'CLI link'
  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50' } -answers @('yes') -linkedRef $OTHER
  Check 'linked to another project: stops before any call' ($r.Error -like "*is linked to $OTHER, not $REF*" -and $r.Calls.Count -eq 0)
  Check '... and the link is unchanged' ($r.LinkedRef -eq $OTHER)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50' } -answers @('yes') -linkedRef ''
  Check 'not linked: stops before any call' ($r.Error -like '*is not linked to any project*' -and $r.Calls.Count -eq 0 -and $null -eq $r.LinkedRef)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50' } -answers @('yes') -linkedRef 'garbage'
  Check 'unreadable link file: stops before any call' ($r.Error -like '*does not hold a project ref*' -and $r.Calls.Count -eq 0)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; Relink = $true } -answers @('yes') -linkedRef $OTHER
  Check '-Relink links to the target and deploys' ($null -eq $r.Error -and (Has $r.Calls '*link --project-ref*') -and $r.LinkedRef -eq $REF)
  Check '... with warnings naming the previous project and how to switch back' ($r.Text -like "*Relinking*" -and $r.Text -like "*npx supabase link --project-ref $OTHER*")
  $linkIndex = [array]::FindIndex([string[]]$r.Calls, [Predicate[string]] { param($c) $c -like '*link --project-ref*' })
  $pushIndex = [array]::FindIndex([string[]]$r.Calls, [Predicate[string]] { param($c) $c -like '*db push*' })
  Check '... linking only after the read-only preflight and before migrations' ($linkIndex -gt 0 -and $linkIndex -lt $pushIndex)

  Write-Host 'Smoke test authorization'
  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; RunSmokeTest = $true } -answers @('yes', 'yes')
  Check '-RunSmokeTest without -ConfirmTestProjectRef stops before any call' ($r.Error -like '*ConfirmTestProjectRef*' -and $r.Calls.Count -eq 0)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; RunSmokeTest = $true; ConfirmTestProjectRef = $OTHER } -answers @('yes', 'yes')
  Check 'a mismatched -ConfirmTestProjectRef stops before any call' ($r.Error -like '*ConfirmTestProjectRef*' -and $r.Calls.Count -eq 0)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; RunSmokeTest = $true; ConfirmTestProjectRef = $REF.ToUpper() } -answers @('yes', 'yes')
  Check 'the confirmation ref is compared exactly' ($r.Error -like '*ConfirmTestProjectRef*' -and $r.Calls.Count -eq 0)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; RunSmokeTest = $true; ConfirmTestProjectRef = $REF } -answers @('no', 'yes')
  Check 'answering no to "is this a test project" stops before any call' ($r.Error -like '*not confirmed*' -and $r.Calls.Count -eq 0)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; RunSmokeTest = $true; ConfirmTestProjectRef = $REF } -answers @()
  Check 'a non-interactive session never runs the smoke test' ($r.Error -like '*not confirmed*' -and $r.Calls.Count -eq 0)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; RunSmokeTest = $true; ConfirmTestProjectRef = $REF } -answers @('yes', 'yes')
  Check 'a confirmed test project runs the smoke test after deploying' ($null -eq $r.Error -and $null -ne $r.SmokeEnv -and $r.SmokeEnv.LIVE_AI -eq '0' -and $r.SmokeEnv.HasServiceKey)
  Check '... warning that it creates users and uses quota' ($r.Text -like '*creates and deletes two test users*')
  Check '... and clears its environment variables (keys, URL, DB password) afterwards' ($r.EnvLeft.Count -eq 0)
  Check '... without printing any secret' (NoSecretsShown $r)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; LiveAiSmokeTest = $true } -answers @('yes')
  Check '-LiveAiSmokeTest alone stops before any call' ($r.Error -like '*only works together with -RunSmokeTest*' -and $r.Calls.Count -eq 0)

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '0'; RunSmokeTest = $true; ConfirmTestProjectRef = $REF; LiveAiSmokeTest = $true } -answers @('yes', 'yes')
  Check '-LiveAiSmokeTest with AI switched off stops before any change' ($r.Error -like '*cannot pass with -GlobalAiDailyLimit 0*' -and (NoChanges $r))

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; SkipTests = $true } -answers @('yes')
  Check 'deprecated -SkipTests still deploys, without the smoke test' ($null -eq $r.Error -and -not (Has $r.Calls '*smoke_test.ts*'))
  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; SkipTests = $true; RunSmokeTest = $true; ConfirmTestProjectRef = $REF } -answers @('yes', 'yes')
  Check '-SkipTests with -RunSmokeTest is rejected' ($r.Error -like '*cannot be used together*' -and $r.Calls.Count -eq 0)

  Write-Host 'Other safeguards'
  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50' } -answers @('no')
  Check 'declining the migrations stops before applying them' ($r.Error -like '*not confirmed*' -and (Has $r.Calls '*--dry-run*') -and -not (Has $r.Calls '*db push --linked') -and -not (Has $r.Calls '*functions deploy*'))

  foreach ($bad in 'short', 'ABCDEFGHIJKLMNOPQRST', 'abcdefghijklmnopqrs/', 'abcdefghijklmnopqrstu') {
    $r = Invoke-Scenario @{ ProjectRef = $bad; GlobalAiDailyLimit = '50' } -answers @('yes')
    Check "malformed project ref $(ConvertTo-Json $bad) stops before any call" ($r.Error -like '*20-character*' -and $r.Calls.Count -eq 0)
  }

  $r = Invoke-Scenario @{ ProjectRef = $REF; GlobalAiDailyLimit = '50'; GeminiKey = $FAKE.Gemini } -answers @('yes')
  Check 'a plain-text -GeminiKey is still rejected without echoing it' ($r.Error -like '*only accepts a SecureString*' -and (NoSecretsShown $r) -and (NoChanges $r))

  # The help examples must pass the script's own project-ref validation.
  $help = [IO.File]::ReadAllText($source)
  $exampleRefs = @([regex]::Matches($help, '(?m)^\s*\./scripts/deploy-backend\.ps1 .*$') |
      ForEach-Object { [regex]::Matches($_.Value, '-(?:ConfirmTest)?ProjectRef\s+(\S+)') } | ForEach-Object { $_.Groups[1].Value })
  Check "the help examples' project refs are valid ($($exampleRefs.Count) found)" ($exampleRefs.Count -ge 3 -and
    @($exampleRefs | Where-Object { $_ -cnotmatch '\A[a-z0-9]{20}\z' }).Count -eq 0)

  Write-Host 'Isolation'
  Check 'no scenario left a temporary secret folder behind' ($script:secretDirsLeftTotal -eq 0)
  Check 'the real temp directory was never cleaned by the script (decoy intact)' (Test-Path -LiteralPath (Join-Path $decoy 'keep.txt'))
} finally {
  $env:PATH = $savedEnv.PATH
  $env:TEMP = $savedEnv.TEMP
  $env:TMP = $savedEnv.TMP
  Remove-Item -LiteralPath $harnessRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $decoy -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Variable -Name DT -Scope Global -ErrorAction SilentlyContinue
}

$leftovers = @((Test-Path -LiteralPath $harnessRoot), (Test-Path -LiteralPath $decoy)) -contains $true
if ($leftovers) { Write-Host "  FAIL the harness could not remove its own folders under $realTemp" -ForegroundColor Red; $script:failed++ }
Write-Host "`n$script:passed passed, $script:failed failed"
if ($script:failed) { exit 1 }
exit 0
