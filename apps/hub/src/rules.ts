import { readFile, readdir } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import type { RuleListCoverageDto, RuleListEntryDto } from '@the-network/schema';
import { registrableHost } from './store.ts';

const RULE_OPTIONS = new Set([
  'dns-failed',
  'extended-matching',
  'force-remote-dns',
  'no-resolve',
  'pre-matching',
  'update-interval',
]);

const BUILTIN_POLICIES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'REJECT-NO-DROP',
  'REJECT-TINYGIF',
]);

export interface ParsedRuleGroup {
  name: string;
  type: string;
  members: string[];
}

export interface ParsedRuleLine {
  index: number;
  type: string;
  target?: string;
  policy: string;
  displayKey: string;
}

export interface ParsedSurgeProfile {
  proxies: string[];
  groups: ParsedRuleGroup[];
  rules: ParsedRuleLine[];
}

export interface ParsedRuleListEntry {
  type: string;
  value: string;
}

export interface ParsedRuleList {
  name: string;
  path: string;
  entries: ParsedRuleListEntry[];
}

export interface RuleObservation {
  value: string;
  lastSeen: number;
}

export interface RuleCoverageObservations {
  hosts: RuleObservation[];
  processes: RuleObservation[];
  ips: RuleObservation[];
  historyHosts: RuleObservation[];
}

function assignment(line: string): [string, string] | undefined {
  const separator = /\s+=\s*/.exec(line);
  const index = separator?.index ?? line.indexOf('=');
  if (index === -1) return undefined;
  const name = line.slice(0, index).trim();
  const value = line.slice(index + (separator?.[0].length ?? 1)).trim();
  return name === '' ? undefined : [name, value];
}

function isRuleOption(token: string): boolean {
  const normalized = token.trim().toLowerCase();
  return RULE_OPTIONS.has(normalized) || /^[a-z-]+=/.test(normalized);
}

function targetBasename(target: string): string {
  try {
    return basename(new URL(target).pathname);
  } catch {
    return basename(target.replaceAll('\\', '/'));
  }
}

function displayKey(type: string, target: string | undefined): string {
  if (target === undefined) return type;
  if ((type === 'RULE-SET' || type === 'DOMAIN-SET') && /[\\/]/.test(target)) {
    return `${type} ${targetBasename(target)}`;
  }
  return `${type} ${target.split(',', 1)[0]}`;
}

function parseRule(
  line: string,
  index: number,
  knownPolicies: ReadonlySet<string>,
): ParsedRuleLine | undefined {
  const [rawType, ...rawTokens] = line.split(',');
  const type = rawType?.trim().toUpperCase();
  if (type === undefined || type === '' || rawTokens.length === 0) return undefined;
  const tokens = rawTokens.map((token) => token.trim());
  while (tokens.length > 0 && isRuleOption(tokens.at(-1)!)) tokens.pop();
  if (tokens.length === 0) return undefined;

  let policyIndex = -1;
  for (let candidate = tokens.length - 1; candidate >= 0; candidate -= 1) {
    if (knownPolicies.has(tokens[candidate]!)) {
      policyIndex = candidate;
      break;
    }
  }
  if (policyIndex === -1) policyIndex = tokens.length - 1;

  const policy = tokens[policyIndex]!;
  const targetTokens = tokens.slice(0, policyIndex);
  const target = type === 'FINAL' || targetTokens.length === 0 ? undefined : targetTokens.join(',');
  return {
    index,
    type,
    ...(target === undefined ? {} : { target }),
    policy,
    displayKey: displayKey(type, target),
  };
}

export async function loadProfile(path: string): Promise<ParsedSurgeProfile> {
  const contents = await readFile(path, 'utf8');
  const proxies: string[] = [];
  const groups: ParsedRuleGroup[] = [];
  const ruleLines: string[] = [];
  let section = '';

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim();
      continue;
    }
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    if (section === 'Proxy') {
      const parsed = assignment(line);
      if (parsed !== undefined) proxies.push(parsed[0]);
      continue;
    }
    if (section === 'Proxy Group') {
      const parsed = assignment(line);
      if (parsed === undefined) continue;
      const [name, value] = parsed;
      const [rawType, ...tokens] = value.split(',');
      const type = rawType?.trim();
      if (type === undefined || type === '') continue;
      groups.push({
        name,
        type,
        members: tokens
          .map((token) => token.trim())
          .filter((token) => token !== '' && !token.includes('=')),
      });
      continue;
    }
    if (section === 'Rule') ruleLines.push(line);
  }

  const knownPolicies = new Set([...BUILTIN_POLICIES, ...proxies, ...groups.map((group) => group.name)]);
  const rules = ruleLines.flatMap((line, index) => {
    const parsed = parseRule(line, index, knownPolicies);
    return parsed === undefined ? [] : [parsed];
  });
  return { proxies, groups, rules };
}

async function listFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listFiles(path);
      return entry.isFile() && entry.name.endsWith('.list') ? [path] : [];
    }),
  );
  return files.flat().sort((left, right) => left.localeCompare(right));
}

function parseListEntries(contents: string): ParsedRuleListEntry[] {
  const entries: ParsedRuleListEntry[] = [];
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf(',');
    if (separator === -1) {
      entries.push({ type: 'DOMAIN', value: line });
      continue;
    }
    const type = line.slice(0, separator).trim().toUpperCase();
    const value = line.slice(separator + 1).split(',', 1)[0]?.trim() ?? '';
    if (type !== '' && value !== '') entries.push({ type, value });
  }
  return entries;
}

export async function loadRepoLists(rootDir: string = 'config/Surge'): Promise<ParsedRuleList[]> {
  const absoluteRoot = resolve(rootDir);
  const paths = await listFiles(absoluteRoot);
  return Promise.all(
    paths.map(async (path) => ({
      name: basename(path),
      path: relative(process.cwd(), path).split(sep).join('/'),
      entries: parseListEntries(await readFile(path, 'utf8')),
    })),
  );
}

function latestMatch(
  observations: readonly RuleObservation[],
  matches: (value: string) => boolean,
): number | undefined {
  let lastSeen: number | undefined;
  for (const observation of observations) {
    if (matches(observation.value) && (lastSeen === undefined || observation.lastSeen > lastSeen)) {
      lastSeen = observation.lastSeen;
    }
  }
  return lastSeen;
}

function ipv4Number(value: string): number | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    result = result * 256 + octet;
  }
  return result;
}

function matchesIpv4Cidr(ip: string, cidr: string): boolean {
  const [networkValue, prefixValue, ...rest] = cidr.split('/');
  if (networkValue === undefined || prefixValue === undefined || rest.length > 0) return false;
  const network = ipv4Number(networkValue);
  const candidate = ipv4Number(ip);
  const prefix = Number(prefixValue);
  if (network === undefined || candidate === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const blockSize = 2 ** (32 - prefix);
  return Math.floor(network / blockSize) === Math.floor(candidate / blockSize);
}

function matchListEntry(
  entry: ParsedRuleListEntry,
  observations: RuleCoverageObservations,
): RuleListEntryDto {
  const value = entry.value.toLowerCase().replace(/\.$/, '');
  let flowLastSeen: number | undefined;
  let historyLastSeen: number | undefined;

  if (entry.type === 'DOMAIN') {
    flowLastSeen = latestMatch(observations.hosts, (host) => host.toLowerCase().replace(/\.$/, '') === value);
    if (registrableHost(value) === value) {
      historyLastSeen = latestMatch(observations.historyHosts, (host) => host.toLowerCase() === value);
    }
  } else if (entry.type === 'DOMAIN-SUFFIX') {
    flowLastSeen = latestMatch(observations.hosts, (host) => {
      const normalized = host.toLowerCase().replace(/\.$/, '');
      return normalized === value || normalized.endsWith(`.${value}`);
    });
    if (registrableHost(value) === value) {
      historyLastSeen = latestMatch(observations.historyHosts, (host) => host.toLowerCase() === value);
    }
  } else if (entry.type === 'DOMAIN-KEYWORD') {
    flowLastSeen = latestMatch(observations.hosts, (host) => host.toLowerCase().includes(value));
  } else if (entry.type === 'PROCESS-NAME') {
    flowLastSeen = latestMatch(observations.processes, (process) => process === entry.value);
  } else if (entry.type === 'IP-CIDR') {
    flowLastSeen = latestMatch(observations.ips, (ip) => matchesIpv4Cidr(ip, entry.value));
  }

  if (flowLastSeen !== undefined) {
    return { value: entry.value, type: entry.type, matched: true, matchedVia: 'flows', lastSeen: flowLastSeen };
  }
  if (historyLastSeen !== undefined) {
    return { value: entry.value, type: entry.type, matched: true, matchedVia: 'history', lastSeen: historyLastSeen };
  }
  return { value: entry.value, type: entry.type, matched: false };
}

export function buildListCoverage(
  list: ParsedRuleList,
  observations: RuleCoverageObservations,
): RuleListCoverageDto {
  const entries = list.entries.map((entry) => matchListEntry(entry, observations));
  return {
    name: list.name,
    total: entries.length,
    matched: entries.filter((entry) => entry.matched).length,
    entries,
  };
}
