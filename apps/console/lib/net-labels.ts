const SERVICES: Readonly<Record<number, string>> = {
  22: "SSH",
  53: "DNS",
  80: "HTTP",
  123: "NTP",
  443: "HTTPS",
  445: "SMB",
  465: "SMTP",
  587: "SMTP",
  853: "DoT",
  993: "IMAPS",
  1194: "OpenVPN",
  1900: "SSDP",
  2049: "NFS",
  3478: "STUN",
  5222: "XMPP",
  5228: "FCM",
  5353: "mDNS",
  8443: "HTTPS",
  32400: "Plex",
  51820: "WireGuard",
};

const COMPOUND_SECOND_LEVELS = new Set(["com", "net", "org", "co", "edu", "gov", "ac"]);

export function serviceForPort(port: number): string | undefined {
  return SERVICES[port];
}

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels.at(-1);
  const secondLevel = labels.at(-2);
  if (tld?.length === 2 && secondLevel !== undefined && COMPOUND_SECOND_LEVELS.has(secondLevel)) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}
