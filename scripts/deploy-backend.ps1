<#
.SYNOPSIS
  Deploys the backend to a hosted Supabase project.

.DESCRIPTION
  0. Preflight, before anything is changed:
     - Checks the options: the smoke test only runs with -RunSmokeTest plus -ConfirmTestProjectRef and
       a typed "yes" (it is for separate test projects only).
     - Checks which project this folder's Supabase CLI is linked to. If that is not -ProjectRef, it
       stops unless you pass -Relink; the link is never changed silently.
     - Looks up and validates the project's API keys: the publishable key always, and the service-role
       key when the smoke test will run.
     - Makes sure AI will not be left answering 503: GLOBAL_AI_DAILY_LIMIT must be given with
       -GlobalAiDailyLimit or already exist as a function secret, and so must the Gemini key (unless
       -GlobalAiDailyLimit 0 switches AI off). Only secret names are read; values never are.
  1. Shows a dry run of pending database migrations and applies them only after you type "yes".
     Migrations add or replace tables, functions, constraints and policies; none drops or resets data.
  2. Stores the given function secrets (GEMINI_API_KEY, GLOBAL_AI_DAILY_LIMIT). The Gemini key is only
     ever a server-side secret: it is never written to app/.env.local or sent to the app.
  3. Deploys all Edge Functions (bundled server-side; Docker is not needed).
  4. Updates app/.env.local with the project URL and publishable key, keeping all other lines. If the
     file already holds different values, it asks first and saves a backup copy before changing it.
  5. Only with -RunSmokeTest: runs supabase/tests/smoke_test.ts against the project. It creates and
     deletes two test users and uses up some of the day's AI quota counters, so never run it against
     production. It makes no live AI calls unless you also pass -LiveAiSmokeTest.

  Secrets are never taken as plain-text parameters. For each of the database password and the Gemini
  key, the script uses (in order) a SecureString parameter, an environment variable
  (SUPABASE_DB_PASSWORD / GEMINI_API_KEY), or a hidden prompt. The script never prints secret values
  or the GLOBAL_AI_DAILY_LIMIT value.

  Prerequisite: run `npx supabase login` once (opens your browser).

.EXAMPLE
  ./scripts/deploy-backend.ps1 -ProjectRef abcdefghijklmnopqrst -GlobalAiDailyLimit 200
  # Deploys without running the smoke test. Prompts (hidden input) for the database password and the Gemini key.

.EXAMPLE
  ./scripts/deploy-backend.ps1 -ProjectRef testprojectref123456 -Relink -RunSmokeTest -ConfirmTestProjectRef testprojectref123456
  # A separate test project: relinks the CLI to it, deploys, then runs the smoke test after a typed "yes".
#>
param(
  [Parameter(Mandatory)] [string] $ProjectRef,
  # Secrets accept a SecureString only. They are typed [object] on purpose: a [SecureString] type makes
  # PowerShell echo a plain-text value in its conversion error, while this script rejects it silently.
  [object] $DbPassword,
  [object] $GeminiKey,
  # Project-wide daily AI call limit, stored as the GLOBAL_AI_DAILY_LIMIT function secret: a whole
  # number up to 9999999 (0 switches AI off). Needed unless the project already has that secret.
  # Typed [string] and validated here so an invalid value is never echoed in an error.
  [string] $GlobalAiDailyLimit,
  # Opt-in: run the backend smoke test after deploying. Only for a separate test project; it also
  # needs -ConfirmTestProjectRef set to the same ref and a typed "yes".
  [switch] $RunSmokeTest,
  [string] $ConfirmTestProjectRef,
  # Opt-in, with -RunSmokeTest: the smoke test then sends one stylist request with test data to Google Gemini.
  [switch] $LiveAiSmokeTest,
  # Allows linking this folder's Supabase CLI to -ProjectRef when it is linked elsewhere or not linked.
  [switch] $Relink,
  # Deprecated: the smoke test only runs with -RunSmokeTest. Kept so older commands still work.
  [switch] $SkipTests
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$supabase = @('--yes', 'supabase@2.122.0')
# The Deno version the smoke test was tested with. Pinned so npx never silently installs a newer one.
$denoPackage = 'deno@2.9.6'
# Temporary secret folders are created under the user's temp directory with this prefix.
$secretDirPrefix = 'wardrobe-deploy-secret-'
# Supabase project refs are 20 lowercase letters or digits.
$refPattern = '\A[a-z0-9]{20}\z'
# The same rule as parseLimit() in supabase/functions/_shared/context.ts.
$limitPattern = '\A\d{1,7}\z'
$globalLimitGiven = $PSBoundParameters.ContainsKey('GlobalAiDailyLimit')
# Set once the CLI link has been changed, so the final message can say how to switch back.
$script:relinkNotice = $null

function Step($message) { Write-Host "`n==> $message" -ForegroundColor Cyan }
# $label is the only text used in error messages; never put arguments there, they can carry secrets.
function Run([string] $label, [string[]] $arguments) {
  & npx @supabase @arguments
  if ($LASTEXITCODE -ne 0) { throw "supabase $label failed (exit $LASTEXITCODE)" }
}

# Parses `supabase projects api-keys --reveal -o json`. Field names and selection rules follow Supabase
# CLI 2.122.0: a JSON array of { name, api_key, type: legacy|publishable|secret, secret_jwt_template };
# the CLI's own service-role lookup takes a `secret` key whose secret_jwt_template.role is service_role,
# then the legacy `service_role` key. Errors are generic and never echo the CLI output (it holds secrets).
function Get-ProjectKeys([string] $json) {
  $unexpected = 'Could not read the project API keys: the Supabase CLI output was not in the expected format.'
  try {
    $parsed = ConvertFrom-Json -InputObject $json
  } catch {
    throw $unexpected
  }
  $entries = @($parsed)
  if ($entries.Count -eq 0 -or @($entries | Where-Object { $_ -isnot [System.Management.Automation.PSCustomObject] }).Count) {
    throw $unexpected
  }
  $usable = @($entries | Where-Object { $_.name -is [string] -and $_.api_key -is [string] -and $_.api_key.Length -gt 0 })

  $publishable = $usable | Where-Object { $_.type -eq 'publishable' } | Select-Object -First 1
  if (-not $publishable) { $publishable = $usable | Where-Object { $_.name -eq 'anon' } | Select-Object -First 1 }

  $service = $usable | Where-Object {
    $_.type -eq 'secret' -and $_.secret_jwt_template -is [System.Management.Automation.PSCustomObject] -and
    $_.secret_jwt_template.role -is [string] -and $_.secret_jwt_template.role.ToLowerInvariant() -eq 'service_role'
  } | Select-Object -First 1
  if (-not $service) { $service = $usable | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1 }

  # The publishable key ends up in the app bundle, so never let a secret key through as one.
  if ($publishable -and ($publishable.type -eq 'secret' -or $publishable.api_key -like 'sb_secret_*' -or
      ($service -and $publishable.api_key -eq $service.api_key))) {
    throw 'Could not read the project API keys: the key chosen as publishable looks like a secret key.'
  }
  [pscustomobject]@{
    Publishable = if ($publishable) { $publishable.api_key } else { $null }
    ServiceRole = if ($service) { $service.api_key } else { $null }
  }
}

# Names of the project's Edge Function secrets from `supabase secrets list -o json`, assumed to be a JSON
# array of objects with a string `name` (the CLI lists names and digests, never values). Only names are
# used, and nothing from the output is ever printed.
function Get-SecretNames([string] $json) {
  $unexpected = ("Stopped before making any changes: could not read the project's function secret names (the " +
    'Supabase CLI output was not in the expected format). Pass -GlobalAiDailyLimit and the Gemini key to skip this check.')
  if ($json.Trim() -eq '[]') { return @() }
  try {
    $parsed = ConvertFrom-Json -InputObject $json
  } catch {
    throw $unexpected
  }
  $entries = @($parsed)
  if ($entries.Count -eq 0 -or @($entries | Where-Object {
        $_ -isnot [System.Management.Automation.PSCustomObject] -or $_.name -isnot [string] }).Count) {
    throw $unexpected
  }
  @($entries | ForEach-Object { $_.name })
}

# Which project this folder's Supabase CLI is linked to. `supabase link` records the ref in
# supabase/.temp/project-ref (Supabase CLI 2.x). State is 'linked', 'none' or 'unreadable'.
function Get-LinkedProject {
  $file = Join-Path $root 'supabase/.temp/project-ref'
  if (-not (Test-Path -LiteralPath $file)) { return [pscustomobject]@{ State = 'none'; Ref = $null } }
  $value = ([IO.File]::ReadAllText($file)).Trim()
  if ($value -cmatch $refPattern) { return [pscustomobject]@{ State = 'linked'; Ref = $value } }
  [pscustomobject]@{ State = 'unreadable'; Ref = $null }
}

function ConvertTo-PlainText([System.Security.SecureString] $secure) {
  if (-not $secure) { return '' }
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

# Resolves a secret from a SecureString parameter, then an environment variable, then a hidden prompt.
# Messages name the parameter or variable only, never a value.
function Resolve-Secret([object] $value, [string] $parameterName, [string] $envName, [string] $prompt, [switch] $Optional) {
  if ($null -ne $value) {
    if ($value -isnot [System.Security.SecureString]) {
      throw ("-$parameterName only accepts a SecureString, e.g. -$parameterName (Read-Host -AsSecureString). " +
        "Plain-text values are not accepted; omit -$parameterName to be prompted, or set $envName.")
    }
    return ConvertTo-PlainText $value
  }
  $fromEnvironment = [Environment]::GetEnvironmentVariable($envName)
  if ($fromEnvironment) { return $fromEnvironment }
  try {
    $entered = Read-Host -Prompt $prompt -AsSecureString
  } catch {
    if ($Optional) { return $null }
    throw "Cannot prompt for -$parameterName in a non-interactive session. Set the $envName environment variable instead."
  }
  $plain = ConvertTo-PlainText $entered
  if (-not $plain -and -not $Optional) { throw "No value entered for -$parameterName." }
  return $plain
}

# Asks for an explicit "yes". Anything else, or a session that cannot prompt, means no.
function Confirm-Action([string] $question) {
  try {
    $answer = Read-Host -Prompt "$question Type 'yes' to continue"
  } catch {
    Write-Warning 'Cannot ask for confirmation in a non-interactive session.'
    return $false
  }
  return ($answer -is [string] -and $answer.Trim().ToLowerInvariant() -eq 'yes')
}

# A new folder in the user's temp directory that only the current user can access (inheritance off).
function New-PrivateSecretDir {
  $dir = Join-Path ([IO.Path]::GetTempPath()) ($secretDirPrefix + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $dir | Out-Null
  try {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentUser, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $dir -AclObject $acl
  } catch {
    Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    throw 'Could not create a private temporary folder for the function secrets.'
  }
  $dir
}

# Overwrites each file with zeros, then deletes the files and the folder. Returns $true when gone.
# On SSDs and journaling file systems overwriting cannot guarantee the old bytes are unrecoverable.
function Remove-SecretDir([string] $dir) {
  if (-not (Test-Path -LiteralPath $dir)) { return $true }
  foreach ($file in @(Get-ChildItem -LiteralPath $dir -File -Force -ErrorAction SilentlyContinue)) {
    try { [IO.File]::WriteAllBytes($file.FullName, (New-Object byte[] ([Math]::Max([int]$file.Length, 64)))) } catch { }
  }
  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
  return -not (Test-Path -LiteralPath $dir)
}

# Folders left by an earlier run that was force-closed (finally blocks do not run then). Only folders
# with this script's own prefix are touched. Returns how many were removed.
function Remove-StaleSecretDirs {
  $removed = 0
  foreach ($dir in @(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter "$secretDirPrefix*" -ErrorAction SilentlyContinue)) {
    if (Remove-SecretDir $dir.FullName) { $removed++ }
  }
  $removed
}

# Sets the given keys in a dotenv file, keeping every other line. Asks before replacing a different
# existing value and backs the file up before changing it. Values are never printed.
function Update-AppEnvFile([string] $path, [System.Collections.Specialized.OrderedDictionary] $values) {
  $exists = Test-Path -LiteralPath $path
  $lines = if ($exists) { @([IO.File]::ReadAllLines($path)) } else { @() }
  $keyPattern = { param($key) '^\s*(export\s+)?' + [regex]::Escape($key) + '\s*=' }

  $changed = @()
  $missing = @()
  foreach ($key in $values.Keys) {
    $pattern = & $keyPattern $key
    $existing = @($lines | Where-Object { $_ -match $pattern })
    if ($existing.Count -eq 0) { $missing += $key; continue }
    $current = ($existing[-1] -replace $pattern, '').Trim().Trim('"').Trim("'")
    if ($current -ne $values[$key]) { $changed += $key }
  }
  if (-not $changed -and -not $missing) {
    Write-Host 'app/.env.local already has these values; left unchanged.'
    return $true
  }

  if ($exists) {
    if ($changed) {
      Write-Warning "app/.env.local already sets $($changed -join ' and ') to a different value (values are not shown)."
      if (-not (Confirm-Action 'Replace them? A backup copy is saved first and all other lines are kept.')) {
        Write-Warning 'app/.env.local was left unchanged, so the app keeps its previous Supabase settings.'
        return $false
      }
    }
    # Named so both .gitignore files exclude it (.env*.local / .env.*) and Expo never loads it.
    $backup = Join-Path (Split-Path -Parent $path) ".env.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').local"
    Copy-Item -LiteralPath $path -Destination $backup
    Write-Host "Saved a backup of the previous app/.env.local as $(Split-Path -Leaf $backup)."
  }

  $output = New-Object System.Collections.Generic.List[string]
  foreach ($line in $lines) {
    $replacement = $null
    foreach ($key in $values.Keys) {
      if ($line -match (& $keyPattern $key)) { $replacement = "$key=$($values[$key])"; break }
    }
    $output.Add($(if ($null -ne $replacement) { $replacement } else { $line }))
  }
  foreach ($key in $missing) { $output.Add("$key=$($values[$key])") }
  [IO.File]::WriteAllLines($path, $output, (New-Object System.Text.UTF8Encoding $false))
  return $true
}

function Invoke-Deployment {
  # ---------------------------------------------------------------------------------------------
  # Preflight: every check below runs before anything is changed.
  # ---------------------------------------------------------------------------------------------
  if ($ProjectRef -cnotmatch $refPattern) {
    throw 'Stopped before making any changes: -ProjectRef must be a 20-character Supabase project ref.'
  }
  if ($globalLimitGiven -and $GlobalAiDailyLimit -notmatch $limitPattern) {
    throw ('Stopped before making any changes: -GlobalAiDailyLimit must be a whole number from 0 to 9999999 ' +
      '(0 switches AI off). The value given is not shown.')
  }

  # The smoke test is opt-in and only for a project you explicitly confirm as a separate test project.
  # The script never decides by itself that a project is a test project.
  if ($SkipTests) {
    if ($RunSmokeTest) { throw 'Stopped before making any changes: -SkipTests and -RunSmokeTest cannot be used together.' }
    Write-Host '-SkipTests is no longer needed: the smoke test only runs with -RunSmokeTest.'
  }
  if ($LiveAiSmokeTest -and -not $RunSmokeTest) {
    throw 'Stopped before making any changes: -LiveAiSmokeTest only works together with -RunSmokeTest.'
  }
  if ($RunSmokeTest) {
    if ($ConfirmTestProjectRef -cne $ProjectRef) {
      throw ('Stopped before making any changes: -RunSmokeTest also needs -ConfirmTestProjectRef set to the same ' +
        'project ref, to confirm it is a separate test project. Never run the smoke test against production.')
    }
    Write-Warning ("The smoke test creates and deletes two test users on project $ProjectRef and uses up some of " +
      "today's AI quota counters there. Run it only against a separate test project, never production.")
    if (-not (Confirm-Action "Is $ProjectRef a separate TEST project (not production)?")) {
      throw 'Stopped before making any changes: the smoke test was not confirmed for this project.'
    }
  } elseif ($ConfirmTestProjectRef) {
    Write-Warning '-ConfirmTestProjectRef has no effect without -RunSmokeTest.'
  }

  # Never change the CLI link silently: later `--linked` commands from this folder follow it.
  $linked = Get-LinkedProject
  $currentLink = switch ($linked.State) {
    'linked' { "is linked to $($linked.Ref)" }
    'none' { 'is not linked to any project' }
    default { 'has a link file that does not hold a project ref' }
  }
  $relinkNeeded = $linked.Ref -ne $ProjectRef
  if ($relinkNeeded -and -not $Relink) {
    throw ("Stopped before making any changes: the Supabase CLI in this folder $currentLink, not $ProjectRef. " +
      "Re-run with -Relink to link it to $ProjectRef (commands that use --linked will then target that " +
      "project), or link it yourself first with: npx supabase link --project-ref $ProjectRef")
  }
  if ($Relink -and -not $relinkNeeded) { Write-Host "The Supabase CLI is already linked to $ProjectRef; -Relink is not needed." }

  $stale = Remove-StaleSecretDirs
  if ($stale) { Write-Warning "Removed $stale leftover temporary secret folder(s) from an earlier interrupted run." }

  $dbPasswordPlain = Resolve-Secret $DbPassword 'DbPassword' 'SUPABASE_DB_PASSWORD' 'Supabase database password'
  $geminiKeyPlain = Resolve-Secret $GeminiKey 'GeminiKey' 'GEMINI_API_KEY' 'Gemini API key (press Enter to leave the GEMINI_API_KEY secret unchanged)' -Optional
  # The key is sent as an HTTP header, so it may only contain visible ASCII. Ctrl+V in a hidden
  # Read-Host prompt of Windows PowerShell 5.1 types a control character instead of pasting, which
  # would otherwise be stored and break every AI request ("failed to parse header value").
  if ($geminiKeyPlain) { $geminiKeyPlain = $geminiKeyPlain.Trim() }
  if ($geminiKeyPlain -and $geminiKeyPlain -cnotmatch '\A[\x21-\x7E]+\z') {
    $geminiKeyPlain = $null
    throw ('Stopped before making any changes: the Gemini API key contains spaces, control or non-ASCII ' +
      'characters. In the hidden prompt, paste with a right-click instead of Ctrl+V, or set GEMINI_API_KEY.')
  }

  # Look up and validate the project's API keys before anything is changed (migrations, the function
  # secrets, function deployment, app/.env.local). `projects api-keys` takes the project ref itself and
  # uses the `supabase login` token, so it needs neither `link` nor the database password.
  Step 'Fetching API keys'
  $keysOutput = & npx @supabase projects api-keys --project-ref $ProjectRef --reveal -o json
  if ($LASTEXITCODE -ne 0) { throw 'Could not read API keys' }
  $projectKeys = Get-ProjectKeys ($keysOutput -join "`n")
  $keysOutput = $null
  $publishable = $projectKeys.Publishable
  $secret = $projectKeys.ServiceRole
  if (-not $publishable) {
    throw 'Stopped before making any changes: no publishable (or legacy anon) API key was found for the project.'
  }
  # The smoke test creates real test users and needs the service-role key to clean them up reliably.
  if ($RunSmokeTest -and -not $secret) {
    throw ('Stopped before making any changes: the service-role key was not found in the Supabase CLI output, ' +
      'and the smoke test needs it to create and clean up its test users. Nothing was deployed and the ' +
      'database was not changed. Re-run without -RunSmokeTest to deploy without the smoke test, or check the ' +
      'project API keys in the Supabase dashboard.')
  }
  $url = "https://$ProjectRef.supabase.co"

  # AI functions answer 503 without GEMINI_API_KEY or a valid GLOBAL_AI_DAILY_LIMIT. Secrets that are
  # not given here must already exist on the project. Only names are read (values cannot be read back).
  $aiSwitchedOff = $globalLimitGiven -and [int]$GlobalAiDailyLimit -eq 0
  $remoteSecretNames = @()
  if (-not $globalLimitGiven -or -not $geminiKeyPlain) {
    Step 'Checking which function secrets the project already has (names only)'
    $namesOutput = & npx @supabase secrets list --project-ref $ProjectRef -o json
    if ($LASTEXITCODE -ne 0) { throw "Stopped before making any changes: could not list the project's function secrets." }
    $remoteSecretNames = Get-SecretNames ($namesOutput -join "`n")
    $namesOutput = $null
  }
  if (-not $globalLimitGiven) {
    if ($remoteSecretNames -notcontains 'GLOBAL_AI_DAILY_LIMIT') {
      throw ('Stopped before making any changes: the project has no GLOBAL_AI_DAILY_LIMIT secret, so every AI ' +
        'function would answer 503. Re-run with -GlobalAiDailyLimit <calls per day> (0 switches AI off).')
    }
    Write-Host ('Keeping the existing GLOBAL_AI_DAILY_LIMIT secret. Its value cannot be read back: if it is not ' +
      'a whole number, AI features answer 503 until it is fixed.')
  }
  if (-not $geminiKeyPlain) {
    if ($remoteSecretNames -contains 'GEMINI_API_KEY') {
      Write-Host 'No Gemini key given: keeping the existing GEMINI_API_KEY secret.'
    } elseif ($aiSwitchedOff) {
      Write-Warning 'No GEMINI_API_KEY secret: AI stays off until it is set (GLOBAL_AI_DAILY_LIMIT is 0 anyway).'
    } else {
      throw ('Stopped before making any changes: the project has no GEMINI_API_KEY secret and no Gemini key was ' +
        'given, so every AI function would answer 503. Provide the key, or pass -GlobalAiDailyLimit 0 to deploy with AI switched off.')
    }
  }
  if ($aiSwitchedOff) { Write-Warning 'GLOBAL_AI_DAILY_LIMIT will be 0: AI features stay switched off.' }
  if ($LiveAiSmokeTest -and $aiSwitchedOff) {
    throw 'Stopped before making any changes: -LiveAiSmokeTest cannot pass with -GlobalAiDailyLimit 0.'
  }

  # ---------------------------------------------------------------------------------------------
  # Changes
  # ---------------------------------------------------------------------------------------------
  # The CLI reads the database password from SUPABASE_DB_PASSWORD when --password is not given, which
  # keeps it out of command lines (visible in process lists) and out of error messages.
  $env:SUPABASE_DB_PASSWORD = $dbPasswordPlain
  $dbPasswordPlain = $null
  try {
    if ($relinkNeeded) {
      Write-Warning "Relinking this folder's Supabase CLI: it $currentLink. Commands that use --linked will target $ProjectRef afterwards."
      Step "Linking project $ProjectRef"
      Run 'link' @('link', '--project-ref', $ProjectRef)
      $script:relinkNotice = if ($linked.State -eq 'linked') {
        "The Supabase CLI in this folder is now linked to $ProjectRef (it was linked to $($linked.Ref)). To switch back: npx supabase link --project-ref $($linked.Ref)"
      } else {
        "The Supabase CLI in this folder is now linked to $ProjectRef (it $currentLink before)."
      }
    } else {
      Step "Using the existing CLI link to $ProjectRef"
    }

    Step 'Previewing database migrations (dry run: nothing is applied yet)'
    Run 'db push --dry-run' @('db', 'push', '--linked', '--dry-run')
    if (-not (Confirm-Action 'Apply the migrations listed above to the remote database?')) {
      throw 'Stopped before applying migrations because they were not confirmed. The database was not changed and nothing was deployed.'
    }

    Step 'Applying database migrations'
    Run 'db push' @('db', 'push', '--linked')
  } finally {
    Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
  }

  $secretLines = @()
  if ($geminiKeyPlain) { $secretLines += "GEMINI_API_KEY=$geminiKeyPlain" }
  if ($globalLimitGiven) { $secretLines += "GLOBAL_AI_DAILY_LIMIT=$GlobalAiDailyLimit" }
  $geminiKeyPlain = $null
  if ($secretLines) {
    $names = @($secretLines | ForEach-Object { ($_ -split '=', 2)[0] }) -join ', '
    Step "Storing function secrets: $names (values are not shown)"
    $secretDir = $null
    try {
      $secretDir = New-PrivateSecretDir
      $secretFile = Join-Path $secretDir 'secrets.env'
      [IO.File]::WriteAllText($secretFile, ($secretLines -join "`n"), [Text.Encoding]::ASCII)
      $secretLines = $null
      Run 'secrets set' @('secrets', 'set', '--project-ref', $ProjectRef, '--env-file', $secretFile)
    } finally {
      # Runs on success, failure and Ctrl+C. A force-closed window skips it; the next run removes
      # the leftover folder (see Remove-StaleSecretDirs).
      if ($secretDir -and -not (Remove-SecretDir $secretDir)) {
        Write-Warning "Could not delete the temporary secret folder $secretDir. Delete it manually."
      }
    }
  }

  Step 'Deploying Edge Functions'
  Run 'functions deploy' @('functions', 'deploy', '--project-ref', $ProjectRef, '--use-api')

  Step 'Updating app/.env.local'
  $appEnv = [ordered]@{
    EXPO_PUBLIC_SUPABASE_URL             = $url
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $publishable
  }
  Update-AppEnvFile (Join-Path $root 'app/.env.local') $appEnv | Out-Null

  if ($RunSmokeTest) {
    # Authorised in the preflight; the service-role key was validated before any change was made.
    Step 'Running the backend smoke test'
    if ($LiveAiSmokeTest) {
      Write-Warning 'Live AI smoke test enabled: one stylist request with test data will be sent to Google Gemini (on the free tier Google may use it to improve its products).'
    }
    $testExit = $null
    try {
      $env:API_URL = $url
      $env:ANON_KEY = $publishable
      $env:SERVICE_ROLE_KEY = $secret
      # Live AI calls are opt-in; by default the smoke test skips the one check that reaches Gemini.
      $env:LIVE_AI = if ($LiveAiSmokeTest) { '1' } else { '0' }
      & npx --yes $denoPackage run -A supabase/tests/smoke_test.ts
      $testExit = $LASTEXITCODE
    } finally {
      # $env: changes outlive the script in this PowerShell session, so always clear them, even on
      # failure or Ctrl+C. Each removal is guarded so a cleanup problem cannot mask the test result.
      foreach ($name in 'SERVICE_ROLE_KEY', 'ANON_KEY', 'API_URL', 'LIVE_AI') {
        try {
          Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        } catch {
          Write-Warning "Could not clear the $name environment variable; close this PowerShell window to discard it."
        }
      }
    }
    if ($testExit -ne 0) { throw "Smoke test failed (exit $testExit)" }
  } else {
    Write-Host 'Smoke test not run (it only runs with -RunSmokeTest, against a separate test project).'
  }

  Write-Host "`nBackend deployed: $url" -ForegroundColor Green
}

# Run from the repository root, and always return to the caller's directory (success, error or Ctrl+C).
Push-Location $root
try {
  Invoke-Deployment
} finally {
  # Shown even when a later step failed, because the link change itself has already happened.
  if ($script:relinkNotice) { Write-Warning $script:relinkNotice }
  Pop-Location
}
