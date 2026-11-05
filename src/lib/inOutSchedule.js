import { isLoanReturned } from '../../shared/loanRules.js';

export function indexInOutSchedule(records) {
  const outgoingByDate = new Map(), incomingByDate = new Map();
  const add = (map, date, record) => { if (!map.has(date)) map.set(date, []); map.get(date).push(record); };
  for (const record of records) {
    if (record.outIso && !record.hasPickup && !record.pickupDate && record.status !== 'Active' && !record.isReturned && !isLoanReturned(record)) add(outgoingByDate, record.outIso, record);
    if (record.inIso) add(incomingByDate, record.inIso, record);
  }
  return { outgoingByDate, incomingByDate };
}

export function scheduleForDay(index, dateStr, matches = () => true) {
  return { dateStr, outgoing: (index.outgoingByDate.get(dateStr) || []).filter(matches), incoming: (index.incomingByDate.get(dateStr) || []).filter(matches) };
}
