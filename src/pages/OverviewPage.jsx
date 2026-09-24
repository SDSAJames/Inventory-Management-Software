import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../hooks/useDb';
import StatCard from '../components/StatCard';
import BarChart from '../components/BarChart';
import AssetTable from '../components/AssetTable';
import Modal from '../components/Modal';
import AssetForm from '../components/AssetForm';
import LoanForm from '../components/LoanForm';

export default function OverviewPage() {
  const { db } = useDb();
  const navigate = useNavigate();
  const [modal, setModal] = useState(null); // 'asset' | 'loan' | null

  const available = db.assets.filter((a) => a.status === 'Available').length;
  const assigned = db.assets.filter((a) => ['Assigned', 'On loan'].includes(a.status)).length;
  const issues = db.assets.filter((a) => ['Damaged', 'Under repair'].includes(a.status)).length;
  const overdue = db.loans.filter((l) => l.status === 'Overdue').length;

  const categories = [...new Set(db.assets.map((a) => a.category))]
    .map((cat) => ({ label: cat, count: db.assets.filter((a) => a.category === cat).length }))
    .sort((a, b) => b.count - a.count);

  const recentAssets = [...db.assets]
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''))
    .slice(0, 5);

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Operations overview</h2>
          <p>A live view of your company's asset position.</p>
        </div>
        <button className="button" onClick={() => setModal('asset')}>+ Add asset</button>
      </div>

      <div className="stat-grid">
        <StatCard label="Total assets" value={db.assets.length} note={`Across ${db.locations.length} locations`} />
        <StatCard label="Available now" value={available} note="Ready to assign" />
        <StatCard label="On loan / assigned" value={assigned} note="Currently with a holder" variant="warn" />
        <StatCard label="Needs attention" value={issues + overdue} note={`${issues} asset issues, ${overdue} overdue`} variant="alert" />
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Recently updated</h3>
            <button className="text-button" onClick={() => navigate('/assets')}>View register →</button>
          </div>
          <AssetTable assets={recentAssets} onViewAsset={(id) => setModal(id)} />
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
              <span className="quick-icon">↗</span>Record a loan
            </button>
            <button onClick={() => navigate('/exchange')}>
              <span className="quick-icon">⇄</span>Import Excel
            </button>
          </div>
        </section>
      </div>

      {/* Asset modal */}
      <Modal open={modal === 'asset' || (modal && modal !== 'loan')} onClose={() => setModal(null)}>
        <AssetForm
          assetId={modal !== 'asset' ? modal : undefined}
          onClose={() => setModal(null)}
        />
      </Modal>

      {/* Loan modal */}
      <Modal open={modal === 'loan'} onClose={() => setModal(null)}>
        <LoanForm onClose={() => setModal(null)} />
      </Modal>
    </>
  );
}
