# The Network

Surge rule library for the home network gateway.

The overlay is the layer this network measured and owns: infrastructure, path faults, and false-positive repairs. The library is first-party classification written in this repository. A profile should subscribe to these files, not to another catalog for the same category.

## Overlay

A rule earns a place here when it encodes something specific to this network:

- Our own infrastructure. The tailnet address space and the tunnel edge.
- Measured path faults. Destinations that fail through one exit region and succeed through another.
- False positives to repair. Domestic services that ad classification kills. Each patch names the symptom.
- Direct classifications that die here. Hosts that download classification sends direct, which then fail to connect.
- Categories worth owning outright. The AI list is the first of these.

## Library

Service and category files under [`config/Surge/Library/`](config/Surge/Library/). Mainland addresses that no service file names are handled by `GEOIP,CN`. There is no imported blocklist. Named services that need a foreign exit have their own file. Everything else falls through to `FINAL`.

## What does not belong here

- Another project's rule dump, converted or vendored.
- Rewrite, MITM, and unlock scripts.
- General settings. DNS, QUIC policy, MITM, and the policy groups live in the gateway profile. A `.list` file carries rules only.

## Layout

```
config/
└── Surge/
    ├── AI/               owned AI category
    ├── Apple/            push and attachment transfer direct, Intelligence to AI
    ├── GitHub/           pinned away from the Hong Kong exits
    ├── Infrastructure/   our own tunnels
    ├── Rescue/           false positive repairs, plus the watchlist
    ├── Tailscale/        tailnet space, coordination, and the direct domains
    └── Library/          first-party classification
```

`config/` is keyed by client, so a second client gets a sibling directory rather than a reshuffle.

Start with [`config/Surge/README.md`](config/Surge/README.md) for the reference block. The drop-in profile is [`config/Surge/Library/profile.snippet`](config/Surge/Library/profile.snippet).

## Consumer

The gateway profile is rendered by the panel worker and delivered as a managed Surge configuration. Rules from this repository are referenced by URL, so a change here reaches every device on the next profile refresh without a redeploy.
