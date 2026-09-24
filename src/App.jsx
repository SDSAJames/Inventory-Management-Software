import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DbProvider } from './hooks/useDb';
import { ToastProvider } from './hooks/useToast';
import AppShell from './components/AppShell';
import OverviewPage from './pages/OverviewPage';
import AssetsPage from './pages/AssetsPage';
import LoansPage from './pages/LoansPage';
import DirectoryPage from './pages/DirectoryPage';
import ExchangePage from './pages/ExchangePage';

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
              <Route path="/directory" element={<DirectoryPage />} />
              <Route path="/exchange" element={<ExchangePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </HashRouter>
      </ToastProvider>
    </DbProvider>
  );
}
