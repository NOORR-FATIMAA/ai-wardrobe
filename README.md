# Wardrobe AI (working name)

An AI personal stylist and digital wardrobe for Android and iOS. Users photograph their clothes, the AI catalogues them, and a stylist builds outfits for any occasion from what they already own. It also suggests a short list of versatile items worth buying.

## What works today (MVP)

| Feature | Where |
|---|---|
| Email sign-up / sign-in, onboarding with privacy consent | `app/src/app/sign-in.tsx`, `onboarding.tsx` |
| Style profile: styles, colours, occasions, budget, sizes, fit | `preferences.tsx`, `PreferencesForm.tsx` |
| **Scan an item → AI tags** category, colours, pattern, material, formality, seasons, occasions; user reviews and edits before saving | `item/add.tsx` → `supabase/functions/analyze-item` |
| Searchable wardrobe grid with category filters; edit, delete, "wore it today" | `(tabs)/wardrobe.tsx`, `item/[id].tsx` |
| **AI stylist**: pick an occasion or type a request ("what goes with my black trousers?"), optional weather, "style only what I own" switch, alternatives, save favourites | `(tabs)/stylist.tsx` → `supabase/functions/stylist` |
| **On-device background removal**: clothing photos are cut out on the phone (Apple Vision on iOS 17+, Google ML Kit Subject Segmentation on Android) and stored as transparent PNGs; one tap switches back to the original photo. It's free and the photo isn't sent anywhere for this. In Expo Go and on the web it's skipped automatically | `modules/subject-lifter`, `item/add.tsx` |
| **Outfit preview boards**: each outfit laid out lookbook-style from your own photos (top/one-piece, bottom, shoes, plus a side column for layers and accessories); pieces you don't own appear as dashed "not owned" tiles. The share icon sends the title and board as a PNG through the system share sheet (made on the phone; not on the web) | `OutfitBoard.tsx`, `OutfitCard.tsx`, `ShareOutfitButton.tsx` |
| **Stylist chat**: multi-turn conversation over your real wardrobe ("make the second one more casual", "what am I missing for a trip?"), with outfit cards and add-to-shopping-list inline | `assistant.tsx` → `supabase/functions/assistant` |
| **Outfit calendar & wear history**: plan any outfit for the next two weeks, "Wore it today" logs history and updates per-item wear counts; today's planned look appears on Home | `calendar.tsx`, `OutfitActions.tsx`, `log_wear()` |
| **Wardrobe insights**: share of clothes worn in the last 90 days, never-worn and "resting" pieces, and, with an optional price per item, cost per wear (best value, highest per wear, money in unworn clothes). Computed on the phone; prices are never sent to the AI | `insights.tsx`, `lib/insights.ts` |
| **Learns your taste**: thumbs up / down on any outfit. The stylist and chat see recent ratings (as item codes) and lean towards what you liked; the stylist never suggests a disliked combination again | `OutfitActions.tsx`, `lib/feedback.ts`, `outfit_feedback` table, `_shared/wardrobe.ts` |
| **Avoids repeats**: the stylist and chat see the last 7 days of wear history and each item's last-worn date | `_shared/wardrobe.ts` |
| **Smart shopping**: wardrobe gap analysis, versatile suggestions linked to owned items, "already covered" list, editable checklist | `(tabs)/shopping.tsx` → `supabase/functions/wardrobe-gaps` |
| Privacy controls: AI consent switch, delete all clothes, delete account and all photos | `(tabs)/profile.tsx` → `supabase/functions/delete-account` |
| 3D avatar / try-on | Placeholder screen + [feasibility study](docs/AVATAR_TRYON_FEASIBILITY.md) |

## Architecture

```
Expo app (React Native, TypeScript, expo-router)
   │  Supabase JS (auth session, RLS-protected queries, private storage)
   ▼
Supabase (free tier)
   ├─ Postgres: profiles, wardrobe_items, outfits, outfit_items, shopping_items, wear_log, ai_usage, ai_usage_global
   │            row-level security on every table, so users only ever see their own rows
   ├─ Storage:  private "wardrobe" bucket, one folder per user, signed URLs for display
   └─ Edge Functions (Deno), the only place the AI key exists:
        analyze-item   photo → structured clothing attributes (Gemini, image input)
        stylist        profile + wardrobe + weather → outfits (Gemini)
        wardrobe-gaps  profile + wardrobe → shopping suggestions (Gemini)
        assistant      multi-turn chat over the wardrobe (Gemini); conversation not stored
        delete-account removes photos + account (rows cascade)
   ▼
Google Gemini API (generateContent), Open-Meteo (free weather, no key)
```

How AI output is kept trustworthy:
- **Structured outputs.** Every AI call asks Gemini for JSON in the shape of a Zod schema, and every response is then validated against that same schema (`_shared/ai.ts`). Invalid or incomplete answers return a clean error rather than reaching the app.
- **No invented clothes.** The model sees wardrobe items as short codes (`i1`, `i2`, …). Returned codes are mapped back to real IDs and unknown codes are dropped (`_shared/wardrobe.ts`). Owned items and suggested purchases are separate fields.
- **Sensible outfits** (`resolveOutfits` in `_shared/outfits.ts`). Before the app sees an outfit, duplicate outfits are dropped, and so are outfits with nothing the user owns. Only the first pair of shoes is kept. The stylist also drops combinations the user asked to avoid and returns no more outfits than requested.
- **Bounded answers.** Every text field and list the AI returns has a length limit, and numbers such as formality are rounded and kept in range rather than failing the request.
- **User text is data, not instructions.** Item names, notes and profile fields go into the prompt as single lines with length limits, under a notice that they are the user's own information. At most 400 items are included in one prompt, which bounds the cost of a call.
- **Real images only.** `analyze-item` checks the photo's actual content (JPEG, PNG or WebP) and size before using any quota. The storage bucket only checks the type the uploader declared.
- **Request limits.** Request bodies over 512 KB get 413, and a body that isn't JSON gets 400. Coordinates must be valid latitude and longitude. If the sign-in service is down, the answer is 503, not "Sign in required".
- **User correction.** AI tags pre-fill an editable form and nothing is saved until the user confirms.
- **Cost guard.** `consume_ai_call()` enforces two daily limits (UTC days): one per user (`DAILY_AI_LIMIT`, default 60) and one shared by everyone (`GLOBAL_AI_DAILY_LIMIT`, no default), so many accounts can't exhaust the shared Gemini quota. Each chat message counts as one call.
  - **Order of checks.**
    - Sign-in and the request body are checked first.
    - Then come the AI limit settings and the user's AI consent, before any profile, wardrobe or photo data is loaded or the weather service is called.
    - A call is reserved only right before the Gemini request, so requests that fail earlier (bad input, empty wardrobe, missing photo) use no quota.
    - Once the Gemini request has been attempted, the call counts even if it fails.
  - **Rejected calls use nothing.** A call rejected by either limit changes neither counter.
  - **Fails closed.** If `GLOBAL_AI_DAILY_LIMIT` is missing, empty or not a whole number, or `DAILY_AI_LIMIT` is set to something other than a whole number, AI features return 503 straight after sign-in. Nothing else is read, and neither the quota function nor Gemini is called.
  - **Switching AI off.** Setting either limit to `0` is a valid setting: requests are then refused with 429 when the call would be reserved, so Gemini is never called.
  - **Server only.** Only the service role can call `consume_ai_call` or read the global counter; the Edge Functions call it with the verified user's id.
- **Consent.** Functions refuse to run unless the user has enabled AI processing.

## Setup

Prerequisites: Node 20+, a free [Supabase](https://supabase.com) project, a [Gemini API key](https://aistudio.google.com/apikey) from Google AI Studio, and the Expo Go app on your phone.

### 1. Backend (hosted Supabase, free tier)

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). Note the **project ref** (from the URL) and the **database password** you chose.
2. Sign in the CLI once: `npx supabase login` (opens your browser).
3. Deploy (PowerShell, from the repo root):

```powershell
./scripts/deploy-backend.ps1 -ProjectRef <project-ref> -GlobalAiDailyLimit <calls-per-day>
```

The script asks for the database password and the Gemini key with hidden input. Press Enter at the Gemini prompt to leave the existing secret unchanged. Secrets are never accepted as plain-text parameters. Instead you can set `SUPABASE_DB_PASSWORD` / `GEMINI_API_KEY` in the environment, or pass a SecureString such as `-DbPassword (Read-Host -AsSecureString)`.

**Checks before anything changes.** The script stops, with nothing changed, when:
- **The CLI is linked elsewhere.** This folder's Supabase CLI is linked to a different project, or to none. Pass `-Relink` to link it to `-ProjectRef`; it warns, then tells you at the end how to switch back. Commands that use `--linked` follow that link.
- **AI would be left answering 503.** `GLOBAL_AI_DAILY_LIMIT` (the project-wide daily cap, sized to your Gemini quota) must be given with `-GlobalAiDailyLimit` or already exist as a function secret. The same goes for the Gemini key, unless `-GlobalAiDailyLimit 0` switches AI off. Only secret names are read; values are never read or printed.

**What it then does:**
- shows a **dry run** of the pending migrations and applies them only after you type `yes`. Migrations add or replace tables, functions, constraints and policies; none of them drops or resets data.
- stores the given function secrets (`GEMINI_API_KEY`, `GLOBAL_AI_DAILY_LIMIT`). The Gemini key is server-side only, and is never written to `app/.env.local` or sent to the app. The secrets pass through a temporary file in a folder only you can access. The file is overwritten and deleted on success, error or Ctrl+C, and any copy left by a force-closed window is removed on the next run.
- deploys the 5 Edge Functions without Docker.
- updates `app/.env.local` with the project URL and publishable key, keeping all your other lines. If the file already has different values, it asks first and saves `app/.env.backup-<time>.local` before changing anything.

**The smoke test is opt-in and for a separate test project only.** It creates and deletes two test users and uses up some of the day's AI quota counters, so a normal deployment doesn't run it. To run it after deploying:
- **Command:** `-RunSmokeTest -ConfirmTestProjectRef <same-project-ref>`.
- **Confirmation:** a typed `yes` to "is this a separate TEST project?". The script never decides by itself that a project is a test project.
- **No AI calls by default.** Add `-LiveAiSmokeTest` to also send one stylist request with test data to Gemini (free tier: Google may use it to improve its products).
- **Old commands still work.** `-SkipTests` is no longer needed and is ignored.

Without a terminal to prompt in (for example in CI), the script stops rather than assuming "yes" for migrations, the smoke test or `.env.local` changes.

Optional extras: `npx supabase secrets set GEMINI_MODEL=<model-id> DAILY_AI_LIMIT=30`.

For testing sign-up in the app, you can turn off **Authentication → Providers → Email → Confirm email** in the dashboard (turn it back on before real users). The smoke test doesn't need this.

### Production: read-only checks before applying the pending migrations

Run this in the production project's **SQL Editor** before deploying the pending migrations: the four dated `20261028` (wear-log ownership, global AI quota, photo-path format, photo-path update policy) `20261106000000` (optional item purchase price) and `20261107000000` (outfit feedback).
- **It is read-only.** It is a single `SELECT` over system catalogs and a few counts. It changes nothing and returns no customer rows: only names, settings and numbers.
- **One table, one row per check.** The SQL Editor shows only the last statement's result, so everything is in one query.

```sql
with checks (check_name, expected, actual) as (
  values
    ('PostgreSQL version (SET NULL with a column list needs 15+)', '15 or later',
     case when current_setting('server_version_num')::int >= 150000 then '15 or later'
          else current_setting('server_version') end),
    ('Applied migrations', '20261026000000, 20261027000000',
     (select string_agg(version, ', ' order by version) from supabase_migrations.schema_migrations)),
    ('wardrobe storage policies',
     'wardrobe delete own: DELETE using; wardrobe insert own: INSERT check; wardrobe read own: SELECT using; wardrobe update own: UPDATE using',
     (select string_agg(policyname || ': ' || cmd
                        || case when qual is not null then ' using' else '' end
                        || case when with_check is not null then ' check' else '' end,
                        '; ' order by policyname)
        from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname like 'wardrobe %')),
    ('wardrobe storage policy roles', 'authenticated',
     (select string_agg(distinct array_to_string(roles, ','), '; ')
        from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname like 'wardrobe %')),
    ('consume_ai_call signatures', 'consume_ai_call(integer)',
     (select string_agg(proname || '(' || oidvectortypes(proargtypes) || ')', ', ' order by oidvectortypes(proargtypes))
        from pg_proc where pronamespace = 'public'::regnamespace and proname = 'consume_ai_call')),
    ('log_wear signatures', 'log_wear(uuid[], uuid, date)',
     (select string_agg(proname || '(' || oidvectortypes(proargtypes) || ')', ', ' order by oidvectortypes(proargtypes))
        from pg_proc where pronamespace = 'public'::regnamespace and proname = 'log_wear')),
    ('wear_log foreign keys (the outfit one is replaced)', 'wear_log_outfit_id_fkey, wear_log_user_id_fkey',
     (select string_agg(conname::text, ', ' order by conname)
        from pg_constraint where conrelid = 'public.wear_log'::regclass and contype = 'f')),
    ('Names the new migrations create (must be free)', '(none)',
     coalesce((select string_agg(taken, ', ' order by taken) from (
        select conname::text as taken from pg_constraint
         where connamespace = 'public'::regnamespace
           and conname in ('outfits_id_user_id_key', 'wear_log_outfit_owner_fkey', 'wardrobe_items_image_path_format',
                           'wardrobe_items_purchase_price_range')
        union
        select relname::text from pg_class
         where relnamespace = 'public'::regnamespace
           and relname in ('ai_usage_global', 'outfits_id_user_id_key', 'wear_log_outfit_idx',
                           'outfit_feedback', 'outfit_feedback_combo_key')
        union
        select proname::text || '()' from pg_proc
         where pronamespace = 'public'::regnamespace and proname = 'outfit_feedback_normalize'
        union
        select 'wardrobe_items.' || attname from pg_attribute
         where attrelid = 'public.wardrobe_items'::regclass and attname = 'purchase_price' and not attisdropped) names), '(none)')),
    ('wear_log rows pointing at another user''s outfit', '0',
     (select count(*)::text from public.wear_log w
        join public.outfits o on o.id = w.outfit_id
       where o.user_id <> w.user_id)),
    ('wardrobe_items.image_path values in the wrong format', '0',
     (select count(*)::text from public.wardrobe_items
       where image_path is not null
         and image_path !~ ('^' || user_id::text || '/[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$'))),
    ('wardrobe bucket', 'private, 5242880 bytes, image/jpeg,image/png,image/webp',
     coalesce((select case when public then 'PUBLIC' else 'private' end || ', '
                      || coalesce(file_size_limit::text, 'no limit') || ' bytes, '
                      || coalesce(array_to_string(allowed_mime_types, ','), 'any type')
                 from storage.buckets where id = 'wardrobe'), '(missing)')),
    ('All storage buckets', 'wardrobe',
     (select string_agg(id || case when public then ' (public)' else '' end, ', ' order by id) from storage.buckets)),
    ('Stored photos named outside the format', 'informational',
     (select count(*)::text from storage.objects
       where bucket_id = 'wardrobe'
         and name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$'))
)
select check_name, expected, coalesce(actual, '(null)') as actual,
       case when expected = 'informational' then null else expected = coalesce(actual, '(null)') end as as_expected
from checks;
```

**Expected result:** `as_expected` is `true` on every row except the last, which is informational.

**Any `false` row means stop and investigate before migrating.** Each is a different problem:
- **Version below 15:** the wear-log migration cannot be applied.
- **Different applied migrations:** the history differs from this repository.
- **Missing or changed `wardrobe` policies:** the photo-path migrations drop and recreate policies by these exact names.
- **Extra or missing function signatures:** the quota migration drops exactly `consume_ai_call(integer)`.
- **A different wear-log foreign key name:** the ownership migration drops `wear_log_outfit_id_fkey` by name.
- **A name that is already taken:** creating that constraint, index, table or column would fail, and an existing `outfit_feedback_normalize()` would be silently replaced.
- **A non-zero data count:** the matching migration stops on purpose and changes nothing.
  - The photo-path migration's error includes a hint with a query that lists the affected rows.
  - For wear-log rows, the count query above shows the join to start from.
  - Review the affected rows privately before deciding what to do.
- **A public bucket, other limits, or unexpected buckets:** these don't stop a migration, but they affect photo privacy.

**The last row is informational.** It counts photos already in storage whose names don't follow `<user id>/<name>.<jpg|jpeg|png|webp>`. The new policies only affect new uploads and updates, so these objects don't stop any migration and are left as they are. They are still readable and deletable by their owners.

**A test project doesn't vouch for production.** A test project created from these migrations starts empty, so its clean result says nothing about production's data, policy history or dashboard changes. Always run the check against production itself.

### 2. App

```bash
cd app
cp .env.example .env.local     # fill in your project URL and publishable (anon) key
npm install
npx expo start                 # scan the QR code with Expo Go
```

Checks: `npm run typecheck`, `npm run lint`, `npx expo-doctor`.

**Expo Go vs. development build.** Everything runs in Expo Go except background removal, which uses a local native module (`app/modules/subject-lifter`). To get it, build a development client once:

```bash
cd app
npx eas-cli@latest login                     # free Expo account
npx eas-cli@latest build --profile development --platform android   # cloud build; install the APK from the link it prints
npx expo start --dev-client                  # then open the installed app; it loads your code from this PC
```

The `development` profile in `app/eas.json` builds an installable APK. iOS builds need an Apple Developer account. `npx expo run:android` builds locally instead, but needs Android Studio and 3–4 GB of free RAM.

### Local backend (optional, for development and tests)

With Docker Desktop running, you can run the whole backend on your machine instead of a hosted project:

```bash
npx supabase start -x vector,logflare     # Postgres, auth, storage, Studio at http://127.0.0.1:54323
npx supabase functions serve --env-file supabase/functions/.env   # .env holds GEMINI_API_KEY=... (git-ignored)
```

Point the app at it by setting `EXPO_PUBLIC_SUPABASE_URL=http://<your-PC-LAN-IP>:54321` and the local anon key from `npx supabase status`. Your phone can't reach `127.0.0.1` on your PC, so use the LAN IP.

Backend smoke test (40 checks: row-level security, wear-log outfit ownership, AI quota limits including concurrent calls, storage isolation and photo path rules, SQL functions, Edge Function guards, account deletion). Run it only against a local stack or a separate test project, never the production project: it creates users and uses up AI quota counters for the day. `LIVE_AI=1` also needs `GLOBAL_AI_DAILY_LIMIT` set for the functions. It needs `SERVICE_ROLE_KEY` (included in `supabase status -o env`). It always deletes the two `smoke-…@example.test` users it creates, even if a check fails, the run aborts, or you press Ctrl+C. Any cleanup failure is listed and makes the run fail:

```bash
npx supabase status -o env | Out-File -Encoding utf8 supabase/.env.test     # PowerShell; use > in bash
npx deno@2.9.6 run -A --env-file=supabase/.env.test supabase/tests/smoke_test.ts
# no AI calls by default; add LIVE_AI=1 to also check a real stylist response (sends test data to Gemini)
```

Offline unit tests: no Supabase, no network, no API key.

```bash
cd supabase
npx deno@2.9.6 test -A tests/ai_test.ts tests/http_test.ts tests/smoke_cleanup_test.ts tests/quota_test.ts tests/privacy_test.ts tests/ai_access_test.ts tests/backend_hardening_test.ts
```

Deploy script, offline (PowerShell, from the repo root). It runs a copy of the script in a throwaway folder with fake `npx` and `Read-Host`. Nothing reaches Supabase, and your `app/.env.local` and CLI link are untouched:

```powershell
powershell -NoProfile -File scripts/tests/deploy-backend.tests.ps1
```

- `privacy_test.ts` checks photo path validation (traversal, nested folders, odd characters, extensions), that the SQL and TypeScript path rules match, the bounded photo cleanup used by account deletion and "Delete all clothes" (nested folders, paging, failed or repeated results, never outside the user's folder), and that cached photo URLs never carry over to another account on the same device.
- `ai_access_test.ts` runs the four AI functions' real handlers against a local mock of Supabase and Gemini (other outbound requests are blocked). It checks:
  - misconfigured limits answer 503 right after sign-in, without reading data or calling the weather service, the quota function or Gemini;
  - consent is checked before any data is loaded;
  - an auth outage answers 503 and a rejected token 401;
  - oversized inputs and non-image files are refused before quota is used;
  - user notes reach the prompt as flattened data;
  - AI answers are cleaned up before the app sees them (owned items only, no duplicates or avoided looks, bounded text).
- `backend_hardening_test.ts` unit-tests the helpers behind those rules: request size limits, prompt text cleaning, the wardrobe query's owner filter and 400-item cap, forecast validation, coordinate limits and image type detection.
- `quota_test.ts` checks the AI limit settings (fail closed when missing or invalid), how quota results map to responses, and that each AI function checks consent first and reserves quota right before calling Gemini. The SQL itself is covered by the smoke test.
- `ai_test.ts` points the Gemini SDK at a local mock server. It checks the request format, schema validation, and how blocked, truncated, rate-limited and failed responses are handled.
- `http_test.ts` checks that invalid request bodies return 400.
- `smoke_cleanup_test.ts` checks the smoke test's user cleanup against a fake admin client: it removes only the users that run created, reports every failure, and never echoes secrets.

## AI model and cost

The functions call Google's Gemini API (`generateContent`) through the official `@google/genai` SDK, pinned to 2.31.0.

- **Default model:** `gemini-3.8-flash`. Google's model page lists it as stable, with image input, structured outputs and thinking levels low/medium/high, and the pricing page lists a free tier for it.
- **Changing the model:** set the `GEMINI_MODEL` secret; no code change is needed. Check that a replacement model supports image input and structured outputs.
- **Thinking level:** `low` for tagging photos and `medium` for styling, gap analysis and chat. It's only sent to Gemini 3+ models.
- **No automatic retries:** if Gemini rate-limits a request (likely on the free tier), the user gets a "busy, try again" message straight away.
- **No fallback model:** if Gemini declines a request, the user is asked to rephrase. There is no automatic retry on another model.
- **No prompt caching:** the stable part of the system prompt (rules and wardrobe) is sent first, but no caching is configured or assumed.

Check Google's [pricing page](https://ai.google.dev/gemini-api/docs/pricing) for current free-tier limits and paid rates. Supabase's free tier (database, 1 GB storage, Edge Functions) covers development and a class demo. Photos are resized to 1024px JPEG (~150 KB), or a PNG cut-out, before upload.

## Privacy notes

- Photos are resized and re-encoded on the device, which removes EXIF metadata such as GPS location, then stored in a private bucket readable only by the owner.
  - Photo paths must be `<user id>/<name>.<jpg|jpeg|png|webp>`, one folder deep. The storage upload and update policies, the `wardrobe_items.image_path` constraint and `analyze-item` all enforce this format.
  - The app's cache of signed photo URLs is cleared whenever the signed-in account changes.
- Location for weather is requested only when the user switches it on. It's rounded to about 1 km, sent to Open-Meteo for that request only, and never stored.
- Body photos are **not** collected. A separate `consent_body_photos` flag is reserved for the future avatar feature.
- Edge Functions log only error status, never photos or wardrobe contents.
- **Gemini free tier, read before real users.** Under Google's [Gemini API terms](https://ai.google.dev/gemini-api/terms), content sent to the free ("unpaid") tier, including images, may be used to improve Google's products and AI, and human reviewers may read it. Google also says not to send sensitive, confidential or personal information to the free tier. The onboarding and profile screens say this. On the paid tier, Google says it doesn't use prompts or responses to improve its products.
  - **Development only:** use the free tier only for development and testing with your own data, and switch to the paid tier (and update the in-app text) before real users.
  - **Region:** users in the EEA, UK and Switzerland may only be served on paid services.
  - **Age:** the terms require users to be 18 or older, and the app must not be aimed at under-18s.
- Before launch: write a privacy policy, add an in-app data export, and confirm the AI provider's data-use terms match what the onboarding screen says.

## Roadmap

1. **Done:** background removal, sharing an outfit board as an image, likes/dislikes on outfits.
2. **Then:** travel capsule planner (trip dates + weather → packing list and daily outfits). (Cost-per-wear and never-worn insights are done.)
3. **Avatar & try-on:** see [docs/AVATAR_TRYON_FEASIBILITY.md](docs/AVATAR_TRYON_FEASIBILITY.md). Start with a measurement-based avatar, then 2D try-on images.
4. **Commercial:** retailer links / affiliate APIs on shopping suggestions, app store builds via EAS (`npx eas-cli@latest build`).

## Project layout

```
app/                    Expo app (see app/AGENTS.md for Expo conventions)
  src/app/              screens (expo-router: every file is a route)
  src/components/       shared UI: design system, item/outfit cards, forms
  src/lib/              Supabase client, API calls, data provider, theme, types
supabase/
  migrations/           schema, RLS policies, storage bucket
  functions/            Edge Functions + _shared helpers
docs/                   feasibility research
```
