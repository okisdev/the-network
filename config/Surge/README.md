# Surge rule sets

Base URL for every reference below:

```
https://raw.githubusercontent.com/okisdev/the-network/main
```

The drop-in profile is [`Library/profile.snippet`](Library/profile.snippet); it already carries every block described here in the right order and uses the panel group names (`AdBlock`, `AI Suite`, `Domestic`, `Microsoft`, `Netflix`, `Others`, `Proxy`, `Tailnet`, `Telegram`, and the region groups such as `🇯🇵 JP`). Every library file is listed in [`Library/INDEX.md`](Library/INDEX.md).

## Order of the profile

1. **Overlay.** Surge's built-in `SYSTEM` set, infrastructure, Tailscale, the transport guards, the iCloud content QUIC guard, the Apple pins, Apple Intelligence, Rescue, the AI sets, the GitHub pin, and the registries. Measured on this network; sits first so it wins.
2. **Local.** Proxy cores and download clients by process name, private names, LAN.
3. **Reject.** The library's ads and HTTP DNS sets, then the imported skk.moe reject layer. Rescue must precede this block and every service list must follow it. Two imported sets do not follow the `AdBlock` group: `reject-drop.conf` carries `pre-matching`, which Surge evaluates before every other rule, and `reject-no-drop.conf` is a hard `REJECT-NO-DROP`; a Rescue file cannot override either, so the lint checks that no repair collides with them.
4. **Direct services.** Certificate validation, NTP, carrier, Syncthing, downloads, the mainland CDN, then the two proxy-side utility sets (speedtest, public DoH).
5. **Apple.** Apple China, Apple TV and News, Private Relay, then the company floor `Platforms/Apple.list` on DIRECT.
6. **Microsoft.** The CDN, Xbox, then the company set on the Microsoft group.
7. **Social, media, gaming, developer, finance.** One file per service.
8. **Company-wide sets** after the more specific files, then `DOMAIN-SUFFIX,cn`.
9. **Addresses.** The imported IP reject set, the Telegram prefixes, Alibaba's anycast space, `LAN`, `GEOIP,CN`, then `FINAL`.

## Apple

Apple is direct by default. `Platforms/Apple.list` carries every Apple name and Apple's own address space (17.0.0.0/8 and the three IPv6 blocks) and expects DIRECT; the evidence is in its header. Four sets precede it because their policy differs: `Apple/AppleIntelligence.list` on `AI Suite`, `Media/AppleMedia.list` (TV and News) on `Proxy`, `Platforms/AppleChina.list` on `Domestic`, and `Direct/PrivateRelay.list`, which is DIRECT but exists on its own so the relay can be switched off by pointing it at `REJECT`. `Apple/ApplePush.list` and `Apple/iCloudContent.list` sit in the overlay as pins: they are DIRECT too, and they stay DIRECT whatever the panel does with the company floor. The address rules for Apple's space live in the floor and nowhere earlier, because an address rule matches a request that arrived as an address even when it carries an SNI, and 17.248.152.0/24 and 17.248.163.0/24 are shared by the content edges, the Private Relay ingress and the Intelligence relay.

iCloud content is held to TCP. Direct QUIC works and never fails, which is the problem: through this gateway it is slow, and a handshake that succeeds never falls back. On the same edges and devices in the 12 days to 2026-09-21, transfers of 10 MB or more ran at a median of 15.3 Mbps down and 13.4 Mbps up over TCP against 1.2 and 2.6 over QUIC, and QUIC carried most of the upload bytes (17.2 GB against 7.1 GB). A guard ahead of the pin answers UDP 443 to the content names and to the two shared /24s with `REJECT-NO-DROP`, an immediate ICMP refusal that Surge never escalates to a silent drop, so the client retries over TCP at once and lands on the DIRECT pin. Private Relay and Intelligence traffic that reaches those addresses over QUIC falls back the same way and is then matched by name in its own file.

## What cannot live in a rule set

**Logical rules.** Surge does not accept `AND`, `OR`, or `NOT` inside an external rule set. The transport guards stay inline in the profile:

```
AND,((PROTOCOL,UDP),(DEST-PORT,3478)),DIRECT     STUN, including Tailscale DERP
AND,((PROTOCOL,UDP),(DEST-PORT,19302)),DIRECT    Google STUN
AND,((PROTOCOL,UDP),(DEST-PORT,123)),DIRECT      NTP
AND,((PROTOCOL,UDP),(DEST-PORT,500)),DIRECT      IKE, Wi-Fi Calling
AND,((PROTOCOL,UDP),(DEST-PORT,4500)),DIRECT     IPsec NAT-T, Wi-Fi Calling
AND,((PROTOCOL,TCP),(DEST-PORT,22000)),DIRECT    Syncthing sync
AND,((PROTOCOL,TCP),(DEST-PORT,22067)),DIRECT    Syncthing relay
```

The iCloud content guard is a logical rule too, and the one place a rule set appears as a sub-rule, so the names stay in `Apple/iCloudContent.list` alone:

```
AND,((PROTOCOL,UDP),(DEST-PORT,443),(OR,((RULE-SET,<base>/config/Surge/Apple/iCloudContent.list),(IP-CIDR,17.248.152.0/24,no-resolve),(IP-CIDR,17.248.163.0/24,no-resolve)))),REJECT-NO-DROP
```

The port guards exist because of flows that reach the gateway without a name. Names in the profile's `always-real-ip` (NTP servers, the carrier ePDG, STUN, the consoles' NAT probes) resolve on the device, so the packets arrive as a bare address and never match a name rule. HTTP/3 whose SNI the gateway cannot read arrives the same way. Measured in the 14 days to 2026-09-09: 21,000 NTP flows to Apple's time servers and a carrier's IKE tunnel riding the fallthrough proxy, and 54,300 iCloud content handshakes rejected by `block-quic`. Where the destination owns a published range, an address rule in a list does the job (Apple, and Alibaba's anycast space in `Library/Geo/AlibabaCIDR.list`); where it does not, only a port rule can.

**Platform directives.** `#!MACOS-ONLY` and `#!IOS-ONLY` are resolved server side by the panel worker before delivery. A rule set file has no way to express a platform split, which is why `Tailscale/Tailnet.list` is referenced twice with different policies.

**Device rules.** A console whose NAT traversal must stay direct needs a `SRC-IP` rule in the profile; no list can name it.

## Rule types that do work in a rule set

`DOMAIN`, `DOMAIN-SUFFIX`, `DOMAIN-KEYWORD`, `DOMAIN-WILDCARD`, `IP-CIDR`, `IP-CIDR6`, and `PROCESS-NAME`. IP rules carry `no-resolve` so a domain never gets resolved just to be matched by address. That keeps them away from requests that arrived as a name; a request that arrived as an address with an SNI is still matched by address, so an address rule must follow every named exception that could own that address.

`DOMAIN-SUFFIX` matches on label boundaries. A host that carries its region inside a label (`gspe19-cn-ssl.ls.apple.com`) needs `DOMAIN-WILDCARD`.

## Ordering rules that are easy to get wrong

- Overlay precedes library. A repair rule placed behind the classification it is repairing does nothing.
- Rescue precedes reject, and reject precedes every service list. A service list placed before the reject layer shields that company's telemetry hosts from it.
- The iCloud content QUIC guard precedes `Apple/iCloudContent.list`. Behind the pin it never sees a packet.
- `Tailscale/Coordination.list` precedes `Tailscale/Direct.list`, because the coordination hosts are covered by the `tailscale.com` suffix in the second file.
- `AI/AI.list` precedes `Platforms/Google.list`, so the `.google` AI products keep the AI exit; `Platforms/GoogleChina.list` precedes it too.
- `GitHub/GitHub.list` precedes `Registries/Registries.list`, so a GitHub-hosted registry that appears in both keeps the Japan pin instead of falling through to DIRECT.
- `Registries/Registries.list` precedes `Library/Developer/Npm.list`, so `registry.npmjs.org` stays DIRECT instead of matching the npmjs.org suffix.
- The four Apple exceptions precede `Platforms/Apple.list`; the Microsoft CDN and Xbox precede `Platforms/Microsoft.list`; `Direct/Download.list` and `Direct/CDNChina.list` precede the company sets whose suffixes cover their hosts.
- `Library/Geo/LAN.list` does not carry `100.64.0.0/10`. That range belongs to `Tailscale/Tailnet.list`.

## Region groups

Region groups are generated by the panel worker from whichever nodes the subscriptions carry, so a region with no nodes leaves the group undefined and any rule pointing at it fails to load.

## Checking a change

There is no test suite; the check is a dry run of the snippet against the gateway's request history. The hub on the gateway keeps 14 days of flows with the rule each one matched, so a change is verified by replaying the hosts it saw through the old and the new order and reading the diff: which hosts change policy, what still lands on `FINAL`, and whether anything functional now meets the reject layer. Deliveries that arrive as a bare address show up there as an address with no host and, for QUIC on a proxy policy, the policy `QUIC-BLOCK`.
