export function CountryChip({ code }: { code: string }) {
  const flag =
    code.length === 2
      ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
      : "";
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 font-mono text-xs">
      {flag && <span aria-hidden>{flag}</span>}
      {code.toUpperCase()}
    </span>
  );
}
