import AssetTable from './AssetTable';

/** Keep the Assets and MES register layouts consistent, including location drilldowns. */
export default function AssetRegisterTable(props) {
  return <AssetTable {...props} showDepartment showUpdatedDate={false} />;
}
