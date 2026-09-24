/**
 * Self-contained XLSX reader, writer, and ZIP builder.
 * Zero external dependencies — runs entirely offline.
 * Extracted from the legacy app.js monolith.
 */

import { xmlEscape } from './utils';

/* ── Helpers ─────────────────────────────────────────── */

function columnName(n) {
  let name = '';
  while (n) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function columnNumber(name) {
  return [...name].reduce((t, c) => t * 26 + c.charCodeAt(0) - 64, 0);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks) {
  const result = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let offset = 0;
  chunks.forEach((c) => { result.set(c, offset); offset += c.length; });
  return result;
}

/* ── ZIP Store (no compression) ──────────────────────── */

function zipStore(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const header = new ArrayBuffer(30 + nameBytes.length);
    const view = new DataView(header);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    new Uint8Array(header, 30).set(nameBytes);
    chunks.push(new Uint8Array(header), data);

    const directory = new ArrayBuffer(46 + nameBytes.length);
    const dir = new DataView(directory);
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0, true);
    dir.setUint16(10, 0, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    new Uint8Array(directory, 46).set(nameBytes);
    central.push(new Uint8Array(directory));

    offset += header.byteLength + data.length;
  });

  const centralBytes = concatBytes(central);
  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralBytes.length, true);
  endView.setUint32(16, offset, true);
  return concatBytes([...chunks, centralBytes, new Uint8Array(end)]).buffer;
}

/* ── Write XLSX ──────────────────────────────────────── */

export async function makeXlsx(rows) {
  const shared = [];
  const sharedIndex = new Map();
  const sharedValue = (v) => {
    const text = String(v ?? '');
    if (!sharedIndex.has(text)) { sharedIndex.set(text, shared.length); shared.push(text); }
    return sharedIndex.get(text);
  };

  const sheetRows = rows.map((row, ri) =>
    `<row r="${ri + 1}">${row.map((v, ci) => {
      const cell = `${columnName(ci + 1)}${ri + 1}`;
      return `<c r="${cell}" t="s"><v>${sharedValue(v)}</v></c>`;
    }).join('')}</row>`,
  ).join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:S${rows.length}"/><sheetData>${sheetRows}</sheetData></worksheet>`;
  const strings = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((v) => `<si><t>${xmlEscape(v)}</t></si>`).join('')}</sst>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;

  return zipStore([
    ['[Content_Types].xml', types],
    ['_rels/.rels', rootRels],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', rels],
    ['xl/worksheets/sheet1.xml', sheet],
    ['xl/sharedStrings.xml', strings],
  ]);
}

/* ── Read XLSX ───────────────────────────────────────── */

export async function readXlsx(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new TextDecoder();
  const files = {};
  let offset = 0;

  while (offset + 30 < bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) { offset++; continue; }
    const method = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const nameSize = view.getUint16(26, true);
    const extraSize = view.getUint16(28, true);
    const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameSize));
    const start = offset + 30 + nameSize + extraSize;
    const compressed = bytes.slice(start, start + compressedSize);
    let data = compressed;
    if (method === 8) {
      const stream = new DecompressionStream('deflate-raw');
      data = new Uint8Array(
        await new Response(new Blob([compressed]).stream().pipeThrough(stream)).arrayBuffer(),
      );
    }
    files[name] = decoder.decode(data);
    offset = start + compressedSize;
  }

  const strings = [...(files['xl/sharedStrings.xml'] || '').matchAll(
    /<si>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/si>/g,
  )].map((m) => new DOMParser().parseFromString(`<t>${m[1]}</t>`, 'text/xml').documentElement.textContent);

  const sheet = files['xl/worksheets/sheet1.xml'] || '';
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const row = [];
    [...rowMatch[1].matchAll(/<c([^>]*)>\s*<v>([\s\S]*?)<\/v>\s*<\/c>/g)].forEach((cell) => {
      const ref = cell[1].match(/\br="([A-Z]+)\d+"/);
      const type = cell[1].match(/\bt="([^"]+)"/);
      const value = type?.[1] === 's' ? strings[Number(cell[2])] || '' : cell[2];
      if (ref) row[columnNumber(ref[1]) - 1] = value;
    });
    return row;
  });
}

/* ── Download helper ─────────────────────────────────── */

export function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
