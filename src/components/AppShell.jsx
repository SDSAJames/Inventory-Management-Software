import { useState, createContext, useContext, lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
const PatchHistoryModal = lazy(() => import('./PatchHistoryModal'));

export const PatchHistoryContext = createContext(() => {});
export const usePatchHistoryModal = () => useContext(PatchHistoryContext);

export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  const [showPatchHistory, setShowPatchHistory] = useState(false);
  const openPatchHistory = () => setShowPatchHistory(true);

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <PatchHistoryContext.Provider value={openPatchHistory}>
      <div className="app-shell">
        <Sidebar onOpenPatchHistory={openPatchHistory} />
        <main className="main-content" ref={mainRef}>
          <TopBar />
          <div id="appView">{children}</div>
        </main>

        {showPatchHistory && <Suspense fallback={null}><PatchHistoryModal open onClose={() => setShowPatchHistory(false)} /></Suspense>}
      </div>
    </PatchHistoryContext.Provider>
  );
}
