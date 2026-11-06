import AssetAutocomplete from './AssetAutocomplete';
import EquipmentAccessoryList from './EquipmentAccessoryList';
import TimestampField from './TimestampField';
import LoanSummary from './LoanSummary';
import { PC_CATEGORIES } from '../lib/assetCategories';
import { buildLoanReturnDetails } from '../lib/loanForms';

export default function LoanReturnForm({ loan, form, onChange, onConfirm, onClose }) {
  const { missingItems } = buildLoanReturnDetails(loan, form);
  return (
          <div className="return-dialog">
            <div className="modal-header-section">
              <h2>Record return &amp; verify accessories</h2>
              <p className="modal-intro">
                Confirm return of device and verify all accessories (keyboard, mouse, adapter, etc.). Actual return date and checked-in items can be adjusted below.
              </p>
            </div>

            {/* Device & Assignee Summary Card */}
            <LoanSummary loan={loan} returning />

            <div className="pickup-modal-sections">
              {/* Return Timing Column */}
              <div className="pickup-modal-panel">
                <div className="panel-title-row">
                  <h4>📦 Return Timing</h4>
                  <span className="panel-badge-info">Actual Check-in</span>
                </div>
                <p className="field-hint" style={{ marginTop: '2px', marginBottom: '10px' }}>
                  Timestamp defaults to current time. Adjust if the equipment was returned earlier or later.
                </p>

                <TimestampField id="modal-returnDate" label="Actual return timestamp" value={form.returnDate} onChange={(value) => onChange('returnDate', value)} required />

                <div className="field">
                  <label htmlFor="modal-returnLaptop">Laptop returned (asset number)</label>
                  <AssetAutocomplete
                    id="modal-returnLaptop"
                    categoryFilter={PC_CATEGORIES}
                    allowCustom
                    value={form.returnedLaptopCode || ''}
                    onChange={(value) => onChange('returnedLaptopCode', value)}
                    placeholder="Select returned laptop, or clear if missing"
                  />
                  <span className="field-hint">Enter a different laptop if substituted. Leave blank if no laptop was returned.</span>
                </div>

                <div className="return-status-callout">
                  <span className="callout-icon">ℹ️</span>
                  <div>
                    <strong>Device Check-in to IT Department</strong>
                    <p style={{ margin: '3px 0 0', lineHeight: 1.35 }}>
                      The returned laptop will move to available IT inventory. If this field is blank, the originally assigned laptop remains with the assignee and is marked outstanding.
                    </p>
                  </div>
                </div>
              </div>

              {/* Equipment Return Verification Column */}
              <div className="pickup-modal-panel">
                <div className="panel-title-row">
                  <h4>✅ Returned Accessories Checklist</h4>
                  <span className="panel-badge-info">Verify Check-in</span>
                </div>
                <p className="field-hint" style={{ marginTop: '2px', marginBottom: '10px' }}>
                  Verify that keyboard, mouse, and cables were returned. Adjust quantities if any item is retained or missing.
                </p>
                {missingItems.length ? <div className="partial-return-warning"><strong>Partial return</strong><span>Still outstanding: {missingItems.join(', ')}</span></div> : <div className="complete-return-note">All issued accessories are marked returned.</div>}

                <EquipmentAccessoryList form={form} onChange={onChange} idPrefix="return-accessory-" returning />
              </div>
            </div>

            {/* Return Notes / Remarks */}
            <div className="field" style={{ marginTop: '14px' }}>
              <label htmlFor="modal-returnNote">Return condition notes / remarks</label>
              <textarea
                id="modal-returnNote"
                rows={2}
                value={form.note}
                onChange={(e) => onChange('note', e.target.value)}
                placeholder="Optional notes regarding return condition (e.g. Good condition, mouse not returned, damaged adapter, etc.)..."
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="button ghost"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button btn-return"
                style={{ padding: '9px 18px', fontWeight: 700 }}
                onClick={onConfirm}
              >
                ↙ Confirm return &amp; archive
              </button>
            </div>
          </div>
  );
}
