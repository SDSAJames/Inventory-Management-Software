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
        loans: [
          {
            id: crypto.randomUUID(),
            ...loanData,
            status: loanData.status || (loanData.pickupDate ? 'Active' : 'Scheduled'),
            isArchived: Boolean(loanData.returnDate || loanData.returnedDate),
          },
          ...prev.loans,
        ],
        employees: nextEmployees,
      };
    });
  }, []);

  const updateLoan = useCallback((id, changes, assetUpdates) => {
    setDb((prev) => {
      const existing = prev.loans.find((l) => l.id === id);
      if (!existing) return prev;

      const merged = { ...existing, ...changes };

      // Automatic lifecycle state detection:
      // If return date is removed -> reverts to Loaned (if pickupDate exists) or Scheduled
      // If pickup date is removed -> reverts to Scheduled
      const hasReturn = Boolean(merged.returnDate || merged.returnedDate);
      const hasPickup = Boolean(merged.pickupDate);

      let computedStatus = merged.status;
      let isArchived = merged.isArchived;

      if (hasReturn) {
        computedStatus = 'Returned';
        isArchived = true;
      } else if (hasPickup) {
        computedStatus = 'Active';
        isArchived = false;
        merged.returnDate = '';
        merged.returnedDate = '';
      } else {
        computedStatus = 'Scheduled';
        isArchived = false;
        merged.pickupDate = '';
        merged.returnDate = '';
        merged.returnedDate = '';
      }

      merged.status = computedStatus;
      merged.isArchived = isArchived;

      const nextLoans = prev.loans.map((l) => (l.id === id ? merged : l));

      // Synchronize asset status
      let nextAssets = prev.assets;
      const assetCode = merged.assetCode || existing.assetCode;

      if (assetCode) {
        const targetAssetStatus = hasReturn
          ? 'Available'
          : hasPickup
          ? 'On loan'
          : 'Available';
        const targetOwner = hasPickup && !hasReturn ? (merged.assignee || '') : '';

        nextAssets = prev.assets.map((a) => {
          if (a.code === assetCode) {
            return {
              ...a,
              ...(assetUpdates || {}),
              status: targetAssetStatus,
              owner: targetOwner,
              location: merged.location || a.location,
              updated: todayIso(),
            };
          }
          return a;
        });
      }

      return { ...prev, loans: nextLoans, assets: nextAssets };
    });
  }, []);

  const pickupLoan = useCallback((id, pickupDate) => {
    setDb((prev) => {
      const loan = prev.loans.find((l) => l.id === id);
      if (!loan) return prev;
      const timestamp = pickupDate || todayIso();
      const nextLoans = prev.loans.map((l) =>
        l.id === id
          ? {
              ...l,
              pickupDate: timestamp,
              status: 'Active',
            }
          : l,
      );
      const nextAssets = prev.assets.map((a) =>
        a.code === loan.assetCode
          ? {
              ...a,
              status: 'On loan',
              owner: loan.assignee || a.owner,
              location: loan.location || a.location,
              updated: todayIso(),
            }
          : a,
      );
      return { ...prev, loans: nextLoans, assets: nextAssets };
    });
  }, []);

  const revertPickup = useCallback((id) => {
    setDb((prev) => {
      const loan = prev.loans.find((l) => l.id === id);
      if (!loan) return prev;
      const nextLoans = prev.loans.map((l) =>
        l.id === id
          ? {
              ...l,
              pickupDate: '',
              status: 'Scheduled',
            }
          : l,
      );
      const nextAssets = prev.assets.map((a) =>
        a.code === loan.assetCode
          ? {
              ...a,
              status: 'Available',
              owner: '',
              updated: todayIso(),
            }
          : a,
      );
      return { ...prev, loans: nextLoans, assets: nextAssets };
    });
  }, []);

  const returnLoan = useCallback((id, returnDate) => {
    setDb((prev) => {
      const loan = prev.loans.find((l) => l.id === id);
      if (!loan) return prev;
      const timestamp = returnDate || todayIso();
      const nextLoans = prev.loans.map((l) =>
        l.id === id
          ? {
              ...l,
              returnDate: timestamp,
              returnedDate: timestamp,
              status: 'Returned',
              isArchived: true,
            }
          : l,
      );
      const nextAssets = prev.assets.map((a) =>
        a.code === loan.assetCode
          ? { ...a, status: 'Available', owner: '', department: '', updated: todayIso() }
          : a,
      );
      return { ...prev, loans: nextLoans, assets: nextAssets };
    });
  }, []);

  const unarchiveLoan = useCallback((id) => {
    setDb((prev) => {
      const loan = prev.loans.find((l) => l.id === id);
      if (!loan) return prev;
      const nextLoans = prev.loans.map((l) =>
        l.id === id
          ? {
              ...l,
              returnDate: '',
              returnedDate: '',
              status: l.pickupDate ? 'Active' : 'Scheduled',
              isArchived: false,
            }
          : l,
      );
      const nextAssets = prev.assets.map((a) =>
        a.code === loan.assetCode
          ? {
              ...a,
              status: l.pickupDate ? 'On loan' : 'Available',
              owner: l.pickupDate ? loan.assignee : '',
              updated: todayIso(),
            }
          : a,
      );
      return { ...prev, loans: nextLoans, assets: nextAssets };
    });
  }, []);

  const deleteLoan = useCallback((id) => {
    setDb((prev) => {
      const loan = prev.loans.find((l) => l.id === id);
      if (!loan) return prev;
      const nextLoans = prev.loans.filter((l) => l.id !== id);

      // If no other active loan uses this asset, restore asset to Available
      let nextAssets = prev.assets;
      const hasOtherActiveLoan = nextLoans.some(
        (l) =>
          l.assetCode === loan.assetCode &&
          (l.status === 'Active' || l.pickupDate) &&
          !l.returnDate &&
          !l.returnedDate,
      );
      if (!hasOtherActiveLoan) {
        nextAssets = prev.assets.map((a) =>
          a.code === loan.assetCode
            ? { ...a, status: 'Available', owner: '', updated: todayIso() }
            : a,
        );
      }
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
    pickupLoan,
    revertPickup,
    returnLoan,
    unarchiveLoan,
    deleteLoan,
    importDb,
    revertImport,
    hasBackup: checkBackup,
  }), [
    db,
    addAsset,
    updateAsset,
    addLoan,
    updateLoan,
    pickupLoan,
    revertPickup,
    returnLoan,
    unarchiveLoan,
    deleteLoan,
    importDb,
    revertImport,
  ]);

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb() {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within <DbProvider>');
  return ctx;
}
