import { IP_PREFIX } from '../lib/constants';
import { isIpAddressInvalid } from '../lib/ipAddress';

export default function IPAddressFields({ form, onChange, optional = false }) {
  const invalid = isIpAddressInvalid(form);
  return (
    <div className="ip-field">
      <label>IP address {optional && <span className="field-hint">(Optional)</span>}</label>
      <div className="ip-control">
        <span>{IP_PREFIX}</span>
        <input className={invalid && form.ipSubnet ? 'invalid-input' : ''} inputMode="numeric" maxLength={3} placeholder="subnet" aria-label="IP subnet" value={form.ipSubnet} onChange={(event) => onChange('ipSubnet', event.target.value)} />
        <span className="ip-separator">.</span>
        <input className={invalid && form.ipNumber ? 'invalid-input' : ''} inputMode="numeric" maxLength={3} placeholder="number" aria-label="IP number" value={form.ipNumber} onChange={(event) => onChange('ipNumber', event.target.value)} />
        {invalid && <div className="ip-warning visible" role="alert">Each IP value must be between 0 and 255.</div>}
      </div>
    </div>
  );
}
