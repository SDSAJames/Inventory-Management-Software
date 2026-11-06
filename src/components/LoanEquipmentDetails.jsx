import { Fragment } from 'react';
import { EQUIPMENT_FIELDS } from '../../shared/equipment.js';

export default function LoanEquipmentDetails({ equipment, others }) {
  return <>
    {EQUIPMENT_FIELDS.map(({ storageKey, label, kind }) => <Fragment key={storageKey}>
      <dt>{kind === 'asset' ? 'Monitor' : label}:</dt><dd>{equipment[storageKey] || '0'}</dd>
    </Fragment>)}
    {others && <><dt>Others:</dt><dd>{others}</dd></>}
  </>;
}
