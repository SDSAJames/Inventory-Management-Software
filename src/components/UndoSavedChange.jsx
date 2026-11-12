import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useDb } from '../hooks/useDb';
import { useToast } from '../hooks/useToast';
import { readableLoanDate } from '../lib/utils';
import Modal from './Modal';

export default function UndoSavedChange() {
  const { db, setDb } = useDb();
  const toast = useToast();
  const [latest, setLatest] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api.changes.latest().then((result) => { if (active) setLatest(result.change); }).catch(() => { if (active) setLatest(null); });
    return () => { active = false; };
  }, [db]);
  const open = async () => {
    setBusy(true);
    try {
      const { change } = await api.changes.latest();
      setLatest(change);
      if (change.available) setReview(change); else toast(change.reason);
    } catch (error) { toast(error.message); }
    finally { setBusy(false); }
  };
  const revert = async () => {
    setBusy(true);
    let reverted = false;
    try {
      await api.changes.undo(review.id);
      reverted = true;
      setReview(null); setLatest(null);
      const [data, categories, statuses] = await Promise.all([api.exchange.exportData(), api.directory.getCategories(), api.directory.getStatuses()]);
      setDb((previous) => ({ ...previous, ...data.db, categories: categories.categories, statuses: statuses.statuses }));
      toast('Last saved change reverted');
    } catch (error) {
      toast(reverted ? 'Change reverted. Reload the page to refresh the displayed records.' : error.message);
      api.changes.latest().then((result) => setLatest(result.change)).catch(() => {});
    } finally { setBusy(false); }
  };
  return <>
    <button type="button" className="button ghost" disabled={busy || !latest?.available} title={latest?.available ? 'Undo: ' + latest.description : latest?.reason || 'No saved change available'} onClick={open}>↶ Revert last change</button>
    <Modal open={Boolean(review)} onClose={() => { if (!busy) setReview(null); }}>
      {review && <div><h2>Revert last saved change?</h2>
        <p><strong>{review.description}</strong></p>
        <p>Saved by {review.username} on {readableLoanDate(review.createdAt)}.</p>
        <p>This restores the records affected by this change, including linked custody and directory updates. It does not restore an import backup or undo earlier changes.</p>
        <div className="form-actions"><button type="button" className="button ghost" disabled={busy} onClick={() => setReview(null)}>Cancel</button><button type="button" className="button" disabled={busy} onClick={revert}>{busy ? 'Reverting…' : 'Revert this change'}</button></div>
      </div>}
    </Modal>
  </>;
}
