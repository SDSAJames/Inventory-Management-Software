import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import Modal from '../components/Modal';

const savedAt = (value) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
};

export default function BackupsPage() {
  const { user } = useAuth();
  const { setDb } = useDb();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setLoading(true);
    setHistoryError('');
    api.exchange.getBackupStatus().then((result) => {
      if (active) setHistory(result.history || (result.latestBackup ? [result.latestBackup] : []));
    }).catch((failure) => { if (active) setHistoryError(failure.message || 'Could not load restore point history.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAdmin, refresh]);

  const createBackup = async (event) => {
    event.preventDefault();
    if (busy || loading) return;
    setBusy(true);
    setError('');
    try {
      await api.exchange.createBackup(description);
      setDescription('');
      setRefresh((value) => value + 1);
      toast('Restore point created');
    } catch (failure) { setError(failure.message || 'Could not create restore point.'); }
    finally { setBusy(false); }
  };

  const restore = async () => {
    if (!restoreTarget || busy) return;
    setBusy(true);
    setError('');
    let restored = false;
    try {
      await api.exchange.revertData(restoreTarget.id);
      restored = true;
      const [snapshot, categories, statuses] = await Promise.all([
        api.exchange.exportData(), api.directory.getCategories(), api.directory.getStatuses(),
      ]);
      if (!snapshot?.success || !snapshot.db) throw new Error('Could not reload the restored records.');
      setDb((previous) => ({ ...previous, ...snapshot.db, categories: categories.categories || [], statuses: statuses.statuses || [] }));
      toast('Database restored successfully');
    } catch (failure) {
      setError(restored ? 'The database was restored, but the page could not reload the records. Refresh the application before continuing.' : failure.message || 'Could not restore database.');
    } finally {
      if (restored) { setRestoreTarget(null); setRefresh((value) => value + 1); }
      setBusy(false);
    }
  };

  if (!isAdmin) return <p className="admin-error" role="alert">Admin access is required.</p>;
  return <div className="admin-page">
    <div className="view-header">
      <p className="view-subtitle">Create restore points and recover inventory records. Automatic restore points are saved before imports and restores.</p>
      <button type="button" className="button ghost" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>Refresh history</button>
    </div>
    {(historyError || (error && !restoreTarget)) && <p className="admin-error" role="alert">{error || historyError}</p>}
    <section className="panel admin-panel">
      <form className="admin-toolbar" onSubmit={createBackup}>
        <div className="field"><label htmlFor="backup-note">Restore point note (optional)</label>
          <input id="backup-note" value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} placeholder="Before inventory changes" disabled={busy} /></div>
        <button type="submit" className="button" disabled={busy || loading}>{busy && !restoreTarget ? 'Creating…' : 'Create restore point'}</button>
      </form>
    </section>
    <section className="panel admin-panel">
      <div className="panel-heading"><div><h3>Database history</h3><p className="view-subtitle">{loading ? 'Loading restore points…' : `${history.length} recent restore point${history.length === 1 ? '' : 's'}`} · Newest first · Up to 50</p></div></div>
      <div className="admin-table-wrap backup-history-wrap" aria-busy={loading}>
        <table className="admin-table backup-history-table"><thead><tr><th scope="col">Saved</th><th scope="col">Restore point</th><th scope="col">Action</th></tr></thead>
          <tbody>{history.map((snapshot) => <tr key={snapshot.id}>
            <td><time dateTime={snapshot.created_at}>{savedAt(snapshot.created_at)}</time></td>
            <td>{snapshot.description || 'Database restore point'}</td>
            <td><button type="button" className="button ghost" disabled={busy || loading} onClick={() => { setError(''); setRestoreTarget(snapshot); }}>Restore</button></td>
          </tr>)}
          {!history.length && <tr><td colSpan={3}>{loading ? 'Loading history…' : historyError ? 'History could not be loaded. Use Refresh history to try again.' : 'No restore points yet. Create one above or import inventory to save one automatically.'}</td></tr>}</tbody>
        </table>
      </div>
    </section>
    <Modal open={Boolean(restoreTarget)} onClose={() => { if (!busy) setRestoreTarget(null); }}>
      {restoreTarget && <div>
        <h2>Restore database?</h2>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <p><strong>{restoreTarget.description || 'Database restore point'}</strong></p>
        <p>Saved {savedAt(restoreTarget.created_at)}</p>
        <p>Inventory records will be replaced with this restore point. The current database is saved as another restore point first. User accounts are kept.</p>
        <div className="form-actions"><button type="button" className="button ghost" disabled={busy} onClick={() => setRestoreTarget(null)}>Cancel</button>
          <button type="button" className="button danger" disabled={busy} onClick={restore}>{busy ? 'Restoring…' : 'Restore database'}</button></div>
      </div>}
    </Modal>
  </div>;
}
