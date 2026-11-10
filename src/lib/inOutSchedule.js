import { isLoanReturned } from '../../shared/loanRules.js';
import { normalizeDateToIso } from './utils.js';

export function filterCalendarRecords(records, hideReturned = false) {
  return hideReturned ? records.filter((record) => !record.isReturned && !isLoanReturned(record)) : records;
}

export function indexInOutSchedule(records) {
  const outgoingByDate = new Map(), incomingByDate = new Map(), pickedUpByDate = new Map();
  const add = (map, date, record) => { if (!map.has(date)) map.set(date, []); map.get(date).push(record); };
  for (const record of records) {
    const pickupDay = normalizeDateToIso(record.pickupDate);
    if (pickupDay) add(pickedUpByDate, pickupDay, record);
    if (record.outIso && !record.hasPickup && !record.pickupDate && record.status !== 'Active' && !record.isReturned && !isLoanReturned(record)) add(outgoingByDate, record.outIso, record);
    if (record.inIso) add(incomingByDate, record.inIso, record);
  }
  return { outgoingByDate, incomingByDate, pickedUpByDate };
}

export function scheduleForDay(index, dateStr, matches = () => true) {
  return { dateStr, outgoing: (index.outgoingByDate.get(dateStr) || []).filter(matches), incoming: (index.incomingByDate.get(dateStr) || []).filter(matches), pickedUp: (index.pickedUpByDate.get(dateStr) || []).filter(matches) };
}
