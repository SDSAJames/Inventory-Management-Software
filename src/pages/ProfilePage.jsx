import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { authUser } from '../lib/authUser';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.auth.getMe().then((result) => { if (active) setAccount({ ...authUser(result.user), fullName: result.user.full_name ?? result.user.fullName ?? '' }); })
      .catch((failure) => { if (active) setError(failure.message || 'Could not load your profile.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.id, refresh]);
  return <div className="admin-page profile-page">
    <p className="view-subtitle">{(account?.role || user.role) === 'ADMIN' ? 'Update your account details and password.' : 'View your account details and change your password.'}</p>
    {error && <div className="admin-error" role="alert">{error} <button type="button" className="text-button" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
    {loading ? <p role="status">Loading your profile…</p> : account && <div className="profile-panels">
      <ProfileDetails key={account.id + ':' + refresh} account={account} onSave={updateProfile} />
      <ProfilePassword onSave={updateProfile} />
    </div>}
  </div>;
}

function ProfileDetails({ account, onSave }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ fullName: account.fullName, knoxId: account.knoxId, title: account.title }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError('');
    try {
      const saved = await onSave(form);
      setForm({ fullName: saved.fullName, knoxId: saved.knoxId, title: saved.title });
      toast('Profile saved.');
    } catch (failure) { setError(failure.message || 'Could not save your profile.'); }
    finally { setSaving(false); }
  };
  if (account.role !== 'ADMIN') return <section className="panel admin-panel">
    <div className="panel-heading"><h3>My account</h3><span className="assignee-badge">Operator</span></div>
    <dl className="profile-account-details">
      <dt>Full name</dt><dd>{account.fullName || '—'}</dd>
      <dt>Knox ID</dt><dd>{account.knoxId || '—'}</dd>
      <dt>Job title</dt><dd>{account.title || '—'}</dd>
    </dl>
    <p className="field-hint">Ask an admin to update your account details.</p>
  </section>;
  return <form className="panel admin-panel" onSubmit={submit}>
    <div className="panel-heading"><h3>My profile</h3><span className="assignee-badge">{account.role === 'ADMIN' ? 'Admin' : 'Operator'}</span></div>
    <div className="form-grid">
      {[["fullName", "Full name"], ["knoxId", "Knox ID"], ["title", "Job title"]].map(([key, label]) => <div className="field" key={key}>
        <label htmlFor={'profile-' + key}>{label}{key === 'knoxId' ? ' *' : ''}</label>
        <input id={'profile-' + key} value={form[key]} required={key === 'knoxId'} autoComplete={key === 'knoxId' ? 'username' : undefined}
          onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))} />
      </div>)}
    </div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="submit" className="button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></div>
  </form>;
}

function ProfilePassword({ onSave }) {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); if (saving) return;
    setError('');
    if (form.newPassword.length < 6) return setError('New password must be at least 6 characters long.');
    if (form.newPassword !== form.confirmPassword) return setError('The new passwords do not match.');
    setSaving(true);
    try {
      await onSave({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); toast('Password changed.');
    } catch (failure) { setError(failure.message || 'Could not change your password.'); }
    finally { setSaving(false); }
  };
  return <form className="panel admin-panel" onSubmit={submit}>
    <div className="panel-heading"><h3>Change password</h3></div>
    <p className="field-hint">Enter your current password and a new password with at least 6 characters.</p>
    {[["currentPassword", "Current password"], ["newPassword", "New password"], ["confirmPassword", "Confirm new password"]].map(([key, label]) => <div className="field" key={key}>
      <label htmlFor={'profile-' + key}>{label}</label><input id={'profile-' + key} type="password" required minLength={key === 'currentPassword' ? undefined : 6}
        autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'} value={form[key]}
        onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))} />
    </div>)}
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="submit" className="button" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button></div>
  </form>;
}
