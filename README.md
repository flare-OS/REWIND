# REWIND

REWIND is a browser based creator platform prototype. The frontend is a static GitHub Pages site; the Node API can run as a Render web service using `server.js` and the deployment template in `render.yaml`.

Legal pages are published at [`privacy.html`](privacy.html), [`terms-of-service.html`](terms-of-service.html), and [`terms-of-use.html`](terms-of-use.html). The contact email is `sosozouzou130@gmail.com`; the postal code is 39000, France. Active service regions still need confirmation.

## Features in this build

- Account signup/login with hashed passwords, 30 day HTTP-only sessions, and a 13+ age check.
- 13- and 14-year-old accounts can request approval from a linked 15+ supervisor account. Creators can mark places as requiring approved supervision.
- Public signup creates regular user accounts. The schema promotes `lunastral` to Owner when it is applied after that account exists; Owner can also assign roles in the admin panel.
- Create, save, and publish places with name, description, genre, scene data, and optional icon/thumbnail.
- The previous browser studio is preserved at `/archive/editor/`; `/editor/` is now an informational landing page. A separate Windows application is in the sibling `Editor/` folder with local 3D scene editing, project file open/save, object properties, and a basic physics playtest.
- A 3D avatar editor that saves avatar appearance.
- Owner and Asset Mod admin panels for reviewing uploaded icons, thumbnails, audio, decals, and models. Owners can assign roles.
- S3-compatible signed uploads. Neon is used for PostgreSQL data; it is not the file bucket.
- Separate Games, Creator Catalog, News, Experiences, Plans, Upload, and Reports pages. Published public places can be played in the browser at `/play/?id=<place-id>` with W/Z forward, S backward, D right, Q/A left, and Space to jump; News posts can be published by Owner and Asset Mod accounts with REWIND Open Graph share previews.
- Public creator profiles are available at `/users/<user-id>` and show account-safe public details and published public experiences.
- Experience privacy settings, friends-only access, a 12-day activity feed, Orb-priced gamepasses, and experience badges.
- Owner controls to grant Orbs and change a user's plan.

The desktop application uses a Studio-like ribbon, 3D viewport, Toolbox, Explorer, Properties, and Output panels. It saves `.rwdproj` files on the local computer and provides an F5 playtest with basic character movement, jumping, and collisions. Its Luau console runs in an isolated WebAssembly worker; child scripts can handle UI button activation, and playtest scripts can change preview objects and local leaderstats. This is an API subset rather than Roblox engine compatibility: script effects are local to the playtest and are discarded when it stops. There is no authoritative server or synchronized multiplayer script execution.

## Local preview and API

1. Create a Neon PostgreSQL database and run [`db/schema.sql`](db/schema.sql) in its SQL editor. If upgrading an existing database, run the updated schema again to add all newer columns and tables for plans, privacy, friendships, activity, gamepasses, purchases, badges, reports, and News.
2. Fill in `.env` locally. Keep it private. Set `DATABASE_URL` and configure `CORS_ORIGINS` for any additional exact site origins. The API already allows `https://rwd.2bd.net`, `https://www.rwd.2bd.net`, and `https://flare-os.github.io`.
3. Configure an S3-compatible bucket (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`). The API also accepts Neon's standard `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` names; `S3_BUCKET` is still required. For Neon Object Storage, use the endpoint and storage credential for the same branch as `DATABASE_URL`. The API creates short-lived read URLs for approved assets, so the bucket can remain private; `S3_PUBLIC_BASE_URL` is optional. Configure bucket CORS to allow browser `PUT` requests from the frontend origins, and `GET` requests if browser previews (especially 3D models) need cross-origin reads.
4. Run `npm install`, then `npm start`. Open `http://localhost:8080`. Do not use a static-only Live Server for the API routes.
5. Create and log in to the `lunastral` account. In Neon SQL Editor, run `UPDATE users SET role = 'owner' WHERE username_key = 'lunastral';` to grant the Owner role. This direct database step avoids putting an owner secret in the signup endpoint or frontend.
6. Existing accounts created before age collection have no date of birth on file. Sign in, open **Family supervision**, and add an age before using age-gated features or approving a link.

The API needs the schema applied before signup/login will work. Local static files can open without Neon, but account features require database credentials.

The browser place player supports Studio v2 primitives, materials, transforms, visibility, model assets, StarterGui items, spawn points, camera parts, lighting, sky/fog settings, stars, exposure, and bloom. Movement uses raycast ground/ceiling checks, step-up handling, gravity, jumping, and axis-resolved anchored-object colliders. Published Luau scripts execute in a dedicated browser worker with a bounded Roblox-shaped API subset; object changes, UI button events, and leaderstats are local to the current browser and are neither shared nor authoritative. This is a preview sandbox, not full Roblox engine compatibility or a server runtime. Model and image references retain approved asset IDs so the player can request fresh private-bucket preview URLs instead of relying on expired signed URLs.

## Deploy the frontend to GitHub Pages

Keep the repository's existing Pages source and custom domain (`rwd.2bd.net`). Commit and push the static site changes. The `editor/` route is a landing page and the archived browser workspace is at `archive/editor/`. The separate desktop application in the sibling `Editor/` folder is not included in the GitHub Pages build.

## Deploy the API

GitHub Pages serves HTML/CSS/JavaScript and cannot execute Node routes or protect environment variables. Deploy this repository as a Render Web Service using the root `render.yaml` Blueprint. The service runs `npm ci` and `npm start`, and serves the API at `/api/...`. Add the environment variables in Render's dashboard; copy needed values from your private `.env`, but never upload `.env`.

Render needs `DATABASE_URL`, `CORS_ORIGINS`, `S3_BUCKET`, and S3-compatible endpoint, region, and read/write credentials. The Blueprint uses `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`; Neon's standard `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` names are also accepted. Use a Neon storage credential with `storage:read` and `storage:write` scopes. The Blueprint sets `NODE_ENV=production`, the site origins, and `API_PUBLIC_URL`. `S3_PUBLIC_BASE_URL` is optional because the API signs reads for private buckets. The free Render service sleeps after 15 minutes without requests and may take about a minute to wake.

Assign `api.rwd.2bd.net` to Render using the CNAME shown in the Render dashboard and configure that record in FreeDomain.one. This requires the ability to edit DNS inside the `RWD.2BD.NET` zone; no changes are needed to the website's existing root DNS records. When the API is ready, `https://api.rwd.2bd.net/api/health` reports API/database status.

Signed uploads require the bucket's CORS policy to allow `PUT` from `https://rwd.2bd.net` and `https://flare-os.github.io`, and to allow the `Content-Type` request header. Browser previews from Neon Object Storage may also need bucket CORS to allow `GET` from those origins. Set `S3_PUBLIC_BASE_URL` only when using stable public object URLs; without it, the API provides one-hour presigned read URLs for approved assets.

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

The website backend still has no authoritative real-time simulation, avatar replication, or server Luau runtime. The browser player executes scripts in a local sandbox, including scripts authored as server scripts, but no server-side effects are trusted or synchronized to other players. The new Windows editor is a separate local prototype; its playtest simulates simple movement and collisions but does not provide authoritative multiplayer. The desktop project files remain on the user-selected disk unless the creator separately uploads or publishes content through REWIND. Marketplace and badge APIs are REWIND prototypes and do not connect to Roblox or process real-money payments.
