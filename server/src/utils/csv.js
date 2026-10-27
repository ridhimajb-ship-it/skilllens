import { parse } from 'csv-parse/sync';
import { HttpError } from './httpError.js';

/** Parse CSV text into objects keyed by normalized header names. */
export function parseCsv(content) {
  try {
    return parse(content, {
      columns: (header) => header.map(normalizeHeader),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });
  } catch (err) {
    throw new HttpError(400, `Could not parse CSV: ${err.message}`);
  }
}

export function parseJsonRecords(content, key) {
  let data;
  try {
    data = typeof content === 'string' ? JSON.parse(content) : content;
  } catch (err) {
    throw new HttpError(400, `Could not parse JSON: ${err.message}`);
  }
  const records = Array.isArray(data) ? data : data?.[key] ?? data?.records ?? data?.data;
  if (!Array.isArray(records)) throw new HttpError(400, `JSON must be an array or an object with a "${key}" array.`);
  return records.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [normalizeHeader(k), v])));
}

export function normalizeHeader(header) {
  return String(header).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Serialize rows to CSV. Cells that start with = + - @ are prefixed with a quote so that
 * spreadsheet apps do not execute them as formulas (CSV injection).
 */
export function toCsv(rows, columns) {
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    let s = Array.isArray(value) ? value.join('; ') : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label ?? c.key)).join(',');
  const body = rows.map((row) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(','));
  return [header, ...body].join('\r\n');
}
