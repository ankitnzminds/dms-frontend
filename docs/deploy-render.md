# Deploying the web app on Render

The web app is one Docker web service (`dms-web`) defined in [`render.yaml`](../render.yaml). It tracks
`main` and **redeploys automatically on every push or merge to `main`**.

It needs the API first (see the backend repo, `docs/operations/deploy-render.md`). Deploy in this order:

1. **Backend Blueprint** first. Note the API URL it gets, e.g. `https://dms-api.onrender.com`.
2. **This Blueprint** (below).
3. Go back to the backend service `dms-api` and set `CORS_ALLOWED_ORIGINS` and `WEB_BASE_URL` to this
   app's URL (e.g. `https://dms-web.onrender.com`), then redeploy the API.

## Create it

1. Push this repo to GitHub (Render cannot read a self-hosted GitLab).
2. Render dashboard > **New > Blueprint** > pick this repo > branch `main`.
3. Fill the three values Render asks for:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | API URL **with** the prefix: `https://dms-api.onrender.com/api/v1` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's publishable (anon) key |

4. Click **Apply**. The first build takes a few minutes.

## Good to know

- `NEXT_PUBLIC_*` values are baked into the browser bundle at build time. Changing one in the dashboard
  needs a new deploy (use **Clear build cache & deploy**).
- The image always builds with `NEXT_PUBLIC_AUTH_MODE=supabase`; the development sign-in is refused in
  production builds by design.
- Supabase: add the web app URL under Authentication > URL configuration (Site URL and redirect URLs).
- The office viewer (Collabora) is off unless you host it and set `OFFICE_FRAME_SRC`; PDFs, images and
  text open without it.
- Auto-deploy follows the **GitHub** repo Render is connected to. Pushing only to GitLab does not
  trigger it; mirror GitLab to GitHub, or call the service's *Deploy Hook* URL from GitLab CI.
