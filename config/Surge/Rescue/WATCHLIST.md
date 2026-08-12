# Watchlist

Hosts that the profile's ad and tracker classification matches, where the classification looks defensible but the collateral damage is not yet confirmed. Nothing here is patched. Promote an entry into a `.list` file only after a symptom is observed and reproduced, and record the symptom in the file header.

| Host | Matched as | What breaks if the classification is wrong |
| --- | --- | --- |
| `mqtt.zhihu.com` | Push and telemetry channel | Zhihu notifications stop arriving |
| `appsec-mobile.meituan.com` | Security SDK endpoint | Meituan risk control fails closed, which can block checkout |
| `edith-seb.xiaohongshu.com` | Risk control endpoint | Xiaohongshu refuses to load feeds or post |

## How to triage a suspected false positive

1. Flip the AdBlock policy group to Direct. If the symptom clears within a second, the reject set is responsible; if it does not, stop looking here.
2. Find which rule matched, by domain, in the request log. The record names the rule, so there is no guessing.
3. Confirm the failure shape before writing a patch. A local reject is a zero byte connection that closes about 7ms after the TCP connect. An origin reset carries the real round trip. A foreign origin refusing a foreign exit is a connection with a handshake and no data, which is a routing problem rather than a blocking problem and belongs in a different file.
4. Add the narrowest rule that covers the symptom, and put the symptom in the header. A patch without a recorded symptom cannot be retired later.

## Two failure modes that look alike

Both surface as "this app or site does not load", and they need opposite fixes:

**Blocked by a reject set.** Zero bytes, closes immediately, and the request log names the reject rule. Fix by adding a pass rule ahead of the reject set, which is what the files in this directory do.

**Sent abroad by the catch all.** A domestic service that no domestic list carries reaches `FINAL` and gets proxied into an origin that refuses foreign exits. The connection completes its handshake, carries a few kilobytes, and then closes. Fix by widening the domestic classification rather than by patching the single host, so the next service in the same position is caught too. To find them, count request log entries whose rule starts with `FINAL`; a domestic domain appearing there repeatedly is this failure mode.
