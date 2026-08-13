# The Network

This repository is The Network: a home network observability plane (hub, probes, and console) plus the gateway rule layer that sits above broad classification.

## Observability plane

The hub ingests probe events, stores them in SQLite, and serves a live console on port 9420. Probes talk to gateway http-api endpoints; the console is a static Vite build the hub serves from `TN_CONSOLE_DIST`.

### Quick start (Docker)

```bash
cd deploy
docker compose up -d
```

Open http://localhost:9420. Add a Surge source pointing at the gateway's http-api with its key. On the gateway, enable the API with a line such as `http-api = key@0.0.0.0:6171` (use your real key).

### Development

```bash
pnpm install
pnpm dev
```

Hub listens on 9420. Console runs via `next dev` on port 3000; in development only, Next.js rewrites `/api` to the hub. In production the hub serves the console static export on 9420.

### Packages

| Path | Role |
| --- | --- |
| `apps/hub` | Ingest, SQLite store, HTTP API, static console host |
| `apps/console` | Live React console (Vite) |
| `packages/schema` | Shared Zod types and event shapes |
| `packages/probe-surge` | Surge http-api probe client and normalizers |
| `config/` | Gateway rule sets (Surge lists) |

## Gateway rule sets

Rule sets for the home network gateway.

The gateway profile is layered. Broad classification sits at the bottom and decides the ordinary cases: what is an ad, what is domestic, what is blocked, what belongs to a streaming service. This repository is the layer above it, and it carries only the rules that layer cannot get right on its own.

### What belongs here

A rule earns a place here when it encodes something specific to this network:

- **Our own infrastructure.** The tailnet address space and the tunnel edge. Nobody outside this network runs these.
- **Measured path faults.** Destinations that fail through one exit region and succeed through another, established by measurement rather than by reputation.
- **False positives to repair.** Domestic services that broad ad and tracker classification kills. Each patch names the symptom that produced it.
- **Direct classifications that die here.** Hosts that generic download classification sends direct, which the GFW then blocks.
- **Categories worth owning outright.** A category small enough to read in one screen, where the generic version disagrees with how this network actually works, belongs here so that its contents are a decision rather than an inheritance. Size alone is not the argument; size plus disagreement is. The AI category is the first of these: it is small, and the generic version routes the plain GitHub API as if it were a model endpoint while missing several services in daily use here.

### What deliberately does not belong here

Carrying these would mean maintaining a worse copy of work that is already done well elsewhere:

- **Ad, tracker, malware, and phishing classification.** Tens of thousands of entries and a full time job to keep current. Our contribution is the repair layer in [`Rescue/`](config/Surge/Rescue/), which is the right division of labour. An earlier experiment with a more aggressive blocking set was reverted permanently: the marginal blocking was entirely false positives.
- **Domestic and global classification.** Six figures worth of domains. Hand-maintaining either is not viable, and no local judgement is involved.
- **Streaming region lists, CDN sets, download sets.** Pure volume, tracked by people who test the services.
- **General settings.** DNS, QUIC policy, MITM, and the policy groups live in the gateway profile, not in a rule set. A `.list` file carries rules only.

### Layout

```
config/
└── Surge/
    ├── AI/               the AI category, owned rather than inherited
    ├── Apple/            push and attachment transfer direct, Intelligence to AI
    ├── GitHub/           pinned away from the Hong Kong exits
    ├── Infrastructure/   our own tunnels
    ├── Rescue/           false positive repairs, plus the watchlist
    └── Tailscale/        tailnet space, coordination, and the direct domains
```

`config/` is keyed by client, so a second client gets a sibling directory rather than a reshuffle.

Every file states why it exists and which policy it expects at the reference site. Start with [`config/Surge/README.md`](config/Surge/README.md) for the reference block and the ordering constraints.

### Consumer

The gateway profile is rendered by the panel worker and delivered as a managed Surge configuration. Rules from this repository are referenced by URL, so a change here reaches every device on the next profile refresh without a redeploy.
