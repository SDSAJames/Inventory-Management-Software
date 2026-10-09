import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DbProvider } from './hooks/useDb';
import { ToastProvider } from './hooks/useToast';
import AppShell from './components/AppShell';
import OverviewPage from './pages/OverviewPage';
import AssetsPage from './pages/AssetsPage';
import LoansPage from './pages/LoansPage';
import BusinessTravelersPage from './pages/BusinessTravelersPage';
import DirectoryPage from './pages/DirectoryPage';
import ExchangePage from './pages/ExchangePage';
import PatchHistoryPage from './pages/PatchHistoryPage';

export default function App() {
  return (
    <DbProvider>
      <ToastProvider>
        <HashRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/loans" element={<LoansPage />} />
              <Route path="/business-travelers" element={<BusinessTravelersPage />} />
              <Route path="/travelers" element={<Navigate to="/business-travelers" replace />} />
              <Route path="/directory" element={<DirectoryPage />} />
              <Route path="/exchange" element={<ExchangePage />} />
              <Route path="/patch-history" element={<PatchHistoryPage />} />
              <Route path="/changelog" element={<Navigate to="/patch-history" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </HashRouter>
      </ToastProvider>
    </DbProvider>
  );
}
