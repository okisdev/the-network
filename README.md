# The Network

Surge rule library for the home network gateway.

Two layers, both first-party. The overlay is what this network measured and owns: infrastructure, path faults, pins that must survive whatever the panel does, and false-positive repairs. The library is classification written in this repository, complete enough that the gateway profile subscribes to these files for every category but one.

## Overlay

A rule earns a place here when it encodes something specific to this network:

- Our own infrastructure. The tailnet address space and the tunnel edge.
- Measured path faults. Destinations that fail through one exit region and succeed through another.
- Pins. Apple push and iCloud content stay direct whatever policy the panel hangs the company-wide Apple set on, because a reselection of that group, or a QUIC handshake blocked on a proxy path, was measured breaking them. iCloud content is also held to TCP: direct QUIC never failed and measured five to thirteen times slower.
- False positives to repair. Services that the reject layer kills. Each patch names the symptom.
- Categories worth owning outright. AI was the first; Apple is the second.

## Library

Service and category files under [`config/Surge/Library/`](config/Surge/Library/). Apple is direct by default with four named exceptions. Mainland services have company files; mainland addresses that no file names are handled by the `.cn` rule and `GEOIP,CN`. Named foreign services that need a specific group have their own file. Everything else falls through to `FINAL`, which is a proxy, so a foreign service gets a file only when its policy or matching differs from that.

## The one imported layer

The reject layer is imported from [ruleset.skk.moe](https://ruleset.skk.moe) on purpose. It is a hundred thousand tracker and advertising names maintained daily, and owning it would buy nothing. The profile places it after the overlay's repairs and before every service list, so a company suffix never shields its telemetry hosts. Suspected collateral goes on [`config/Surge/Rescue/WATCHLIST.md`](config/Surge/Rescue/WATCHLIST.md) first and into a repair file once a symptom is reproduced.

## What does not belong here

- Another project's rule dump, converted or vendored.
- Rewrite, MITM, and unlock scripts.
- General settings. DNS, QUIC policy, MITM, and the policy groups live in the gateway profile. A `.list` file carries rules only.
- Anything a rule set cannot express. Logical rules and platform directives live inline in the profile; [`config/Surge/README.md`](config/Surge/README.md) lists them.

## Layout

```
config/
└── Surge/
    ├── AI/               owned AI category, foreign and mainland
    ├── Apple/            push and content pinned direct, Intelligence to AI
    ├── GitHub/           pinned away from the Hong Kong exits
    ├── Infrastructure/   our own tunnels
    ├── Registries/       official package registries, direct
    ├── Rescue/           false positive repairs, plus the watchlist
    ├── Tailscale/        tailnet space, coordination, and the direct domains
    └── Library/          first-party classification
```

`config/` is keyed by client, so a second client gets a sibling directory rather than a reshuffle.

Start with [`config/Surge/README.md`](config/Surge/README.md) for the reference block. The drop-in profile is [`config/Surge/Library/profile.snippet`](config/Surge/Library/profile.snippet).

## Consumer

The gateway profile is rendered by the panel worker and delivered as a managed Surge configuration. Rules from this repository are referenced by URL, so a change inside a file reaches every device on the next profile refresh without a redeploy; a new, moved or removed file needs the panel's copy of the snippet updated as well.
