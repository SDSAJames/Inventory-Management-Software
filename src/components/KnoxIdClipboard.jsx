import { useRef } from 'react';
import { knoxRecipientList } from '../lib/travelerFollowUp';
import { copyTextToClipboard } from '../lib/clipboard';
import { useToast } from '../hooks/useToast';

export default function KnoxIdClipboard({ records, label = 'Knox ID list' }) {
  const toast = useToast();
  const fieldRef = useRef(null);
  const recipients = knoxRecipientList(records);

  const copy = async () => {
    if (await copyTextToClipboard(recipients)) {
      toast('Knox ID list copied');
      return;
    }
    fieldRef.current?.focus();
    fieldRef.current?.select();
    toast('Copy failed. The list is selected below; press Ctrl+C to copy it.');
  };

  return <div className="knox-id-clipboard">
    <div className="knox-id-clipboard-heading">
      <strong>{label}</strong>
      <button type="button" className="button" disabled={!recipients} onClick={copy}>Copy Knox IDs</button>
    </div>
    <textarea ref={fieldRef} aria-label={`${label} Knox IDs`} readOnly value={recipients} rows={2} />
  </div>;
}
