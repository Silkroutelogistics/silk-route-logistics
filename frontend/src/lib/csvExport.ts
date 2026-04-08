/**
 * Client-side CSV export utility.
 * Generates a CSV string from an array of objects and triggers a browser download.
 */

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: string; label: string }[],
  filename: string,
) {
  if (!rows.length) return;

  const header = columns.map((c) => escapeCSV(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCSV(row[c.key])).join(","),
  );
  const csv = [header, ...body].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
