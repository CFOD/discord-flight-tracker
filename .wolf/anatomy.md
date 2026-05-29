# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-05-29T17:55:02.433Z
> Files: 40 tracked | Anatomy hits: 0 | Misses: 0

## ../../../../tmp/

- `gif-bot-upload.js` — API routes: GET (4 endpoints) (~4216 tok)
- `gif-bot.js` — API routes: GET (2 endpoints) (~5516 tok)

## ../../.claude/

- `settings.local.json` (~80 tok)

## ../../.claude/plans/

- `i-want-to-find-precious-dove.md` — Fluid Map Updates via Decoupled Render & Dead Reckoning (~1945 tok)

## ../../AppData/Local/Temp/

- `gif-bot-new.js` — API routes: GET (3 endpoints) (~5154 tok)
- `gif-bot-upload.js` — API routes: GET (4 endpoints) (~4216 tok)
- `gif-bot.js` — API routes: GET (3 endpoints) (~4808 tok)

## ../../Desktop/Flight Map Backup/

- `backup.bat` (~346 tok)
- `backup.ps1` — Declares Log (~482 tok)
- `run-backup.bat` (~27 tok)

## ../../Desktop/flight-activity/src/

- `discordSdk.js` (~14 tok)
- `setupDiscord.js` — Exports discordSdk, setupDiscord (~261 tok)

## ../../Documents/GitHub/flight-activity/

- `.env` — VITE_CLIENT_ID + VITE_API_HOST. Gitignored — never committed. (~10 tok)
- `.env.example` — Documents required env vars with placeholder values. (~20 tok)
- `.gitignore` — Excludes node_modules, dist, .env, .env.* (keeps .env.example). (~75 tok)

## ../../Documents/GitHub/flight-activity/public/


## ../../Documents/GitHub/flight-activity/src/

- `App.jsx` — LoadingScreen (~598 tok)
- `discordSdk.js` — Singleton `discordSdk = new DiscordSDK(VITE_CLIENT_ID)`. (~38 tok)
- `FlightCard.jsx` — FlightCard (~675 tok)
- `FlightSidebar.jsx` — formatAlt (~1902 tok)
- `Globe.jsx` — CamDistContext (~10424 tok)
- `main.jsx` — _v (~65 tok)
- `setupDiscord.js` — Exports setupDiscord (~322 tok)
- `useFlights.js` — Exports useFlights (~473 tok)

## ./

- `patch_index.py` — Declares httpServer (~506 tok)
- `weatherRadar.js` — axios: getLatestRadarPath, fetchRadarTiles, mercY, invMercY (~803 tok)

## VPS Source (canonical): /home/admin/programmes/flight-activity/

- `deploy.sh` — Build script: runs `npm run build`, restarts `flight-tracker` PM2 process, prints confirmation URL. Executable. (~30 tok)
- `vite.config.js` — Vite 8 build config. manualChunks function splits node_modules: three+@react-three → `three-bundle`, all other node_modules → `vendor`. chunkSizeWarningLimit 1000. (~50 tok)

## VPS Source (canonical): /home/admin/programmes/flight-activity/src/

- `src/App.jsx` — Main React component. Full-viewport black div, renders Globe + FlightCard on marker click (mouse coords passed directly), "No active flights" fallback. (~80 tok)
- `src/FlightCard.jsx` — Flight detail overlay card. Positioned from browser mouse coords (x+12, y-cardH/2), clamped to viewport. Shows displayName, callsign, origin→destination, FL/speed. (~80 tok)
- `src/Globe.jsx` — Three.js / React Three Fiber globe. NASA blue-marble texture + bump map (bumpScale 0.02, roughness 0.8), atmosphere glow shader, slow auto-rotation, OrbitControls (makeDefault), FlightMarker spheres (hover scale, onClick uses e.nativeEvent). Exports `Globe` component. (~200 tok)
- `src/useFlights.js` — React hook. WS_URL is `wss://${location.host}/ws` in prod and `ws://localhost:3001/ws` in dev (import.meta.env.DEV). Auto-reconnects with exponential backoff 1s–30s. (~350 tok)

## VPS Source (canonical): /home/admin/programmes/flight-tracker-bot/

- `src/autoZoom.js` — Computes map view (centerLon, centerLat, zoom) to fit all active flights. Now handles antimeridian-crossing routes via shifted-longitude bbox. Uses `displayLat`/`displayLon` (with fallback to `lat`/`lon`) for bbox points and focus-zoom center returns. (~620 tok)
- `src/dataStore.js` — Flight state store. `getRegisteredFlights()` builds enriched flight objects with `waypoints[]` from SimBrief cache. Now stamps `fixAt: Date.now()` on both `enriched` and `lastKnownPositions` entries, and includes `speed` in lastKnownPositions. (~850 tok)
- `src/flightHistory.js` — Logs completed flights to flight-history.json (no position trail). (~200 tok)
- `src/index.js` — Main bot entrypoint. Calls `renderMap(activeFlights, ...)` on a timer. WS server on port 3001 broadcasts typed envelopes: `{ type: 'flights', flights: [...] }`, `{ type: 'atc', controllers: [...] }`, and `{ type: 'users', users: [...] }`. `broadcastUsers()` is async — fetches Discord avatar URL via `client.users.fetch` and sends discordId/displayName/color/avatar for all registered users on connect and at startup. Both call sites use `.catch(console.error)`. (~2600 tok)
- `src/mapRenderer.js` — Canvas-based map renderer (664 lines). Draws basemap, ATC sectors, route lines (waypoints from SimBrief), aircraft icons, avatars. Route drawing: lines 432–459 using pixel-space x-jump check (Math.abs(x - prevX) > IMG_W / 2) for antimeridian detection instead of lon-degree dLon check. (~4800 tok)
- `src/positionInterpolator.js` — Dead reckoning + smooth blend module. `computeDisplayPositions(flights, now)` adds `displayLat`/`displayLon` to each flight using DR forward from `fixAt`, with a 3s lerp blend on new fixes. Per-pilot state in module-level `_state` Map. (~600 tok)
- `src/projection.js` — Web Mercator projection math. `project(lat, lon, centerLat, centerLon, zoom, imgW, imgH)` handles per-point antimeridian via `dLon` wrapping but cannot split line segments. (~400 tok)

## docs/superpowers/plans/

- `2026-05-20-discord-activity-3d-globe.md` — Discord Activity — 3D Flight Globe Implementation Plan (~5126 tok)

## src/

- `Globe.jsx` — CamDistContext (~10383 tok)
