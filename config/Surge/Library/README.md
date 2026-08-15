# Surge library

First-party classification for this network. The overlay in the sibling directories sits above it.

76 rule sets, written in this repository. A profile should subscribe to these files and the overlay, not to a third-party catalog for the same category.

## How to use it

1. Keep the overlay block first. Rescue, Tailscale, Apple push, the owned AI list, and the GitHub region pin all have to win.
2. Paste [profile.snippet](profile.snippet), or pick individual files from [INDEX.md](INDEX.md).
3. Mainland addresses that no service file names are handled by `GEOIP,CN`, not by a copied IP list.
4. There is no GFW dump. Named services that need a foreign exit have their own file. Everything else falls through to `FINAL`.

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
