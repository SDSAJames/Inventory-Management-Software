import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { loadDb, saveDb as persistDb, saveImportBackup, loadImportBackup, clearImportBackup, hasImportBackup as checkBackup } from '../lib/db';
import { todayIso } from '../lib/utils';

const DbContext = createContext(null);

export function DbProvider({ children }) {
  const [db, setDb] = useState(() => loadDb());

  // Auto-persist every change to localStorage
  useEffect(() => {
    persistDb(db);
  }, [db]);

  /* ── Asset operations ───────────────────────────── */

  const addAsset = useCallback((asset) => {
    setDb((prev) => ({ ...prev, assets: [{ id: crypto.randomUUID(), ...asset, updated: todayIso() }, ...prev.assets] }));
  }, []);

  const updateAsset = useCallback((id, changes) => {
    setDb((prev) => ({
      ...prev,
      assets: prev.assets.map((a) => (a.id === id ? { ...a, ...changes, updated: todayIso() } : a)),
    }));
  }, []);

  /* ── Loan operations ────────────────────────────── */

  const addLoan = useCallback((loanData, assetUpdates, newEmployee) => {
    setDb((prev) => {
      const nextAssets = prev.assets.map((a) =>
        a.code === assetUpdates?.code ? { ...a, ...assetUpdates, updated: todayIso() } : a,
      );
      // Auto-create asset if not found
      if (assetUpdates && !prev.assets.some((a) => a.code === assetUpdates.code)) {
        nextAssets.push({
          id: crypto.randomUUID(),
          code: assetUpdates.code,
          name: assetUpdates.code,
          category: 'Laptop',
          model: '',
          serial: '',
          status: assetUpdates.status || 'On loan',
          location: assetUpdates.location || '',
          owner: assetUpdates.owner || '',
          department: assetUpdates.department || '',
          condition: 'Good',
          notes: '',
          updated: todayIso(),
        });
      }
      const nextEmployees = [...prev.employees];
      if (newEmployee && !prev.employees.some((e) => e.name.toLowerCase() === newEmployee.name.toLowerCase())) {
        nextEmployees.push(newEmployee);
      }
      return {
        ...prev,
        assets: nextAssets,
        loans: [{ id: crypto.randomUUID(), ...loanData, status: 'Active' }, ...prev.loans],
        employees: nextEmployees,
      };
    });
  }, []);

  const updateLoan = useCallback((id, changes, assetUpdates) => {
    setDb((prev) => {
      const nextLoans = prev.loans.map((l) => (l.id === id ? { ...l, ...changes } : l));
      let nextAssets = prev.assets;
      if (assetUpdates) {
        nextAssets = prev.assets.map((a) =>
          a.code === assetUpdates.code ? { ...a, ...assetUpdates, updated: todayIso() } : a,
        );
      }
      return { ...prev, loans: nextLoans, assets: nextAssets };
    });
  }, []);

  const returnLoan = useCallback((id) => {
    setDb((prev) => {
      const loan = prev.loans.find((l) => l.id === id);
      if (!loan) return prev;
      const today = todayIso();
      const nextLoans = prev.loans.map((l) =>
        l.id === id ? { ...l, status: 'Returned', returnedDate: today } : l,
      );
      const nextAssets = prev.assets.map((a) =>
        a.code === loan.assetCode
          ? { ...a, status: 'Available', owner: '', department: '', updated: today }
          : a,
      );
      return { ...prev, loans: nextLoans, assets: nextAssets };
    });
  }, []);

  /* ── Import / Revert ────────────────────────────── */

  const importDb = useCallback((newDb) => {
    setDb((prev) => {
      saveImportBackup(prev);
      return newDb;
    });
  }, []);

  const revertImport = useCallback(() => {
    const backup = loadImportBackup();
    if (!backup) return false;
    setDb(backup);
    clearImportBackup();
    return true;
  }, []);

  const value = useMemo(() => ({
    db,
    setDb,
    addAsset,
    updateAsset,
    addLoan,
    updateLoan,
    returnLoan,
    importDb,
    revertImport,
    hasBackup: checkBackup,
  }), [db, addAsset, updateAsset, addLoan, updateLoan, returnLoan, importDb, revertImport]);

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb() {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within <DbProvider>');
  return ctx;
}
