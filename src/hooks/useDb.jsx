import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import {
  loadDb,
  saveDb as persistDb,
  saveImportBackup,
  loadImportBackup,
  clearImportBackup,
  hasImportBackup as checkBackup,
  loadTransferReasons,
  saveTransferReasons,
} from '../lib/db';
import { todayIso } from '../lib/utils';
import { reconcileAllAssets, createOwnershipEntry, validateAssetStatus, normalizeHolder } from '../lib/assetIntegrity';
import { DEFAULT_TRANSFER_REASONS } from '../lib/constants';

const DbContext = createContext(null);

export function DbProvider({ children }) {
  const [db, setDb] = useState(() => {
    const raw = loadDb();
    if (raw && raw.assets && raw.loans) {
      // Auto-ensure assets with an existing holder have at least an initial baseline ownership entry
      const assetsWithHistory = raw.assets.map((a) => {
        const normOwner = normalizeHolder(a.owner);
        const normDept = normOwner === 'IT department' ? '' : a.department;
        const assetWithNorm = { ...a, owner: normOwner, department: normDept };
        if ((!assetWithNorm.ownershipHistory || assetWithNorm.ownershipHistory.length === 0) && assetWithNorm.owner) {
          return {
            ...assetWithNorm,
            ownershipHistory: [
              createOwnershipEntry({
                previousOwner: 'None',
                newOwner: assetWithNorm.owner,
                date: assetWithNorm.issuedDate || assetWithNorm.updated || todayIso(),
                reason: assetWithNorm.owner === 'IT department' ? 'Returned to IT department' : 'Initial assignment',
                notes: assetWithNorm.department ? `Department: ${assetWithNorm.department}` : (assetWithNorm.notes || ''),
              }),
            ],
          };
        }
        return assetWithNorm;
      });

      return {
        ...raw,
        assets: reconcileAllAssets(assetsWithHistory, raw.loans),
      };
    }
    return raw;
  });

  const [transferReasons, setTransferReasons] = useState(() => {
    return loadTransferReasons() || DEFAULT_TRANSFER_REASONS;
  });

  const addTransferReason = useCallback((newReason) => {
    const trimmed = String(newReason || '').trim();
    if (!trimmed) return;
    setTransferReasons((prev) => {
      if (prev.some((r) => r.toLowerCase() === trimmed.toLowerCase())) return prev;
      const next = [...prev, trimmed];
      saveTransferReasons(next);
      return next;
    });
  }, []);

  const removeTransferReason = useCallback((reasonToRemove) => {
    setTransferReasons((prev) => {
      const next = prev.filter((r) => r !== reasonToRemove);
      saveTransferReasons(next);
      return next;
    });
  }, []);

  // Auto-persist every change to localStorage
  useEffect(() => {
    persistDb(db);
  }, [db]);

  /* ── Asset operations ───────────────────────────── */

  const addAsset = useCallback((asset) => {
    setDb((prev) => {
      const validated = validateAssetStatus(asset);
      const initialHistory = validated.owner
        ? [createOwnershipEntry({ previousOwner: 'None', newOwner: validated.owner, reason: 'Initial assignment' })]
        : [];
      const newAsset = {
        id: crypto.randomUUID(),
        ...validated,
        ownershipHistory: validated.ownershipHistory || initialHistory,
        updated: todayIso(),
      };
      return { ...prev, assets: [newAsset, ...prev.assets] };
    });
  }, []);

  const updateAsset = useCallback((id, changes) => {
    setDb((prev) => ({
      ...prev,
      assets: prev.assets.map((a) => {
        if (a.id !== id) return a;
        let ownershipHistory = a.ownershipHistory || [];
        if (changes.owner !== undefined && changes.owner !== a.owner) {
          ownershipHistory = [
            createOwnershipEntry({
              previousOwner: a.owner || 'None',
              newOwner: changes.owner || 'None',
              reason: changes.owner ? (a.owner ? 'Transferred' : 'Assigned') : 'Unassigned',
            }),
            ...ownershipHistory,
          ];
        }
        return validateAssetStatus({
          ...a,
          ...changes,
          ownershipHistory,
          updated: todayIso(),
        });
      }),
    }));
  }, []);

  /**
   * Explicitly change the ownership of an asset and record it in the asset's ownership history.
   */
  const changeAssetOwner = useCallback((assetId, { newOwner, department, location, reason, notes, date }) => {
    setDb((prev) => {
      const asset = prev.assets.find((a) => a.id === assetId);
      if (!asset) return prev;

      const previousOwner = asset.owner || '';
      const previousLocation = asset.location || '';
      const effectiveLocation = location !== undefined ? location.trim() : previousLocation;

      const entry = createOwnershipEntry({
        previousOwner: previousOwner || 'None',
        newOwner: newOwner || 'None',
        location: effectiveLocation,
        department: department !== undefined ? department : asset.department,
        date: date || todayIso(),
        reason: reason || (newOwner ? (previousOwner ? 'Transferred' : 'Assigned') : 'Unassigned'),
        notes: notes || '',
      });

      const nextAssets = prev.assets.map((a) => {
        if (a.id !== assetId) return a;
        const newStatus = !newOwner ? 'Available' : 'Assigned';
        return validateAssetStatus({
          ...a,
          owner: newOwner || '',
          department: department !== undefined ? department : a.department,
          location: effectiveLocation,
          status: newStatus,
          ownershipHistory: [entry, ...(a.ownershipHistory || [])],
          updated: todayIso(),
        });
      });

      // Also ensure employee directory has new employee if specified
      let nextEmployees = prev.employees;
      if (newOwner && !prev.employees.some((e) => e.name.toLowerCase() === newOwner.trim().toLowerCase())) {
        nextEmployees = [...prev.employees, { name: newOwner.trim(), department: department || '', position: 'Staff' }];
      }

      // Also ensure locations list contains this location if not empty and not existing
      const nextLocations = [...(prev.locations || [])];
      if (effectiveLocation && !nextLocations.includes(effectiveLocation)) {
        nextLocations.push(effectiveLocation);
      }

      return {
        ...prev,
        assets: nextAssets,
        employees: nextEmployees,
        locations: nextLocations,
      };
    });
  }, []);

  const deleteAsset = useCallback((id) => {
    setDb((prev) => ({
      ...prev,
      assets: prev.assets.filter((a) => a.id !== id),
    }));
  }, []);

  const batchUpdateAssets = useCallback((ids, changes) => {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    setDb((prev) => ({
      ...prev,
      assets: prev.assets.map((a) =>
        idSet.has(a.id) ? validateAssetStatus({ ...a, ...changes, updated: todayIso() }) : a,
      ),
    }));
  }, []);

  /** Append assets or update existing ones if overwriteAssets is true. Saves a restore point. */
  const importAssets = useCallback((newAssets, overwriteAssets = false) => {
    setDb((prev) => {
      saveImportBackup(prev);
      const incomingMap = new Map(newAssets.map((a) => [String(a.code).trim().toLowerCase(), a]));
      let nextAssets;
      if (overwriteAssets) {
        nextAssets = prev.assets.map((a) => {
          const match = incomingMap.get(String(a.code).trim().toLowerCase());
          if (!match) return a;

          let ownershipHistory = a.ownershipHistory || [];
          if (match.owner && match.owner !== a.owner) {
            ownershipHistory = [
              createOwnershipEntry({
                previousOwner: a.owner || 'None',
                newOwner: match.owner,
                reason: 'Excel Import Overwrite',
                date: match.issuedDate || todayIso(),
              }),
              ...ownershipHistory,
            ];
          }

          return {
            ...a,
            ...match,
            id: a.id,
            ownershipHistory,
            updated: todayIso(),
          };
        });
        const existingCodes = new Set(prev.assets.map((a) => String(a.code).trim().toLowerCase()));
        const fresh = newAssets.filter((a) => !existingCodes.has(String(a.code).trim().toLowerCase())).map((fa) => {
          const initialHistory = fa.owner
            ? [createOwnershipEntry({ previousOwner: 'None', newOwner: fa.owner, reason: 'Excel Import' })]
            : [];
          return {
            ...fa,
            ownershipHistory: fa.ownershipHistory || initialHistory,
          };
        });
        nextAssets = [...fresh, ...nextAssets];
      } else {
        const existingCodes = new Set(prev.assets.map((a) => String(a.code).trim().toLowerCase()));
        const fresh = newAssets.filter((a) => !existingCodes.has(String(a.code).trim().toLowerCase())).map((fa) => {
          const initialHistory = fa.owner
            ? [createOwnershipEntry({ previousOwner: 'None', newOwner: fa.owner, reason: 'Excel Import' })]
            : [];
          return {
            ...fa,
            ownershipHistory: fa.ownershipHistory || initialHistory,
          };
        });
        if (!fresh.length) return prev;
        nextAssets = [...fresh, ...prev.assets];
      }

      // Reconcile all assets with current loans to guarantee accurate operational status
      nextAssets = reconcileAllAssets(nextAssets, prev.loans);

      const locations = [...(prev.locations || [])];
      newAssets.forEach((a) => {
        if (a.location && !locations.includes(a.location)) locations.push(a.location);
      });
      return { ...prev, assets: nextAssets, locations };
    });
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
      const nextAssets = prev.assets.map((a) => {
        if (a.code !== loan.assetCode) return a;
        const returnEntry = createOwnershipEntry({
          previousOwner: loan.assignee || 'Borrower',
          newOwner: 'IT department',
          department: 'IT',
          location: loan.location || a.location || 'IT Store',
          reason: 'Loan Returned',
          notes: `Returned to IT department (was borrowed by ${loan.assignee || 'borrower'})`,
          date: timestamp.replace('T', ' '),
        });
        return {
          ...a,
          status: a.status === 'Damaged' || a.status === 'Under repair' || a.status === 'Disposed' ? a.status : 'Available',
          owner: 'IT department',
          department: '',
          ownershipHistory: [returnEntry, ...(a.ownershipHistory || [])],
          updated: todayIso(),
        };
      });
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
              status: loan.pickupDate ? 'On loan' : 'Available',
              owner: loan.pickupDate ? loan.assignee : '',
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

  /**
   * Manual verification and synchronization: reconciles all assets against latest loan states
   */
  const verifyAndSyncAssets = useCallback(() => {
    setDb((prev) => {
      const reconciled = reconcileAllAssets(prev.assets, prev.loans);
      return { ...prev, assets: reconciled };
    });
  }, []);

  const value = useMemo(() => ({
    db,
    setDb,
    addAsset,
    updateAsset,
    changeAssetOwner,
    deleteAsset,
    batchUpdateAssets,
    importAssets,
    verifyAndSyncAssets,
    transferReasons,
    addTransferReason,
    removeTransferReason,
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
    changeAssetOwner,
    deleteAsset,
    batchUpdateAssets,
    importAssets,
    verifyAndSyncAssets,
    transferReasons,
    addTransferReason,
    removeTransferReason,
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
