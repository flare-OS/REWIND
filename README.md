# REWIND

REWIND is a browser based creator platform prototype. The frontend is a static GitHub Pages site; the Node API can run as a Render web service using `server.js` and the deployment template in `render.yaml`.

For the click-by-click custom domain walkthrough, open [`api-domain-guide.html`](api-domain-guide.html).

## Features in this build

- Account signup/login with hashed passwords and 30 day HTTP-only sessions.
- Public signup creates regular user accounts. Promote `lunastral` to Owner directly in Neon after account creation.
- Create, save, and publish places with name, description, genre, scene data, and optional icon/thumbnail.
- A combined `/editor/` scene, UI, Luau source, and animation workspace. It includes blocks, spheres, pyramids, a simple rig, move/scale controls, and Frame/TextLabel/ImageLabel/TextButton/ScreenGui insertion.
- A 3D avatar editor that saves avatar appearance.
- Owner and Asset Mod admin panels for reviewing uploaded icons, thumbnails, audio, decals, and models. Owners can assign roles.
- S3-compatible signed uploads. Neon is used for PostgreSQL data; it is not the file bucket.

Luau is stored as place source only; this build does not execute Luau. The current animation editor is a basic rig/keyframe prototype. The catalog is a moderation queue and toolbox shell, not a full public asset marketplace yet.

## Local preview and API

1. Create a Neon PostgreSQL database and run [`db/schema.sql`](db/schema.sql) in its SQL editor.
2. Fill in `.env` locally. Keep it private. Set `DATABASE_URL` and configure `CORS_ORIGINS` for the local site and your public site origins.
3. Add credentials for an S3-compatible bucket (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_PUBLIC_BASE_URL`). Configure that bucket to allow browser `PUT` requests from the frontend origins and public reads if you want approved assets to display.
4. Run `npm install`, then `npm start`. Open `http://localhost:8080`.
5. Create and log in to the `lunastral` account. In Neon SQL Editor, run `UPDATE users SET role = 'owner' WHERE username_key = 'lunastral';` to grant the Owner role. This direct database step avoids putting an owner secret in the signup endpoint or frontend.

The API needs the schema applied before signup/login will work. Local static files can open without Neon, but account features require database credentials.

## Deploy the frontend to GitHub Pages

Keep the repository's existing Pages source and custom domain (`rwd.2bd.net`). Commit and push the static site changes. The pages under `editor/`, `avatar/`, and `admin/` are ordinary static folders and work under both the custom domain and the repository Pages URL.

## Deploy the API

GitHub Pages serves HTML/CSS/JavaScript and cannot execute Node routes or protect environment variables. Deploy this repository as a Render Web Service using the root `render.yaml` Blueprint. The service runs `npm ci` and `npm start`, and serves the API at `/api/...`. Add the environment variables in Render's dashboard; copy needed values from your private `.env`, but never upload `.env`.

Render needs `DATABASE_URL`, `CORS_ORIGINS`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. The Blueprint sets `NODE_ENV=production`, the site origins, and `API_PUBLIC_URL`. `S3_PUBLIC_BASE_URL` is optional if public previews are wanted. The free Render service sleeps after 15 minutes without requests and may take about a minute to wake.

Follow [`api-domain-guide.html`](api-domain-guide.html) to assign `api.rwd.2bd.net` to Render and add the CNAME in FreeDomain.one. This requires the ability to edit DNS inside the `RWD.2BD.NET` zone; no changes are needed to the website's existing root DNS records. When the API is ready, `https://api.rwd.2bd.net/api/health` reports API/database status.

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
