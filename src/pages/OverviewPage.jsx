import { assetMix } from '../lib/overviewAssets';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import { isLoanOverdue } from '../lib/utils';
import StatCard from '../components/StatCard';
import BarChart from '../components/BarChart';
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
  const [activeFilter, setActiveFilter] = useState('recent'); // 'recent' | 'all' | 'available' | 'assigned' | 'attention'

  const available = db.assets.filter((a) => a.status === 'Available').length;
  const assigned = db.assets.filter((a) => ['Assigned', 'On loan'].includes(a.status)).length;
  const issues = db.assets.filter((a) => ['Damaged', 'Under repair'].includes(a.status)).length;
  const overdueLoans = db.loans.filter(isLoanOverdue);
  const overdueCount = overdueLoans.length;

  const categories = useMemo(() => assetMix(db.assets), [db.assets]);

  const overdueAssetCodes = useMemo(
    () => new Set(overdueLoans.map((l) => String(l.assetCode || '').toLowerCase())),
    [overdueLoans]
  );

  const displayedAssets = useMemo(() => {
    const sortByUpdated = (arr) => [...arr].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));

    switch (activeFilter) {
      case 'all':
        return sortByUpdated(db.assets);
      case 'available':
        return sortByUpdated(db.assets.filter((a) => a.status === 'Available'));
      case 'assigned':
        return sortByUpdated(db.assets.filter((a) => ['Assigned', 'On loan'].includes(a.status)));
      case 'attention':
        return sortByUpdated(
          db.assets.filter((a) =>
            ['Damaged', 'Under repair'].includes(a.status) || overdueAssetCodes.has(String(a.code || '').toLowerCase())
          )
        );
      case 'recent':
      default:
        return sortByUpdated(db.assets);
    }
  }, [db.assets, activeFilter, overdueAssetCodes]);

  const filterMeta = {
    recent: {
      title: 'Recently updated',
      badge: `${db.assets.length} items`,
      subtitle: 'Latest saved change for each asset, including field details and recorded time',
      linkTarget: '/assets',
      linkText: 'View full register →',
    },
    all: {
      title: 'Total assets',
      badge: `${db.assets.length} items`,
      subtitle: 'All assets in inventory sorted by latest recorded change',
      linkTarget: '/assets',
      linkText: 'Open in asset register →',
    },
    available: {
      title: 'Available now',
      badge: `${available} items`,
      subtitle: 'Assets ready for deployment or assignment sorted by latest recorded change',
      linkTarget: '/assets?status=Available',
      linkText: 'View available in register →',
    },
    assigned: {
      title: 'On loan / assigned',
      badge: `${assigned} items`,
      subtitle: 'Assets currently assigned to staff or on loan sorted by latest recorded change',
      linkTarget: '/assets?status=Assigned',
      linkText: 'View assigned in register →',
    },
    attention: {
      title: 'Needs attention',
      badge: `${issues + overdueCount} items`,
      subtitle: 'Assets damaged, under repair, or linked to overdue loans',
      linkTarget: '/assets?status=Damaged',
      linkText: 'View issues in register →',
    },
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

      <div className="stat-grid">
        <StatCard
          label="Total assets"
          value={db.assets.length}
          note={`Across ${db.locations.length} locations (click to view)`}
          onClick={() => setActiveFilter((prev) => (prev === 'all' ? 'recent' : 'all'))}
          active={activeFilter === 'all'}
        />
        <StatCard
          label="Available now"
          value={available}
          note="Ready to assign (click to view)"
          onClick={() => setActiveFilter((prev) => (prev === 'available' ? 'recent' : 'available'))}
          active={activeFilter === 'available'}
        />
        <StatCard
          label="On loan / assigned"
          value={assigned}
          note="Currently with a holder (click to view)"
          variant="warn"
          onClick={() => setActiveFilter((prev) => (prev === 'assigned' ? 'recent' : 'assigned'))}
          active={activeFilter === 'assigned'}
        />
        <StatCard
          label="Needs attention"
          value={issues + overdueCount}
          note={`${issues} issues, ${overdueCount} overdue (click to view)`}
          variant="alert"
          onClick={() => setActiveFilter((prev) => (prev === 'attention' ? 'recent' : 'attention'))}
          active={activeFilter === 'attention'}
        />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>{filterMeta[activeFilter].title}</h3>
                <span className="batch-chip" style={{ fontSize: '11px', fontWeight: 'bold' }}>
                  {filterMeta[activeFilter].badge}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                {filterMeta[activeFilter].subtitle}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                onClick={() => navigate(filterMeta[activeFilter].linkTarget)}
              >
                {filterMeta[activeFilter].linkText}
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

        <section className="panel">
          <div className="panel-heading">
            <h3>Asset mix</h3>
          </div>
          <BarChart items={categories} total={db.assets.length} />

          <div className="panel-heading" style={{ marginTop: 30 }}>
            <h3>Quick actions</h3>
          </div>
          <div className="quick-actions">
            <button onClick={() => setModal('loan')}>
              <span className="quick-icon">↗</span>Record assignment or loan
            </button>
            <button onClick={() => navigate('/exchange')}>
              <span className="quick-icon">⇄</span>Import Excel
            </button>
          </div>
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
