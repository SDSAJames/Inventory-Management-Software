/** Knox ID is the account's displayed login identity; older accounts may lack one. */
export function accountKnoxId(account = {}) {
  return String(account.knox_id ?? '').trim() || String(account.knoxId ?? '').trim() || String(account.username ?? '').trim();
}
