# Watchlist

Hosts that the imported reject layer matches, where the classification looks defensible but the collateral damage is not yet confirmed. The counts are what the reject layer blocked, or would have blocked under the documented order, in the 14 days to 2026-09-09. Nothing here is patched. Promote an entry into a `.list` file only after a symptom is observed and reproduced, and record the symptom in the file header.

| Host | Matched as | Blocked in the 14 days to 2026-09-09 | What breaks if the classification is wrong |
| --- | --- | ---: | --- |
| `tnc0-*.zijieapi.com` | ByteDance network configuration | 7,000 | Douyin and the other ByteDance apps fall back to baked-in endpoints; no symptom seen yet |
| `api.segment.io` | Analytics | 24,700 | Apps that block on their analytics client hang at launch |
| `plausible.io` | Analytics | 160 | Visits to sites that use Plausible go uncounted, including the ones run from this house |
| `logcollection.ronghub.com` | RongCloud log collection | 72 | Nothing visible; the messaging channel itself is not on this host |
| `amdc.m.taobao.com`, `amdc.alipay.com` | Alibaba endpoint dispatch | 340 | Taobao and Alipay fall back to ordinary DNS; slower first request, no symptom seen yet |
| `wxa.wxs.qq.com`, `sq.bls.mdt.qq.com` | WeChat mini program statistics | 82 | Nothing visible so far; the messenger channel is not on these hosts |
| `metrics.icloud.com`, `metrics-config.icloud.com` | iCloud device diagnostics | 1,200 | Apple lists them as diagnostics only |
| `mqtt.zhihu.com` | Push and telemetry channel | | Zhihu notifications stop arriving |
| `appsec-mobile.meituan.com` | Security SDK endpoint | | Meituan risk control fails closed, which can block checkout |
| `edith-seb.xiaohongshu.com` | Risk control endpoint | | Xiaohongshu refuses to load feeds or post |

## How to triage a suspected false positive

1. Flip the AdBlock policy group to Direct. If the symptom clears within a second, the reject layer is responsible. If it does not, check the request log for `reject-drop.conf` or `reject-no-drop.conf`: those two imported sets do not follow the group and reject regardless, and a match there needs the entry removed upstream or the profile line changed, because a Rescue file cannot outrank a pre-matching rule. Otherwise stop looking here.
2. Find which rule matched, by domain, in the request log. The record names the rule, so there is no guessing.
3. Confirm the failure shape before writing a patch. A local reject is a zero byte connection that closes about 7ms after the TCP connect. An origin reset carries the real round trip. A foreign origin refusing a foreign exit is a connection with a handshake and no data, which is a routing problem rather than a blocking problem and belongs in a different file.
4. Add the narrowest rule that covers the symptom, and put the symptom in the header. A patch without a recorded symptom cannot be retired later.

## Two failure modes that look alike

Both surface as "this app or site does not load", and they need opposite fixes:

**Blocked by a reject set.** Zero bytes, closes immediately, and the request log names the reject rule. Fix by adding a pass rule ahead of the reject layer, which is what the files in this directory do.

**Sent abroad by the catch all.** A domestic service that no domestic list carries and that `GEOIP,CN` misses reaches `FINAL` and gets proxied into an origin that refuses foreign exits. The connection completes its handshake, carries a few kilobytes, and then closes. Fix by widening the domestic classification rather than by patching the single host, so the next service in the same position is caught too. To find them, count request log entries whose rule starts with `FINAL`; a domestic domain appearing there repeatedly is this failure mode.

## A third shape: arrives without a name

Flows that reach the gateway as a bare address never match a name rule: names in the profile's `always-real-ip`, and HTTP/3 whose SNI the gateway cannot read. They fall to `FINAL` and, on a proxy policy, `block-quic` rejects the QUIC ones. The request log shows them as an address with no host and, for QUIC, the policy `QUIC-BLOCK`. Fix with an address rule when the destination owns a published range (Apple), or an inline protocol and port rule in the profile when it does not (NTP, IKE, Syncthing, STUN).
