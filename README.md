# REWIND

REWIND is a browser based creator platform prototype. The frontend is a static GitHub Pages site, and the serverless Node API lives in `api/` for deployment separately (Vercel is configured in `vercel.json`).

For the click-by-click custom domain walkthrough, open [`api-domain-guide.html`](api-domain-guide.html).

## Features in this build

- Account signup/login with hashed passwords and 30 day HTTP-only sessions.
- `lunastral` can claim the Owner role only with the private owner bootstrap token.
- Create, save, and publish places with name, description, genre, scene data, and optional icon/thumbnail.
- A combined `/editor/` scene, UI, Luau source, and animation workspace. It includes blocks, spheres, pyramids, a simple rig, move/scale controls, and Frame/TextLabel/ImageLabel/TextButton/ScreenGui insertion.
- A 3D avatar editor that saves avatar appearance.
- Owner and Asset Mod admin panels for reviewing uploaded icons, thumbnails, audio, decals, and models. Owners can assign roles.
- S3-compatible signed uploads. Neon is used for PostgreSQL data; it is not the file bucket.

Luau is stored as place source only; this build does not execute Luau. The current animation editor is a basic rig/keyframe prototype. The catalog is a moderation queue and toolbox shell, not a full public asset marketplace yet.

## Local preview and API

1. Create a Neon PostgreSQL database and run [`db/schema.sql`](db/schema.sql) in its SQL editor.
2. Fill in `.env` locally. Keep it private. Set at least `DATABASE_URL`, `OWNER_USERNAME=lunastral`, and a long random `OWNER_BOOTSTRAP_TOKEN`. Configure `CORS_ORIGINS` for the local site and your public site origins.
3. Add credentials for an S3-compatible bucket (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_PUBLIC_BASE_URL`). Configure that bucket to allow browser `PUT` requests from the frontend origins and public reads if you want approved assets to display.
4. Run `npm install`, then `npm start`. Open `http://localhost:8080`.
5. Create the account `lunastral` with the same `OWNER_BOOTSTRAP_TOKEN` in the signup form. The bootstrap token is only for creating this first Owner account; never put it in frontend code or GitHub.

The API needs the schema applied before signup/login will work. Local static files can open without Neon, but account features require database credentials.

## Deploy the frontend to GitHub Pages

Keep the repository's existing Pages source and custom domain (`rwd.2bd.net`). Commit and push the static site changes. The pages under `editor/`, `avatar/`, and `admin/` are ordinary static folders and work under both the custom domain and the repository Pages URL.

## Deploy the API

GitHub Pages serves HTML/CSS/JavaScript and cannot execute Node routes or protect environment variables. Deploy this same repository (or a connected copy) as a Vercel project with the project root set to this directory. Vercel will expose the handlers in `api/` as `/api/...` routes. Set the API project's environment variables in its dashboard; copy the needed values from your private `.env` locally, but do not upload `.env`.

Set these Vercel variables: `DATABASE_URL`, `OWNER_USERNAME`, `OWNER_BOOTSTRAP_TOKEN`, `CORS_ORIGINS`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_PUBLIC_BASE_URL`. Include `https://rwd.2bd.net` and `https://flare-os.github.io` in `CORS_ORIGINS`. `COOKIE_DOMAIN` can stay blank because the session cookie belongs to the API hostname. `API_PUBLIC_URL` documents the public API origin; the frontend defaults to `https://api.rwd.2bd.net` for deployed use.

In Vercel, assign the API custom domain `api.rwd.2bd.net` and follow its DNS instructions at your DNS provider. Once the API domain is active, the existing frontend will call `https://api.rwd.2bd.net/api/...`. `https://api.rwd.2bd.net/api/health` reports API/database status.

Signed uploads require the bucket's CORS policy to allow `PUT` from `https://rwd.2bd.net` and `https://flare-os.github.io`, and to allow the `Content-Type` request header. `S3_PUBLIC_BASE_URL` should be the public base for objects if public previews are desired.

## Push changes to GitHub

From PowerShell in this directory:

```powershell
git status
git add -A
git status
git commit -m "Build REWIND creator platform"
git push origin main
```

Check the second `git status` before committing. `.env`, certificates/private keys, local logs, and local server tools are ignored by `.gitignore`; never force-add them.
