/** @typedef {{ headers: string[], rows: Record<string, string>[] }} ParsedSheet */

const XLSX_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

/** @type {Promise<typeof import('xlsx')>|null} */
let xlsxPromise = null;

async function loadXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import(/* @vite-ignore */ XLSX_CDN);
  }
  return xlsxPromise;
}

/** @param {string} text */
function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find(line => line.trim()) || '';
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

/**
 * @param {string} text
 * @param {string} [delimiter]
 */
export function parseCsvText(text, delimiter) {
  const delim = delimiter || detectCsvDelimiter(text);
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0], delim).map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cells = parseCsvLine(line, delim);
    /** @type {Record<string, string>} */
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? '').trim();
    });
    return row;
  }).filter(row => Object.values(row).some(v => v));

  return { headers, rows };
}

/**
 * @param {string} line
 * @param {string} delimiter
 * @returns {string[]}
 */
function parseCsvLine(line, delimiter) {
  /** @type {string[]} */
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

/**
 * @param {File} file
 * @returns {Promise<ParsedSheet>}
 */
export async function parseSpreadsheetFile(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    const text = await file.text();
    return parseCsvText(text);
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [] };

    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!matrix.length) return { headers: [], rows: [] };

    const headers = matrix[0].map(cell => String(cell ?? '').trim());
    const rows = matrix.slice(1)
      .map(cells => {
        /** @type {Record<string, string>} */
        const row = {};
        headers.forEach((header, index) => {
          row[header] = String(cells[index] ?? '').trim();
        });
        return row;
      })
      .filter(row => Object.values(row).some(v => v));

    return { headers, rows };
  }

  throw new Error('Поддерживаются файлы .xlsx, .xls и .csv');
}

/**
 * @param {string[][]} rows
 * @param {string} filename
 */
export async function downloadXlsxTemplate(rows, filename) {
  const XLSX = await loadXlsx();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Шаблон');
  XLSX.writeFile(workbook, filename);
}

/** @param {Record<string, string>} row @param {string[]} aliases */
export function pickColumn(row, aliases) {
  for (const alias of aliases) {
    const exact = row[alias];
    if (exact != null && String(exact).trim()) return String(exact).trim();
  }

  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );

  for (const alias of aliases) {
    const value = normalized[normalizeHeader(alias)];
    if (value != null && String(value).trim()) return String(value).trim();
  }

  return '';
}

/** @param {string} value */
function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
