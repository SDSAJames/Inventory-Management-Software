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
import { seed } from '../data/seed';
import { todayIso, isLoanOverdue } from '../lib/utils';
import { reconcileAllAssets, createOwnershipEntry, validateAssetStatus, normalizeHolder } from '../lib/assetIntegrity';
import { DEFAULT_TRANSFER_REASONS } from '../lib/constants';
import { api } from '../lib/api';

const DbContext = createContext(null);

export function DbProvider({ children }) {
  const [db, setDb] = useState(() => {
    const raw = loadDb();
    if (raw && raw.assets && raw.loans) {
      // Ensure baseline seed assets like SPE-4321 are present
      const existingCodes = new Set(raw.assets.map((a) => a.code));
      for (const sa of (seed.assets || [])) {
        if (!existingCodes.has(sa.code)) {
          raw.assets.push(sa);
        }
      }
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

  // Auto-persist every change to localStorage (local cache)
  useEffect(() => {
    persistDb(db);
  }, [db]);

  // Synchronize with central corporate intranet SQLite server database
  useEffect(() => {
    let active = true;

    const fetchLatestFromServer = async () => {
      // Only sync if user is signed in
      const token = typeof window !== 'undefined' ? localStorage.getItem('starplusenergy-token') : null;
      const authUser = typeof window !== 'undefined' ? localStorage.getItem('starplusenergy-auth-user') : null;
      if (!token && !authUser) return;

      try {
        const res = await api.exchange.exportData();
        if (!active || !res?.success || !res?.db) return;
        const serverDb = res.db;

        if (serverDb.assets?.length || serverDb.loans?.length) {
          setDb((prev) => ({
            ...prev,
            assets: reconcileAllAssets(serverDb.assets || [], serverDb.loans || []),
            loans: serverDb.loans || [],
            employees: serverDb.employees?.length ? serverDb.employees : prev.employees,
            departments: serverDb.departments?.length ? serverDb.departments : prev.departments,
            locations: serverDb.locations?.length ? serverDb.locations : prev.locations,
          }));
        } else {
          // If server database is newly created, seed it with initial baseline data
          const local = loadDb();
          if (local?.assets?.length || local?.loans?.length) {
            await api.exchange.importData({
              assets: local.assets || [],
              loans: local.loans || [],
              overwrite: true,
            });
          }
        }
      } catch (err) {
        // Operates smoothly offline/from local cache if server is offline
      }
    };

    fetchLatestFromServer();

    // Re-synchronize when user returns to this tab so edits from other intranet hosts appear immediately
    const handleFocus = () => {
      fetchLatestFromServer();
    };
    window.addEventListener('focus', handleFocus);

    // Periodic sync every 15s across corporate intranet hosts
    const interval = setInterval(fetchLatestFromServer, 15000);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, []);

  /* ── Asset operations ───────────────────────────── */

  const addAsset = useCallback((asset) => {
    const validated = validateAssetStatus(asset);
    const initialHistory = validated.owner
      ? [createOwnershipEntry({ previousOwner: 'None', newOwner: validated.owner, reason: 'Initial assignment' })]
      : [];
    const newAsset = {
      id: asset.id || crypto.randomUUID(),
      ...validated,
      ownershipHistory: validated.ownershipHistory || initialHistory,
      updated: todayIso(),
    };
    setDb((prev) => ({ ...prev, assets: [newAsset, ...prev.assets] }));
    api.assets.create(newAsset).catch((err) => console.warn('Could not sync asset to server:', err.message));
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
    api.assets.update(id, changes).catch((err) => console.warn('Could not sync asset update to server:', err.message));
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

    api.assets.transfer(assetId, { newOwner, department, location, reason, notes, date })
      .catch((err) => console.warn('Could not sync ownership transfer to server:', err.message));
  }, []);

  const deleteAsset = useCallback((id) => {
    setDb((prev) => ({
      ...prev,
      assets: prev.assets.filter((a) => a.id !== id),
    }));
    api.assets.delete(id).catch((err) => console.warn('Could not sync asset deletion to server:', err.message));
  }, []);

  const batchUpdateAssets = useCallback((ids, changes) => {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    setDb((prev) => ({
      ...prev,
      assets: prev.assets.map((a) =>
        idSet.has(a.id) ? validateAssetStatus({ ...a, ...changes, updated: todayIso() }) : a,
      ),
    }));
    api.assets.batchUpdate([...idSet], changes).catch((err) => console.warn('Could not sync batch asset update to server:', err.message));
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

    return api.exchange.importData({ assets: newAssets, overwrite: overwriteAssets })
      .catch((err) => {
        console.warn('Could not sync imported assets to server:', err.message);
        return { success: false, error: err.message };
      });
  }, []);

  /* ── Loan operations ────────────────────────────── */

  const addLoan = useCallback((loanData, assetUpdates, newEmployee) => {
    const loanId = loanData.id || crypto.randomUUID();
    const effectiveLoan = {
      id: loanId,
      ...loanData,
      status: loanData.status || (isLoanOverdue(loanData) ? 'Overdue' : (loanData.pickupDate ? 'Active' : 'Scheduled')),
      isArchived: Boolean(loanData.returnDate || loanData.returnedDate),
    };

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
        loans: [effectiveLoan, ...prev.loans],
        employees: nextEmployees,
      };
    });

    api.loans.create(effectiveLoan).catch((err) => console.warn('Could not sync loan creation to server:', err.message));
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
      } else if (isLoanOverdue(merged)) {
        computedStatus = 'Overdue';
        isArchived = false;
        merged.returnDate = '';
        merged.returnedDate = '';
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

    api.loans.update(id, changes).catch((err) => console.warn('Could not sync loan update to server:', err.message));
  }, []);

  const pickupLoan = useCallback((id, pickupDate, details = {}) => {
    const timestamp = pickupDate || todayIso();
    setDb((prev) => {
      const loan = prev.loans.find((l) => l.id === id);
      if (!loan) return prev;
      const merged = {
        ...loan,
        ...details,
        pickupDate: timestamp,
      };
      if (details.equipment) {
        merged.equipment = {
          ...(loan.equipment || {}),
          ...details.equipment,
        };
      }
      const nextLoans = prev.loans.map((l) =>
        l.id === id
          ? {
              ...merged,
              status: isLoanOverdue({ ...merged, pickupDate: timestamp, returnDate: '', returnedDate: '' }) ? 'Overdue' : 'Active',
            }
          : l,
      );
      const effectiveAssetCode = details.assetCode || loan.assetCode;
      const nextAssets = prev.assets.map((a) =>
        a.code === effectiveAssetCode
          ? {
              ...a,
              status: 'On loan',
              owner: details.assignee || loan.assignee || a.owner,
              location: details.location || loan.location || a.location,
              updated: todayIso(),
            }
          : a,
      );
      return { ...prev, loans: nextLoans, assets: nextAssets };
    });

    api.loans.pickup(id, { pickupDate: timestamp, ...details }).catch((err) => console.warn('Could not sync loan pickup to server:', err.message));
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
              status: isLoanOverdue({ ...l, pickupDate: '', returnDate: '', returnedDate: '' }) ? 'Overdue' : 'Scheduled',
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

    api.loans.revertPickup(id).catch((err) => console.warn('Could not sync revert pickup to server:', err.message));
  }, []);

  const returnLoan = useCallback((id, returnDate, details = {}) => {
    const timestamp = returnDate || todayIso();
    setDb((prev) => {
      const loan = prev.loans.find((l) => l.id === id);
      if (!loan) return prev;
      const merged = {
        ...loan,
        ...details,
        returnDate: timestamp,
        returnedDate: timestamp,
        status: 'Returned',
        isArchived: true,
      };
      if (details.equipment) {
        merged.equipment = {
          ...(loan.equipment || {}),
          ...details.equipment,
        };
      }
      const nextLoans = prev.loans.map((l) =>
        l.id === id ? merged : l,
      );
      const effectiveAssetCode = details.assetCode || loan.assetCode;
      const nextAssets = prev.assets.map((a) => {
        if (a.code !== effectiveAssetCode) return a;
        const returnEntry = createOwnershipEntry({
          previousOwner: details.assignee || loan.assignee || 'Borrower',
          newOwner: 'IT department',
          department: 'IT',
          location: details.location || loan.location || a.location || 'IT Store',
          reason: 'Loan Returned',
          notes: details.note || `Returned to IT department (was borrowed by ${details.assignee || loan.assignee || 'borrower'})`,
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

    api.loans.returnLoan(id, { returnDate: timestamp, ...details }).catch((err) => console.warn('Could not sync loan return to server:', err.message));
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
              status: isLoanOverdue({ ...l, returnDate: '', returnedDate: '' })
                ? 'Overdue'
                : l.pickupDate ? 'Active' : 'Scheduled',
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

    api.loans.unarchive(id).catch((err) => console.warn('Could not sync loan unarchive to server:', err.message));
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

    api.loans.delete(id).catch((err) => console.warn('Could not sync loan deletion to server:', err.message));
  }, []);

  /* ── Import / Revert ────────────────────────────── */

  const importDb = useCallback(async (newDb) => {
    setDb((prev) => {
      saveImportBackup(prev);
      const reconciledAssets = reconcileAllAssets(newDb.assets || [], newDb.loans || []);
      return {
        ...newDb,
        assets: reconciledAssets,
      };
    });

    try {
      return await api.exchange.importData({
        assets: newDb.assets || [],
        loans: newDb.loans || [],
        overwrite: true,
      });
    } catch (err) {
      console.warn('Could not sync imported database to server:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const mergeImportData = useCallback(({ assets: incomingAssets = [], loans: incomingLoans = [] }) => {
    setDb((prev) => {
      saveImportBackup(prev);
      let nextAssets = [...prev.assets];
      let nextLoans = [...prev.loans];
      let nextEmployees = [...(prev.employees || [])];
      const nextLocations = new Set(prev.locations || []);

      // 1. Merge Assets
      if (incomingAssets && incomingAssets.length) {
        const existingCodes = new Map(nextAssets.map((a, i) => [String(a.code || '').toLowerCase(), i]));
        incomingAssets.forEach((inc) => {
          const key = String(inc.code || '').toLowerCase();
          if (existingCodes.has(key)) {
            const idx = existingCodes.get(key);
            const curr = nextAssets[idx];
            let ownershipHistory = curr.ownershipHistory || [];
            if (inc.owner && inc.owner !== curr.owner) {
              ownershipHistory = [
                createOwnershipEntry({
                  previousOwner: curr.owner || 'None',
                  newOwner: inc.owner,
                  reason: 'TXT Import Update',
                  date: inc.issuedDate || todayIso(),
                }),
                ...ownershipHistory,
              ];
            }
            nextAssets[idx] = {
              ...curr,
              ...inc,
              id: curr.id,
              ownershipHistory,
              updated: todayIso(),
            };
          } else {
            nextAssets.push(inc);
          }
          if (inc.location) nextLocations.add(inc.location);
          if (inc.owner && inc.owner !== 'IT department' && !nextEmployees.some((e) => e.name === inc.owner)) {
            nextEmployees.push({ name: inc.owner, department: inc.department || '', position: '' });
          }
        });
      }

      // 2. Merge Loans
      if (incomingLoans && incomingLoans.length) {
        incomingLoans.forEach((incLoan) => {
          const existingIdx = nextLoans.findIndex(
            (l) =>
              l.assetCode.toLowerCase() === incLoan.assetCode.toLowerCase() &&
              (
                (l.pickupDate && incLoan.pickupDate && l.pickupDate.slice(0, 10) === incLoan.pickupDate.slice(0, 10)) ||
                (l.startDate && incLoan.startDate && l.startDate.slice(0, 10) === incLoan.startDate.slice(0, 10)) ||
                (l.knoxId && incLoan.knoxId && l.knoxId.toLowerCase() === incLoan.knoxId.toLowerCase()) ||
                (l.assignee && incLoan.assignee && l.assignee.toLowerCase() === incLoan.assignee.toLowerCase()) ||
                (!l.returnDate && !incLoan.returnDate)
              )
          );
          if (existingIdx >= 0) {
            nextLoans[existingIdx] = {
              ...nextLoans[existingIdx],
              ...incLoan,
              id: nextLoans[existingIdx].id,
            };
          } else {
            nextLoans.push(incLoan);
          }
          if (incLoan.location) nextLocations.add(incLoan.location);
          if (incLoan.assignee && incLoan.assignee !== 'IT department' && !nextEmployees.some((e) => e.name === incLoan.assignee)) {
            nextEmployees.push({ name: incLoan.assignee, department: '', position: 'Business traveler' });
          }
        });
      }

      // Reconcile all assets with latest loan states
      nextAssets = reconcileAllAssets(nextAssets, nextLoans);

      return {
        ...prev,
        assets: nextAssets,
        loans: nextLoans,
        employees: nextEmployees,
        locations: [...nextLocations],
      };
    });

    return api.exchange.importData({ assets: incomingAssets, loans: incomingLoans, overwrite: true })
      .catch((err) => {
        console.warn('Could not sync merge import to server:', err.message);
        return { success: false, error: err.message };
      });
  }, []);

  const revertImport = useCallback(() => {
    const backup = loadImportBackup();
    if (!backup) return false;
    setDb(backup);
    clearImportBackup();
    api.exchange.revert().catch((err) => console.warn('Could not sync revert import to server:', err.message));
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
    mergeImportData,
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
    mergeImportData,
    revertImport,
  ]);

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb() {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within <DbProvider>');
  return ctx;
}
