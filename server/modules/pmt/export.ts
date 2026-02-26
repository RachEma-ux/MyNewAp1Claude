/**
 * PMT Engine — Export Service
 * CSV and JSON export for work items, time entries, cost entries
 */
export function exportToCSV(headers: string[], rows: Record<string, any>[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const val = row[h] ?? "";
      const str = String(val);
      return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(","));
  }
  return lines.join("\n");
}

export function exportToJSON(rows: Record<string, any>[]): string {
  return JSON.stringify(rows, null, 2);
}
