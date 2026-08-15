# Surge library

First-party classification for this network. The overlay in the sibling directories sits above it.

79 rule sets, written in this repository. Policy names in [profile.snippet](profile.snippet) match the panel groups (`AdBlock`, `Netflix`, `Telegram`, `Microsoft`, `Others`).

## How to use it

1. Keep the overlay block first. Rescue, Tailscale, Apple push, the owned AI list, and the GitHub region pin all have to win.
2. Paste [profile.snippet](profile.snippet), or pick individual files from [INDEX.md](INDEX.md). Hang ads and HTTP DNS on `AdBlock`, not a hard REJECT.
3. Apple CDN and Microsoft CDN stay DIRECT and must precede the matching services file.
4. Mainland addresses that no service file names are handled by `GEOIP,CN`. Everything else falls through to `Others`.

## Layout

| Directory | What it holds |
| --- | --- |
| `Reject/` | Ads and HTTP DNS |
| `Direct/` | Private names, mainland CDN, downloads, NTP, speedtest |
| `Proxy/` | Public DoH resolvers |
| `Media/` | Streaming, split by service |
| `Social/` | Messengers and social networks |
| `Developer/` | Forges, clouds, design tools |
| `Gaming/` | Stores and publishers |
| `Finance/` | Payments and exchanges |
| `Platforms/` | Company-wide sets. Place after the more specific files |
| `Geo/` | LAN and Telegram DC prefixes |
| `Process/` | Download clients and proxy cores |

AI is not in this directory. That category is owned by `AI/AI.list` in the overlay.
