/** Server persistence dates use UTC, matching the existing API/storage contract. */
export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
