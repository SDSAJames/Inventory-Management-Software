import { accountKnoxId } from '../../shared/accountIdentity.js';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';

const dateLabel = (value) => {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState(null);
  const isAdmin = currentUser?.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setLoading(true);
    setError('');
    api.auth.getUsers().then((result) => { if (active) setUsers(result.users || []); })
      .catch((failure) => { if (active) setError(failure.message || 'Could not load accounts.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAdmin, refresh]);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((account) => [accountKnoxId(account), account.full_name, account.title, account.role]
      .some((value) => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => (a.full_name || accountKnoxId(a)).localeCompare(b.full_name || accountKnoxId(b), 'en', { sensitivity: 'base' }));
  }, [users, search]);

  const saveAccount = (account, message) => {
    setUsers((previous) => previous.some((item) => item.id === account.id)
      ? previous.map((item) => item.id === account.id ? account : item) : [...previous, account]);
    setDialog(null);
    toast(message);
  };

  if (!isAdmin) return <p role="alert">Admin access is required to manage accounts.</p>;

  return <div className="admin-page">
    <div className="view-header">
      <p className="view-subtitle">Manage operator accounts, access roles and passwords.</p>
      <button type="button" className="button" onClick={() => setDialog({ mode: 'create' })}>+ Add user</button>
    </div>
    <section className="panel admin-panel">
      <div className="admin-toolbar">
        <div className="field"><label htmlFor="account-search">Search accounts</label>
          <input id="account-search" type="search" value={search} placeholder="Name, Knox ID or role" onChange={(event) => setSearch(event.target.value)} />
        </div>
        <span role="status">{visibleUsers.length} of {users.length} accounts</span>
        <button type="button" className="button ghost" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {loading ? <p role="status">Loading accounts…</p> : <div className="table-wrap"><table className="admin-table">
        <thead><tr><th>Name</th><th>Knox ID</th><th>Role</th><th>Title</th><th>Last sign in</th><th>Actions</th></tr></thead>
        <tbody>{visibleUsers.map((account) => <tr key={account.id}>
          <td><strong>{account.full_name || '—'}</strong>{account.id === currentUser.id && <div className="admin-secondary">You</div>}</td>
          <td>{accountKnoxId(account) || '—'}</td><td><span className="assignee-badge">{account.role === 'ADMIN' ? 'Admin' : 'Operator'}</span></td>
          <td>{account.title || '—'}</td><td>{dateLabel(account.last_login)}</td>
          <td><div className="admin-row-actions">
            <button type="button" className="button ghost" onClick={() => setDialog({ mode: 'edit', account })}>Edit</button>
            <button type="button" className="button ghost" onClick={() => setDialog({ mode: 'password', account })}>Reset password</button>
            <button type="button" className="button danger" disabled={account.id === currentUser.id} onClick={() => setDialog({ mode: 'delete', account })}>Delete</button>
          </div></td>
        </tr>)}
          {!visibleUsers.length && <tr><td colSpan={6}>{search ? 'No accounts match your search.' : 'No accounts are available.'}</td></tr>}
        </tbody>
      </table></div>}
    </section>
    <Modal open={Boolean(dialog)} onClose={() => setDialog(null)}>
      {dialog && (dialog.mode === 'delete' ? <DeleteAccount key={dialog.account.id} account={dialog.account}
        onClose={() => setDialog(null)} onDeleted={() => {
          setUsers((previous) => previous.filter((account) => account.id !== dialog.account.id));
          setDialog(null); toast('Account deleted.');
        }} /> : <AccountEditor key={dialog.mode + (dialog.account?.id || '')} mode={dialog.mode} account={dialog.account}
        currentUserId={currentUser.id} onClose={() => setDialog(null)} onSaved={saveAccount} />)}
    </Modal>
  </div>;
}

function AccountEditor({ mode, account, currentUserId, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    fullName: account?.full_name || '', knoxId: account ? accountKnoxId(account) : '',
    title: account?.title || '', role: account?.role || 'OPERATOR', password: '', confirmPassword: '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const passwordOnly = mode === 'password';
  const needsPassword = passwordOnly || mode === 'create';
  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (needsPassword && form.password.length < 6) return setError('Password must be at least 6 characters long.');
    if (needsPassword && form.password !== form.confirmPassword) return setError('The passwords do not match.');
    const payload = passwordOnly ? { password: form.password } : {
      fullName: form.fullName.trim(), knoxId: form.knoxId.trim(), title: form.title.trim(), role: form.role,
      ...(mode === 'create' ? { password: form.password } : {}),
    };
    setSaving(true);
    try {
      const result = mode === 'create' ? await api.auth.createUser(payload) : await api.auth.updateUser(account.id, payload);
      onSaved(result.user, passwordOnly ? 'Password reset successfully.' : mode === 'create' ? 'Account created.' : 'Account updated.');
    } catch (failure) { setError(failure.message || 'Could not save account.'); }
    finally { setSaving(false); }
  };
  return <form onSubmit={submit}>
    <h2>{passwordOnly ? 'Reset password' : mode === 'create' ? 'Add user' : 'Edit account'}</h2>
    <p className="modal-intro">{passwordOnly ? `Set a new password for ${account.full_name ? account.full_name + ' (' + accountKnoxId(account) + ')' : accountKnoxId(account)}.` : 'Use a unique Knox ID to sign in. Passwords are managed separately after creation.'}</p>
    <div className="form-grid">
      {!passwordOnly && <>
        <div className="field"><label htmlFor="account-knox">Knox ID *</label><input id="account-knox" required autoComplete="username" value={form.knoxId} onChange={set('knoxId')} /></div>
        <div className="field"><label htmlFor="account-name">Full name</label><input id="account-name" value={form.fullName} onChange={set('fullName')} /></div>
        <div className="field"><label htmlFor="account-title">Title</label><input id="account-title" value={form.title} onChange={set('title')} /></div>
        <div className="field"><label htmlFor="account-role">Role</label><select id="account-role" value={form.role} disabled={account?.id === currentUserId} onChange={set('role')}><option value="OPERATOR">Operator</option><option value="ADMIN">Admin</option></select></div>
      </>}
      {needsPassword && <>
        <div className="field"><label htmlFor="account-password">New password *</label><input id="account-password" type="password" required minLength={6} autoComplete="new-password" value={form.password} onChange={set('password')} /></div>
        <div className="field"><label htmlFor="account-confirm-password">Confirm password *</label><input id="account-confirm-password" type="password" required minLength={6} autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} /></div>
      </>}
    </div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="button ghost" disabled={saving} onClick={onClose}>Cancel</button>
      <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : passwordOnly ? 'Reset password' : mode === 'create' ? 'Create user' : 'Save changes'}</button></div>
  </form>;
}

function DeleteAccount({ account, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try { await api.auth.deleteUser(account.id); onDeleted(); }
    catch (failure) { setError(failure.message || 'Could not delete account.'); }
    finally { setSaving(false); }
  };
  return <>
    <h2>Delete account?</h2><p>Remove sign-in access for <strong>{account.full_name || 'this account'}</strong> ({accountKnoxId(account)})?</p>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="button ghost" disabled={saving} onClick={onClose}>Cancel</button>
      <button type="button" className="button danger" disabled={saving} onClick={remove}>{saving ? 'Deleting…' : 'Delete account'}</button></div>
  </>;
}
