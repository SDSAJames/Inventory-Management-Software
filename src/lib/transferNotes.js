import { formatCalendarDateTime } from '../../shared/dateTime.js';

/** Present older machine-generated transfer notes without changing stored history. */
export function readableTransferNote(note, options) {
  return String(note ?? '').split(/\r?\n/).map((line) => {
    const received = line.match(/^Transferred from loan \S+ \(([^)]+)\) at (.+)$/);
    if (received) return `Received equipment from ${received[1]} on ${formatCalendarDateTime(received[2], options)}`;
    const sent = line.match(/^Transferred (\{.+\}) to loan \S+ \(([^)]+)\) at (.+)$/);
    if (sent) {
      try {
        const items = Object.entries(JSON.parse(sent[1])).map(([key, value]) => `${key === 'Dongle' ? 'USB Dongle' : key}: ${value}`).join(', ');
        return `Transferred ${items} to ${sent[2]} on ${formatCalendarDateTime(sent[3], options)}`;
      } catch { return line; }
    }
    if (!/^(?:Transferred |Received |Pickup by transfer:)/.test(line)) return line;
    return line.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/gi, (timestamp) => formatCalendarDateTime(timestamp, options));
  }).join('\n');
}
