# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Last updated: 2026-05-02

## User Preferences

## Key Learnings

- Bot runs as PM2 process named `flight-tracker` (id 0), not `flight-tracker-bot`
- 8 tracked users in users.json; several have placeholder `"id-here"` for unused networks (Elevatex/Skyteam fields not fully filled for all users)
- Source priority order for deduplication: Volanta > Elevatex > Vatsim > Skyteam
- SimBrief cache TTL is 10 minutes; fetched for all users on every renderAndPost cycle
- Auto-suppression: if pilot on ground (speed < 50kts) and > 30 NM from filed origin, SimBrief route is suppressed (persisted to suppressed-routes.json)
- Suppression auto-clears when a new SimBrief plan is detected (origin-dest key changes)
- Map updates every 20 seconds; focus mode lasts 60 seconds (3 cycles) then auto-expires
- VATSIM polled every 30s; Volanta/Elevatex/Skyteam every 60s
- ATC sectors (VATSIM Boundaries.geojson + VATSpy.dat) refreshed every 24h
- Aircraft icons fetched from vatsim-radar.com CDN (w_50 PNG), tinted yellow (#f0cb00), with A320 as fallback
- Canvas output is 2560x1440 (2x scale of 1280x720 logical), Mapbox @2x basemap fills it exactly
- Weather radar from RainViewer API at zoom level 3
- Flight history is append-only JSON; stats.js reads it fresh from disk every call (no in-memory cache)
- stats.js functions (getLeaderboard, getPersonalStats, getCurrentStreak) exist but are NOT wired to any slash command yet — dead code currently
- patch_debug.js is a dev artifact, not used in production
- The `ready` event deprecation warning (should be `clientReady`) fires on every restart — known issue, not currently fixed
- `ReferenceError: simbrief is not defined` in dataStore.js was crashing every render cycle (fixed 2026-04-19 — added missing require).
- Elevatex altitude is in meters from API — converted to feet via * 3.28084 in the poller
- Skyteam uses SSE (Server-Sent Events) via raw https.get, not axios; reads `flight_data` event type
- SimBrief destination ICAO is at `sbData.dest?.icao` (NOT `destination.icao` or `arrival.icao`) — same pattern used for suppress() call and destLat/destLon fields in getRegisteredFlights enriched object
- SimBrief `navlog.fix` does NOT include the origin airport as the first entry — it starts with the first SID waypoint (`is_sid_star: "1"`). The destination airport IS the last fix (`type: "apt"`). Origin must be manually prepended to the waypoints array to connect the route line to the departure airport.

- `users.json` is a **keyed object** `{ "discordId": { vatsimCid, ... } }`, NOT an array — always `Object.values(raw)` when iterating; `for...of` on the raw parse throws "not iterable"
- GIF test bot lives at `/home/admin/programmes/flight-gif-test/`, reads `users.json` and `.env` from `../flight-tracker-bot/` via relative paths
- Placeholder IDs in users.json are `"id-here"` or `"uuid-here"` — skip these when matching sources
- User records have a `color` hex and `displayName` field — use these directly, not a generated color array
- There is NO basemap cache — `fetchBasemap` is called unconditionally every render cycle (every 20s) with `toFixed(5)` lat/lon precision. At cruise speed a plane moves ~0.05°/20s so the Mapbox URL is unique every cycle. Fix: add a module-level cache Map keyed on `toFixed(1)` lat/lon + `toFixed(1)` zoom + mapStyle, with a TTL.

- `source-in` globalCompositeOperation in @napi-rs/canvas produces a fully transparent result — do not use it for icon tinting in GIF bot. Use `source-atop` instead.
- `source-atop` works correctly for icon tinting in @napi-rs/canvas: drawImage the icon, then fillRect with source-atop to tint the non-transparent pixels, then reset to source-over.
- Aircraft ICAO type IS available from sources (confirmed A359 via VATSIM/SimBrief) — icon failures are a rendering bug, not a data problem.
- Aircraft ICAO field names per source: Volanta=`aircraftIcao ?? aircraft`, Elevatex=`aircraftIcao`, VATSIM=`flight_plan?.aircraft_short`, Skyteam=`aircraft_type_icao`
- Main bot (mapRenderer.js) icon fetch: axios GET with responseType arraybuffer → Buffer → loadImage(buf). GIF bot uses same pattern — confirmed working.

- weatherRadar.js has NO caching — `getLatestRadarPath()` calls the RainViewer meta API fresh every time it is called, and `fetchRadarTiles()` fetches tiles fresh every cycle. No TTL, no module-level cache.
- No render timing is logged anywhere in the codebase (no `console.time`, no duration output in stdout/stderr logs). Render duration is unknown.

- SimBrief `pos_long` values are standard -180 to +180 degrees (parseFloat from API string). The antimeridian pixel-jump check must scale with zoom — use `512 * Math.pow(2, z) / 2` not `IMG_W / 2`.
- The dLon > 170 degree check was insufficient for Pacific antimeridian crossings — it produced a false-negative for RJTT→KORD because waypoints near lon=170/180 have dLon only ~10°, yet project to a 1400px gap. Pixel-space check is the correct approach.
- At high zoom (e.g. z=13), `IMG_W/2` = 640px but off-screen waypoints project to x=20,000+px, so consecutive route waypoints trivially exceed the 640px threshold and the line breaks into `moveTo` fragments. The threshold must be half the world width in pixels at the current zoom.

## Key Learnings (continued)

- Discord Embedded App SDK `patchUrlMappings` rewrites fetch/WebSocket URLs inside Discord's iframe proxy. `/api` and `/ws` both need entries pointing at the VPS hostname (no protocol). In dev, WS connects directly to localhost:3001.
- `discordSdk.commands.authorize` returns `{ code, state }` — the returned `state` must be compared to the sent nonce to detect CSRF. Empty `state: ''` is not safe.
- `VITE_CLIENT_ID` is a public Discord application ID (not a secret) — it appears in every OAuth URL. `DISCORD_CLIENT_SECRET` is the actual secret and must stay on the VPS only.
- `.env` files must be in `.gitignore` even for non-secret values, to prevent accidental credential exposure if secret vars are added later. Provide `.env.example` to document required vars.
- The local flight-activity project lives at `/c/Users/Connor/Documents/GitHub/flight-activity/`, NOT on the Desktop.
- VPS nginx `/etc/nginx/sites-available/flight-map` requires `sudo` to write — use `sed -i` via sudo, or scp+sudo mv.
- `flight-activity` (the 3D globe Discord Embedded Activity) is NOT served from the VPS — it is hosted on Cloudflare Pages, auto-deployed from GitHub on push. Local files are at `C:\Users\Connor\Documents\GitHub\flight-activity\`. Workflow: edit locally → push to GitHub → Cloudflare builds and deploys.

## Key Learnings (flight-activity / Discord embedded activity)

- The app is a Cloudflare **Workers** deployment (not Pages) — uses `npx wrangler deploy`, served from `discord-flight-tracker.connor-odonnell.workers.dev`
- Workers asset deduplication: if file content hasn't changed, "No updated asset files to upload" — stale JS will be served. Must make a real code change to force a new hash.
- Discord Developer Portal URL mappings: `/` → `discord-flight-tracker.connor-odonnell.workers.dev`, `/ws` → `flightmap.cfod.co.uk` (no protocol prefix)
- nginx had `http2` on the 443 listener which blocked WebSocket upgrades — removed, now WSS works externally
- VPS POST /api/token endpoint exists in index.js with DISCORD_CLIENT_SECRET in .env — OAuth token exchange is possible
- `discordSdk.ready()` fires inside Discord but the proxy WS still fails (1006) — `ready()` alone may not activate the proxy; full OAuth flow (authorize + authenticate) may be required
- WS URL logic: DEV→localhost:3001, discordsays.com→proxy path (`wss://${host}/.proxy/ws`), else→direct VPS (`wss://flightmap.cfod.co.uk/ws`)
- `@discord/embedded-app-sdk` must be in package.json dependencies — was missing, caused all Cloudflare builds to fail silently

## Do-Not-Repeat

- [2026-05-03] `showVatsim` toggle does NOT hide VATSIM pilots — it was a bug. The flag has no effect on pilot rendering; `showAtc` (separate button) controls ATC sector drawing in mapRenderer.js. The flightsToRender filter by source was removed entirely.

- [2026-04-18] Do not read source files inline for large files — all src/*.js files are 50-590 lines and fit in context, but follow agent rules if the session grows large
- [2026-05-02] `fixAt: Date.now()` in getRegisteredFlights() was wrong — a new timestamp every render cycle makes positionInterpolator see a perpetual "new fix", restarting the 3s blend every 20s cycle so it never completes. fixAt must only change when position actually changes (compare against lastKnownPositions entry).
- [2026-04-18] `stats.js` functions are not exposed via any Discord command — do not assume `/stats` or `/leaderboard` commands exist
- [2026-04-25] Do NOT touch autoZoom.js (or any file beyond the one asked about) unless explicitly requested. User asked to fix the route line — changing the viewport/centering logic broke the entire map. Fix only what is asked.
- [2026-04-28] Antimeridian threshold `IMG_W / 2` was wrong — it breaks route lines at zoom > 2x. Correct threshold: `512 * Math.pow(2, z) / 2` (half world width in pixels). Fixed in mapRenderer.js line 446.
- [2026-05-01] PM2 CWD for flight-tracker is `src/` not the project root. `require('dotenv').config()` without a path argument will NOT find `.env` in the project root. ALWAYS use `require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })` in src/index.js.

## Decision Log

- [2026-04-18] Source priority Volanta > Elevatex > Vatsim > Skyteam — first source seen wins for deduplication per discordId per cycle
- [2026-04-22] Focus zoom multiplier stored in map-state.json as `focusZoomMultiplier` (internal integers 1–6). FIXED_ZOOM: `{2:8, 3:9, 4:10, 5:11, 6:13}`. Display labels: 1x/2x/3x/5x/7x/10x. Check is BEFORE the small-bbox guard in autoZoom.js. Reset to 1 on global_view.
- [2026-04-22] autoZoom.js uses a FIXED_ZOOM lookup table `{3:9, 5:11, 10:13}` — NOT the Math.log2 formula described in cerebrum. The FIXED_ZOOM block is AFTER the single-point guard `if ((maxLon-minLon)<4 || (maxLat-minLat)<4)` which returns early — when a long-haul flight is near its destination, the dynamic virtual-origin slides close to current position, shrinking the bbox below 4°, causing the single-point guard to return BEFORE the FIXED_ZOOM block is ever reached. This is the root cause of zoom silently failing.
- [2026-04-22] SimBrief 400 error for Mysteron77 (username "Mysteron77") means "No flight plan on file for the specified user" — the username is valid and exists in SimBrief (userid 649435) but they have no OFP filed. The error is not a code bug; the poller should suppress retries when 400 is returned (it currently retries every cache-miss cycle, flooding the error log).
- [2026-04-22] Fix applied: simbrief.js catch block now checks `e.response?.status === 400` → caches null with normal TTL and logs with console.log (not console.error). Prevents retry-spam.
- [2026-04-22] Fix applied: autoZoom.js FIXED_ZOOM moved BEFORE bbox/single-point guard. Now keyed on internal sequential values {2:8, 3:9, 4:10, 5:11, 6:13}. Internal value 1 = no override.
- [2026-04-24] Fix applied: FIXED_ZOOM updated to {2:7, 3:9, 4:10, 5:12, 6:13} for even spacing. 1x natural zoom is ~5–7, so option 2 now starts at 7 to avoid a large jump.
- [2026-04-22] Fix applied: index.js zoom menu now has 6 choices: value 1=1x, 2=2x, 3=3x, 4=5x, 5=7x, 6=10x. setDefault uses String comparison against focusZoomMultiplier.
