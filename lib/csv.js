// CSV helpers (RFC 4180 + guard against spreadsheet formula injection).
export function toCsv(rows, columns) {
  const cell = (v) => {
    let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formulas, but let plain numbers/phones (+971…) through.
    if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d\s.]*$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => c.label).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))].join('\r\n');
}
