function encodeField(value: string | number | null | undefined): string {
  const field = value == null ? "" : String(value);
  return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

export function downloadCsv(
  filename: string,
  header: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const csv = [header, ...rows]
    .map((row) => row.map(encodeField).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
