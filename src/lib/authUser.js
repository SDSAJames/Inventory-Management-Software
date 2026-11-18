import { accountKnoxId } from '../../shared/accountIdentity.js';

/** One account shape for sign-in, session checks and profile saves. */
export function authUser(account = {}) {
  return {
    id: account.id,
    username: accountKnoxId(account),
    knoxId: accountKnoxId(account),
    fullName: account.full_name || account.fullName || accountKnoxId(account) || 'Staff',
    role: account.role || 'OPERATOR',
    title: account.title || '',
  };
}
