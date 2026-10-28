# REWIND

REWIND is a browser based creator platform prototype. The frontend is a static GitHub Pages site; the Node API can run as a Render web service using `server.js` and the deployment template in `render.yaml`.

Legal pages are published at [`privacy.html`](privacy.html), [`terms-of-service.html`](terms-of-service.html), and [`terms-of-use.html`](terms-of-use.html). The contact email is `sosozouzou130@gmail.com`; the operator mailing address and active service regions still need confirmation.

## Features in this build

- Account signup/login with hashed passwords, 30 day HTTP-only sessions, and a 13+ age check.
- 13- and 14-year-old accounts can request approval from a linked 15+ supervisor account. Creators can mark places as requiring approved supervision.
- Public signup creates regular user accounts. The schema promotes `lunastral` to Owner when it is applied after that account exists; Owner can also assign roles in the admin panel.
- Create, save, and publish places with name, description, genre, scene data, and optional icon/thumbnail.
- A combined `/editor/` scene, UI, Luau source, and animation workspace. It includes blocks, spheres, pyramids, a simple rig, move/scale controls, and Frame/TextLabel/ImageLabel/TextButton/ScreenGui insertion.
- A 3D avatar editor that saves avatar appearance.
- Owner and Asset Mod admin panels for reviewing uploaded icons, thumbnails, audio, decals, and models. Owners can assign roles.
- S3-compatible signed uploads. Neon is used for PostgreSQL data; it is not the file bucket.
- Separate Games, Experiences, Plans, Upload, and Reports pages; the home page adds an authenticated creator feed and an approved community asset catalog.
- Experience privacy settings, friends-only access, a 12-day activity feed, Orb-priced gamepasses, and experience badges.
- Owner controls to grant Orbs and change a user's plan.

The combined studio keeps the 3D scene and UI canvas visible together. Right-click the viewport to insert parts, interface objects, or script templates. Studio is blocked on phone-sized/coarse-touch screens. Luau Web 1.5.1 runs client source in a separate WebAssembly worker with a five-second limit. The suggestion list includes REWIND service-shaped snippets for players, data stores, badges, gamepasses, and leaderstats; these names do not connect to Roblox, and ServerScripts save as source but do not execute. The current animation editor is a basic rig/keyframe prototype.

## Local preview and API

1. Create a Neon PostgreSQL database and run [`db/schema.sql`](db/schema.sql) in its SQL editor. If upgrading an existing database, run the updated schema again to add all newer columns and tables for plans, privacy, friendships, activity, gamepasses, purchases, badges, and reports.
2. Fill in `.env` locally. Keep it private. Set `DATABASE_URL` and configure `CORS_ORIGINS` for any additional exact site origins. The API already allows `https://rwd.2bd.net`, `https://www.rwd.2bd.net`, and `https://flare-os.github.io`.
3. Add credentials for an S3-compatible bucket (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_PUBLIC_BASE_URL`). Configure that bucket to allow browser `PUT` requests from the frontend origins and public reads if you want approved assets to display.
4. Run `npm install`, then `npm start`. Open `http://localhost:8080`. Do not use a static-only Live Server for the API routes.
5. Create and log in to the `lunastral` account. In Neon SQL Editor, run `UPDATE users SET role = 'owner' WHERE username_key = 'lunastral';` to grant the Owner role. This direct database step avoids putting an owner secret in the signup endpoint or frontend.
6. Existing accounts created before age collection have no date of birth on file. Sign in, open **Family supervision**, and add an age before using age-gated features or approving a link.

The API needs the schema applied before signup/login will work. Local static files can open without Neon, but account features require database credentials.

## Deploy the frontend to GitHub Pages

Keep the repository's existing Pages source and custom domain (`rwd.2bd.net`). Commit and push the static site changes. The pages under `editor/`, `avatar/`, and `admin/` are ordinary static folders and work under both the custom domain and the repository Pages URL.

## Deploy the API

GitHub Pages serves HTML/CSS/JavaScript and cannot execute Node routes or protect environment variables. Deploy this repository as a Render Web Service using the root `render.yaml` Blueprint. The service runs `npm ci` and `npm start`, and serves the API at `/api/...`. Add the environment variables in Render's dashboard; copy needed values from your private `.env`, but never upload `.env`.

Render needs `DATABASE_URL`, `CORS_ORIGINS`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. The Blueprint sets `NODE_ENV=production`, the site origins, and `API_PUBLIC_URL`. `S3_PUBLIC_BASE_URL` is optional if public previews are wanted. The free Render service sleeps after 15 minutes without requests and may take about a minute to wake.

Assign `api.rwd.2bd.net` to Render using the CNAME shown in the Render dashboard and configure that record in FreeDomain.one. This requires the ability to edit DNS inside the `RWD.2BD.NET` zone; no changes are needed to the website's existing root DNS records. When the API is ready, `https://api.rwd.2bd.net/api/health` reports API/database status.

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

## Orbs, creator plans, reports, and server scripts

Run the updated `db/schema.sql` against the same Neon database used by the API before deploying these changes. It adds plan balances, report records, experience data, script storage, multiplayer presence, and runtime tracking; it also promotes an existing `lunastral` account to `owner`. Create the `lunastral` account first, then run the schema migration so it receives full owner permissions. Public signup does not grant elevated roles based on a claimed username.

`GET /api/account` grants the once-per-UTC-day 5 Orb sign-in bonus plus the active plan allowance. `POST /api/account` supports `upgrade` (Orb or lifetime playtime threshold), `playtime` (heartbeat accounting), and `report`. `GET /api/multiplayer?placeId=...` and its `heartbeat` action provide basic live player counts. The `save_script` action stores LocalScript/ServerScript source. `get` and `set` actions provide bounded per-experience JSON key-value storage for leaderboards and similar prototypes. The new `/api/friends`, `/api/experiences`, and `/api/monetization` routes manage friend links, experience activity, gamepasses, and badges; gamepass Orbs and ownership are committed atomically.

This is an early backend foundation: presence counts and persistence are available, but there is no authoritative real-time simulation, avatar replication, or sandboxed server Luau runtime yet. Server scripts are saved as source and do not execute. The browser must not be treated as trusted for game state. Friend requests and limits exist, but there is no standalone profile page or friend removal workflow yet. Marketplace and badge APIs are prototype features and do not connect to Roblox or process real-money payments.
