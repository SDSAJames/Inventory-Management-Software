import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDelimitedText, parseEquipmentsText, detectFileType } from '../src/lib/txtImport.js';
import { parseAssetRows, assetsToRows } from '../src/lib/assetExcel.js';
import { MES_ASSET_HEADERS, isMesEquipment } from '../src/lib/equipmentSchema.js';
import { matchesAssetCategory, MONITOR_CATEGORIES } from '../src/lib/assetCategories.js';
import { makeXlsx, readXlsx } from '../src/lib/xlsx.js';
test('MES example imports both identities and exports a real Excel workbook with the same eleven columns', async () => {
  const rows = parseDelimitedText(readFileSync(new URL('../data/SPE_MES_Equipments_example.txt', import.meta.url), 'utf8'));
  assert.equal(detectFileType(rows), 'equipments');
  assert.deepEqual(rows[0], MES_ASSET_HEADERS);
  const assets = parseEquipmentsText(rows).assets;
  assert.equal(assets.length, 2);
  assert.equal(assets[0].owner, 'sja.wikja');
  assert.equal(assets[0].issuedName, 'sja wikaja');
  assert.equal(assets[0].purchaseDate, '2026-01-02');
  assert.equal(assets[1].issuedName, 'okay');
  assert.equal(matchesAssetCategory(assets[1].category, MONITOR_CATEGORIES), true);
  assert.equal(isMesEquipment({ code: 'AST-1', category: 'Laptop' }), false);
  assert.ok(assets.every(isMesEquipment));
  const output = assetsToRows(assets, MES_ASSET_HEADERS, { appendOptionalColumns: false });
  assert.equal(output[0].length, 11);
  const workbook = await makeXlsx(output);
  // Node has no DOMParser; supply only the XML text-node interface used by the browser reader.
  const originalParser = globalThis.DOMParser;
  globalThis.DOMParser = class {
    parseFromString(xml) {
      const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#039': "'" };
      return { documentElement: { textContent: xml.slice(3, -4).replace(/&(amp|lt|gt|quot|apos|#039);/g, (_, name) => entities[name]) } };
    }
  };
  let importedRows;
  try { importedRows = await readXlsx(new Blob([workbook])); }
  finally { if (originalParser) globalThis.DOMParser = originalParser; else delete globalThis.DOMParser; }
  assert.deepEqual(importedRows, output);
  const reread = parseAssetRows(importedRows, []).added;
  assert.deepEqual(reread.map((asset) => [asset.code, asset.owner, asset.issuedName, asset.issuedDate, asset.category]), assets.map((asset) => [asset.code, asset.owner, asset.issuedName, asset.issuedDate, asset.category]));
});
