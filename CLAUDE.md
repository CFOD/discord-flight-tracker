# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.


# Flight Map — Discord Embedded Activity

@.wolf/OPENWOLF.md

## Project

3D globe Discord Embedded Activity. Hosted on Cloudflare Workers (auto-deploy from GitHub on push).

**GitHub**: https://github.com/CFOD/discord-flight-tracker
**Cloudflare**: discord-flight-tracker.connor-odonnell.workers.dev
**VPS access**: `ssh -i "~/.ssh/vps_key" admin@193.181.209.218`
**Bot on VPS**: `/home/admin/programmes/flight-tracker-bot/` (WS server on port 3001)

## Workflow

Edit locally → `git push` → Cloudflare builds and deploys automatically.

## Rules

- VPS/SSH operations → spawn general-purpose agent, report success/fail only
- Large files (Globe.jsx ~1000 lines) → use Explore agent, never read inline
