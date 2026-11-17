import { assetMix, assetLocationMix, assetsWithCustodyActivity } from '../lib/overviewAssets';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { overviewDashboardMetrics } from '../lib/overviewMetrics';
import StatCard from '../components/StatCard';
import DistributionChart from '../components/DistributionChart';
import LocationDistribution from '../components/LocationDistribution';
import useAssetSelection from '../hooks/useAssetSelection';
import { RowCountSelect, SelectionCount } from '../components/Pagination';
import AssetTable from '../components/AssetTable';
import Modal from '../components/Modal';
import LoanForm from '../components/LoanForm';
import AssetForm from '../components/AssetForm';
import ChangeOwnerModal from '../components/ChangeOwnerModal';

export default function OverviewPage() {
  const { db } = useDb();
  const navigate = useNavigate();
  const [pageSize, setPageSize] = useState(15);
  const { selectedIds, setSelectedIds, handleToggleSelect, handleToggleSelectAll, handleRangeSelect } = useAssetSelection();
  const [modal, setModal] = useState(null); // 'asset' | 'loan' | assetId | null
  const [ownerTargetAsset, setOwnerTargetAsset] = useState(null);
  const [activeFilter, setActiveFilter] = useState('recent');

  const categories = useMemo(() => assetMix(db.assets), [db.assets]);
  const locations = useMemo(() => assetLocationMix(db.assets), [db.assets]);
  const overviewAssets = useMemo(() => assetsWithCustodyActivity(db.assets, db.loans), [db.assets, db.loans]);
  const { assetGroups, overdue, unreturned, currentTravelers } = useMemo(
    () => overviewDashboardMetrics(overviewAssets, db.loans), [overviewAssets, db.loans],
  );
  const displayedAssets = assetGroups[activeFilter] || overviewAssets;
  const assetCards = [
    { key: 'all', label: 'Total assets', note: 'All inventory assets' },
    { key: 'available', label: 'Available now', note: 'Assets ready to assign' },
    { key: 'assigned', label: 'Assigned assets', note: 'Permanent assignments' },
    { key: 'loaned', label: 'Loaned assets', note: 'Equipment on loan', variant: 'warn' },
    { key: 'broken', label: 'Broken assets', note: 'Damaged equipment', variant: 'alert' },
    { key: 'repair', label: 'Under repair', note: 'Assets being serviced', variant: 'warn' },
  ];
  const selectedCard = assetCards.find((card) => card.key === activeFilter);
  const filterMeta = selectedCard ? {
    title: selectedCard.label,
    badge: `${displayedAssets.length} items`,
    subtitle: selectedCard.note + ', sorted by latest recorded change',
    linkTarget: activeFilter === 'all' || activeFilter === 'broken' ? '/assets' : '/assets?status=' + encodeURIComponent({ available: 'Available', assigned: 'Assigned', loaned: 'On loan', repair: 'Under repair' }[activeFilter]),
    linkText: activeFilter === 'all' || activeFilter === 'broken' ? 'View full register →' : 'Open asset register →',
  } : {
    title: 'Recently updated',
    badge: `${db.assets.length} items`,
    subtitle: 'Latest asset or assignment change, including details, editor and recorded time',
    linkTarget: '/assets',
    linkText: 'View full register →',
  };

  return (
    <>
      <div className="view-header">
        <div>
          <SelectionCount count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />
          <p className="view-subtitle">Real-time equipment allocation, fleet availability, and custody records.</p>
        </div>
        <div className="view-header-actions"><button className="button" onClick={() => setModal('asset')}>+ Register asset</button>
          <RowCountSelect value={pageSize} onChange={setPageSize} /></div>
      </div>


      <div className="content-grid overview-grid">
        <section className="panel overview-dashboard-panel" aria-label="Asset dashboard">
          <div className="overview-dashboard">
            <div>
              <div className="panel-heading"><h3>Asset mix</h3></div>
              <DistributionChart items={categories} label="Asset mix" />
            </div>
            <div>
              <div className="panel-heading"><h3>Asset locations</h3></div>
              <LocationDistribution items={locations} />
            </div>
            <div className="stat-grid overview-stats" aria-label="Asset summary">
              {assetCards.map(({ key, label, note, variant }) => <StatCard
                key={key} label={label} value={assetGroups[key].length} note={note} variant={variant}
                onClick={() => setActiveFilter((previous) => previous === key ? 'recent' : key)} active={activeFilter === key}
              />)}
              <StatCard label="Overdue loans" value={overdue.length} note="Past-due custody records" variant="alert"
                onClick={() => navigate('/loans?tab=overdue')} />
              <StatCard label="Unreturned records" value={unreturned.length} note="Partial returns, items missing" variant="alert"
                onClick={() => navigate('/loans?tab=unreturned')} />
              <StatCard label="Business travelers" value={currentTravelers} note="Unique people holding equipment"
                onClick={() => navigate('/business-travelers')} />
            </div>
          </div>
          <div className="overview-quick-actions">
            <h3>Quick actions</h3>
            <div className="quick-actions">
              <button onClick={() => setModal('loan')}>
                <span className="quick-icon">↗</span>Record assignment or loan
              </button>
              <button onClick={() => navigate('/exchange')}>
                <span className="quick-icon">⇄</span>Import Excel
              </button>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>{filterMeta.title}</h3>
                <span className="batch-chip" style={{ fontSize: '11px', fontWeight: 'bold' }}>
                  {filterMeta.badge}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                {filterMeta.subtitle}
              </p>
            </div>
            <div className="overview-panel-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {activeFilter !== 'recent' && (
                <button
                  type="button"
                  className="text-button"
                  style={{ textDecoration: 'underline' }}
                  onClick={() => setActiveFilter('recent')}
                  title="Switch back to recently updated assets"
                >
                  ⟲ Show recently updated
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => navigate(filterMeta.linkTarget)}
              >
                {filterMeta.linkText}
              </button>
            </div>
          </div>
          <AssetTable
            assets={displayedAssets}
            pageSize={pageSize} resetKey={activeFilter} initialSort={{ key: 'activityTime', dir: 'desc' }} showLatestChange
            selectedIds={selectedIds} onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll} onRangeSelect={handleRangeSelect}
            showUpdatedDate={true}
            onViewAsset={(id) => setModal(id)}
            onChangeOwner={(asset) => setOwnerTargetAsset(asset)}
          />
        </section>


      </div>

      {/* Asset modal */}
      <Modal open={modal === 'asset' || (modal && modal !== 'loan')} size="wide" onClose={() => setModal(null)}>
        {(modal === 'asset' || (modal && modal !== 'loan')) && (
          <AssetForm
            assetId={modal !== 'asset' ? modal : undefined}
            onClose={() => setModal(null)}
            onOpenChangeOwner={(asset) => setOwnerTargetAsset(asset)}
          />
        )}
      </Modal>

      {/* Change Owner Modal */}
      <Modal open={ownerTargetAsset !== null} onClose={() => setOwnerTargetAsset(null)}>
        {ownerTargetAsset && (
          <ChangeOwnerModal
            asset={ownerTargetAsset}
            onClose={() => setOwnerTargetAsset(null)}
            onDone={() => setOwnerTargetAsset(null)}
          />
        )}
      </Modal>

      {/* Loan modal */}
      <Modal open={modal === 'loan'} size="wide" onClose={() => setModal(null)}>
        {modal === 'loan' && <LoanForm defaultAssigneeType="Employee" onClose={() => setModal(null)} />}
      </Modal>
    </>
  );
}
