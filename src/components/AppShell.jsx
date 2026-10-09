import { useState, createContext, useContext } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import PatchHistoryModal from './PatchHistoryModal';

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
          <TopBar onOpenPatchHistory={openPatchHistory} />
          <div id="appView">{children}</div>
        </main>

        <PatchHistoryModal
          open={showPatchHistory}
          onClose={() => setShowPatchHistory(false)}
        />
      </div>
    </PatchHistoryContext.Provider>
  );
}
