# Discord Flight Tracker

A Discord Activity that displays a real-time 3D flight tracking map for Microsoft Flight Simulator sessions. Embedded directly in Discord voice channels — no external app needed.

Built with React, Three.js (via React Three Fiber), and the Discord Embedded App SDK.

## Features

- Interactive 3D globe with real-time aircraft positions
- Flight info sidebar with per-aircraft details
- High-resolution earth textures and GeoJSON country/city overlays
- Runs as a Discord Activity inside voice channels

## Tech Stack

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [Drei](https://github.com/pmndrs/drei)
- [Discord Embedded App SDK](https://github.com/discord/embedded-app-sdk)

## Setup

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `VITE_CLIENT_ID` | Your Discord application client ID |
| `VITE_API_HOST` | Hostname for the flight data API/WebSocket proxy |

3. Start the dev server:

```bash
npm run dev
```

## Deployment

See `deploy.sh` for the deployment script.

## Legal

- [Terms of Service](https://cfod.github.io/discord-flight-tracker/tos.html)
- [Privacy Policy](https://cfod.github.io/discord-flight-tracker/privacy.html)

