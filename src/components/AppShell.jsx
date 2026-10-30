import { useState, createContext, useContext, lazy, Suspense } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
const PatchHistoryModal = lazy(() => import('./PatchHistoryModal'));

export const PatchHistoryContext = createContext(() => {});
export const usePatchHistoryModal = () => useContext(PatchHistoryContext);

export default function AppShell({ children }) {
  const [showPatchHistory, setShowPatchHistory] = useState(false);
  const openPatchHistory = () => setShowPatchHistory(true);

  return (
    <PatchHistoryContext.Provider value={openPatchHistory}>
      <div className="app-shell">
        <Sidebar onOpenPatchHistory={openPatchHistory} />
        <main className="main-content">
          <TopBar />
          <div id="appView">{children}</div>
        </main>

        {showPatchHistory && <Suspense fallback={null}><PatchHistoryModal open onClose={() => setShowPatchHistory(false)} /></Suspense>}
      </div>
    </PatchHistoryContext.Provider>
  );
}
