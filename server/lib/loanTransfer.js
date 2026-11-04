import { randomUUID } from 'node:crypto';
import { splitLoanEquipment } from '../../shared/loanTransfer.js';
import { isLoanReturned } from '../../shared/loanRules.js';

export function transferLoan(database, id, { knoxId, assignee = '', selection = {} }) {
  const source = database.prepare('SELECT * FROM loans WHERE id = ?').get(id);
  if (!source || !source.pickup_date || isLoanReturned(source)) throw new Error('Only picked-up, outstanding equipment can be transferred');
  const targetKnox = String(knoxId || '').trim();
  if (!targetKnox || targetKnox.toLowerCase() === String(source.knox_id).toLowerCase()) throw new Error('Enter a different new owner Knox ID');
  const equipment = { ...JSON.parse(source.equipment_json || '{}'), Laptop: source.asset_code || '', Others: source.others || '' };
  const { remaining, transferred, complete } = splitLoanEquipment(equipment, selection);
  const now = new Date().toISOString();
  const target = { ...source, id: `loan-${randomUUID()}`, asset_code: transferred.Laptop || '', knox_id: targetKnox, assignee: String(assignee).trim(), pickup_date: now, start_date: now.slice(0, 10), status: 'Active', equipment_json: JSON.stringify(transferred), others: transferred.Others || '', note: `Transferred from loan ${source.id} (${source.knox_id}) at ${now}`, return_date: '', returned_date: '', returned_equipment_json: null, return_status: '', is_archived: 0, ready_for_pickup: 0, created_at: now };
  database.exec('SAVEPOINT loan_transfer');
  try {
    const columns = Object.keys(target);
    database.prepare(`INSERT INTO loans (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map((key) => target[key]));
    database.prepare('UPDATE loans SET asset_code = ?, equipment_json = ?, others = ?, note = ?, status = ?, is_archived = ? WHERE id = ?').run(remaining.Laptop || '', JSON.stringify(remaining), remaining.Others || '', `${source.note || ''}\nTransferred ${JSON.stringify(transferred)} to loan ${target.id} (${targetKnox}) at ${now}`, complete ? 'Transferred' : source.status, complete ? 1 : 0, source.id);
    for (const key of ['Laptop', 'Monitor']) {
      if (!transferred[key]) continue;
      const asset = database.prepare('SELECT * FROM assets WHERE code = ? COLLATE NOCASE').get(transferred[key]);
      if (!asset) continue;
      database.prepare('UPDATE assets SET owner = ?, updated = ? WHERE id = ?').run(target.assignee || targetKnox, now.slice(0, 10), asset.id);
      database.prepare('INSERT INTO ownership_history (id, asset_code, previous_owner, new_owner, date, reason, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), asset.code, asset.owner || source.assignee || source.knox_id, target.assignee || targetKnox, now, 'Loan equipment transfer', target.note, now);
    }
    database.exec('RELEASE SAVEPOINT loan_transfer');
    return target.id;
  } catch (error) { database.exec('ROLLBACK TO SAVEPOINT loan_transfer'); database.exec('RELEASE SAVEPOINT loan_transfer'); throw error; }
}
