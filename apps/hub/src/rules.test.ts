import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildListCoverage, loadProfile, loadRepoLists } from './rules.ts';

describe('Surge rules', () => {
  let root: string;
  let profilePath: string;
  let listsDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'the-network-rules-'));
    profilePath = join(root, 'profile.conf');
    listsDir = join(root, 'config', 'Surge');
    mkdirSync(join(listsDir, 'Nested'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('parses proxy names, groups, rules, compounds, options, and display keys', async () => {
    writeFileSync(
      profilePath,
      `[General]
loglevel = notify

[Proxy]
Secret Node = vmess, proxy.example, 443, password=super-secret, sni=private.example
Second Node = socks5, second.example, 1080, password=another-secret

[Proxy Group]
Primary = select, Child, Secret Node, url=https://probe.example, interval=600, include-other-group=Ignored
Child = url-test, Second Node, no-alert=true, hidden=1

[Rule]
PROCESS-NAME,oixcloud-external-proxy-program,DIRECT
RULE-SET,https://rules.example/lists/AI.list,Primary,extended-matching
DOMAIN-SET,/rules/reject.conf,REJECT,pre-matching
AND,((PROTOCOL,UDP),(DEST-PORT,3478)),DIRECT
FINAL,Primary,dns-failed
`,
    );

    const profile = await loadProfile(profilePath);

    expect(profile.proxies).toEqual(['Secret Node', 'Second Node']);
    expect(profile.groups).toEqual([
      { name: 'Primary', type: 'select', members: ['Child', 'Secret Node'] },
      { name: 'Child', type: 'url-test', members: ['Second Node'] },
    ]);
    expect(profile.rules).toEqual([
      {
        index: 0,
        type: 'PROCESS-NAME',
        target: 'oixcloud-external-proxy-program',
        policy: 'DIRECT',
        displayKey: 'PROCESS-NAME oixcloud-external-proxy-program',
      },
      {
        index: 1,
        type: 'RULE-SET',
        target: 'https://rules.example/lists/AI.list',
        policy: 'Primary',
        displayKey: 'RULE-SET AI.list',
      },
      {
        index: 2,
        type: 'DOMAIN-SET',
        target: '/rules/reject.conf',
        policy: 'REJECT',
        displayKey: 'DOMAIN-SET reject.conf',
      },
      {
        index: 3,
        type: 'AND',
        target: '((PROTOCOL,UDP),(DEST-PORT,3478))',
        policy: 'DIRECT',
        displayKey: 'AND ((PROTOCOL',
      },
      { index: 4, type: 'FINAL', policy: 'Primary', displayKey: 'FINAL' },
    ]);
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toContain('password=');
    expect(serialized).not.toContain('sni=');
    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('private.example');
  });

  it('loads recursive lists while skipping comments and parsing bare domains', async () => {
    writeFileSync(
      join(listsDir, 'Nested', 'Example.list'),
      '# comment\n\nDOMAIN-SUFFIX,anthropic.com\nPROCESS-NAME,example-process,no-resolve\nbare.example\n',
    );

    const lists = await loadRepoLists(listsDir);

    expect(lists).toEqual([
      {
        name: 'Example.list',
        path: expect.stringMatching(/config\/Surge\/Nested\/Example\.list$/),
        entries: [
          { type: 'DOMAIN-SUFFIX', value: 'anthropic.com' },
          { type: 'PROCESS-NAME', value: 'example-process' },
          { type: 'DOMAIN', value: 'bare.example' },
        ],
      },
    ]);
  });

  it('matches supported coverage types and prefers recent flows over history', () => {
    const list = {
      name: 'Coverage.list',
      path: 'config/Surge/Coverage.list',
      entries: [
        { type: 'DOMAIN', value: 'exact.example' },
        { type: 'DOMAIN-SUFFIX', value: 'suffix.example' },
        { type: 'DOMAIN-KEYWORD', value: 'needle' },
        { type: 'PROCESS-NAME', value: 'surge' },
        { type: 'IP-CIDR', value: '10.0.0.0/24' },
        { type: 'IP-CIDR6', value: '2001:db8::/32' },
      ],
    };

    expect(
      buildListCoverage(list, {
        hosts: [
          { value: 'exact.example', lastSeen: 10 },
          { value: 'api.suffix.example', lastSeen: 20 },
          { value: 'has-needle.example', lastSeen: 30 },
        ],
        processes: [{ value: 'surge', lastSeen: 40 }],
        ips: [{ value: '10.0.0.42', lastSeen: 50 }],
        historyHosts: [
          { value: 'exact.example', lastSeen: 60 },
          { value: 'suffix.example', lastSeen: 70 },
        ],
      }),
    ).toEqual({
      name: 'Coverage.list',
      total: 6,
      matched: 5,
      entries: [
        { value: 'exact.example', type: 'DOMAIN', matched: true, matchedVia: 'flows', lastSeen: 10 },
        {
          value: 'suffix.example',
          type: 'DOMAIN-SUFFIX',
          matched: true,
          matchedVia: 'flows',
          lastSeen: 20,
        },
        {
          value: 'needle',
          type: 'DOMAIN-KEYWORD',
          matched: true,
          matchedVia: 'flows',
          lastSeen: 30,
        },
        { value: 'surge', type: 'PROCESS-NAME', matched: true, matchedVia: 'flows', lastSeen: 40 },
        { value: '10.0.0.0/24', type: 'IP-CIDR', matched: true, matchedVia: 'flows', lastSeen: 50 },
        { value: '2001:db8::/32', type: 'IP-CIDR6', matched: false },
      ],
    });
  });
});
