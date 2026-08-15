const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string): string {
  if (code.length !== 2) return code;
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function CountryChip({ code, short = false }: { code: string; short?: boolean }) {
  const upper = code.toUpperCase();
  const flag =
    upper.length === 2
      ? String.fromCodePoint(...[...upper].map((c) => 0x1f1a5 + c.charCodeAt(0)))
      : "";
  const name = countryName(upper);
  return (
    <span
      className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-xs"
      title={short ? name : upper}
    >
      {flag && <span aria-hidden>{flag}</span>}
      {short ? <span className="sr-only">{name}</span> : <span className="truncate">{name}</span>}
    </span>
  );
}
