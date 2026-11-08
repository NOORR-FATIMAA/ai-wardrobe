# Website

The public website: a landing page (`index.html`), a privacy policy and terms of use, and, at
`/app/`, the web version of the app. Plain HTML and CSS with no build step; colours match the app's
theme. The screenshots in `assets/` are of the app's demo mode.

## Publishing on GitHub Pages

`.github/workflows/deploy-website.yml` builds the web app, places it under `/app/`, and publishes it
with these pages on every push to `main` that touches `website/` or `app/`.

One-time setup in the GitHub repository:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → Variables**, add:
   - `EXPO_PUBLIC_SUPABASE_URL`: the project URL (`https://<project-ref>.supabase.co`).
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the project's publishable key. It is public by design
     (it ships inside every copy of the app); row level security protects the data. Never use the
     service-role / secret key here.
   - Optional `CUSTOM_DOMAIN`: leave unset for `https://<user>.github.io/<repository>/`; set it to
     `true` when the site is served from the root of a custom domain.
3. Push to `main`, or run the workflow from the **Actions** tab.
4. In Supabase, **Authentication → URL Configuration**: set the Site URL to the website's `/app/` address
   and add it to the redirect URLs, so sign-up confirmation links lead back to the web app.

Which Supabase project the public web app uses is decided by these variables: point them at the
production project once it is deployed (they currently would point wherever you set them).

## Before launch

`privacy.html` and `terms.html` are drafts with highlighted placeholders (operator name, contact,
Supabase region, which Gemini plan is used). Complete them, remove the draft notices, and have them
reviewed. The privacy policy describes what the code does today; update it when data handling changes.

## Previewing locally

```powershell
cd app
$env:EXPO_PUBLIC_DEMO_MODE = '1'; $env:EXPO_BASE_URL = '/app'
npx expo export --platform web --output-dir ../_site/app
cd ..; Copy-Item -Recurse website/* _site/
npx serve _site   # or any static server; open http://localhost:3000
```
