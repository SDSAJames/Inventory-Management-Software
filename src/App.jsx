import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { DbProvider } from './hooks/useDb';
import { ToastProvider } from './hooks/useToast';
import AppShell from './components/AppShell';
import LockScreen from './components/LockScreen';
const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const AssetsPage = lazy(() => import('./pages/AssetsPage'));
const LoansPage = lazy(() => import('./pages/LoansPage'));
const BusinessTravelersPage = lazy(() => import('./pages/BusinessTravelersPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const DirectoryPage = lazy(() => import('./pages/DirectoryPage'));
const ExchangePage = lazy(() => import('./pages/ExchangePage'));
const PatchHistoryPage = lazy(() => import('./pages/PatchHistoryPage'));

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="lockscreen-root">
        <div className="lockscreen-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div className="lockscreen-logo-badge" style={{ margin: '0 auto 18px' }}>
            <svg
              className="lockscreen-logo-svg"
              viewBox="0 0 29 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="StarPlus Energy Logo"
            >
              <path
                d="M28.8537 6.30267L17.7469 0V12.9163L28.8537 19.2189V6.30267ZM12.7844 0L0 7.25467V23.0679L16.0691 32.1867V48L28.8537 40.7452V24.9319L12.7844 15.8133V0ZM0 41.6973L11.1066 48V35.0837L0 28.7811V41.6973Z"
                fill="#1449d6"
              />
            </svg>
          </div>
          <div className="lockscreen-spinner" style={{ margin: '0 auto 12px', width: '24px', height: '24px' }} />
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '500' }}>
            Verifying Security Session...
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LockScreen />;
  }

  return (
    <HashRouter>
      <AppShell>
          <Suspense fallback={<div className="route-loading" role="status">Loading page…</div>}>
          <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/loans" element={<LoansPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/in-out-calendar" element={<Navigate to="/calendar" replace />} />
          <Route path="/business-travelers" element={<BusinessTravelersPage />} />
          <Route path="/travelers" element={<Navigate to="/business-travelers" replace />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/exchange" element={<ExchangePage />} />
          <Route path="/patch-history" element={<PatchHistoryPage />} />
          <Route path="/changelog" element={<Navigate to="/patch-history" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
          </Suspense>
      </AppShell>
    </HashRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DbProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </DbProvider>
    </AuthProvider>
  );
}
