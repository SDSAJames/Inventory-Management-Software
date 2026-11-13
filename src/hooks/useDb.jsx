import { applyAssetActivity } from '../lib/overviewAssets';
import { departmentDirectoryNames } from '../../shared/departmentDirectory.js';
import { DEFAULT_OWNER } from '../../shared/referenceData.js';
import { getAssetLocationAfterReturn, normalizeLocation, getAssetStatusAfterReturn, getAssetStatusForLoanEdit } from "../../shared/assetRules.js";
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { todayIso, isLoanOverdue } from '../lib/utils';
import { reconcileAllAssets, createOwnershipEntry, validateAssetStatus, normalizeHolder } from '../lib/assetIntegrity';
import { DEFAULT_TRANSFER_REASONS } from '../lib/constants';
import { tracksEndDate, normalizeLoanEndDate } from '../lib/loanEquipment';
import { deduplicateLoanRecords, findLoanMatchIndex } from '../../shared/loanIdentity.js';
import { api } from '../lib/api';
import { normalizeDatabaseLocations, remapDatabaseLocation } from '../lib/databaseLocations';


const DbContext = createContext(null);

export function DbProvider({ children }) {
  const [db, setDbState] = useState(() => {
    const raw = normalizeDatabaseLocations(loadDb());
    if (raw) raw.departments = departmentDirectoryNames(raw);
    if (raw && raw.assets && raw.loans) {
      // Auto-ensure assets with an existing holder have at least an initial baseline ownership entry
      const assetsWithHistory = raw.assets.map((a) => {
        const normOwner = normalizeHolder(a.owner);
        const normDept = normOwner === DEFAULT_OWNER ? '' : a.department;
        const assetWithNorm = { ...a, owner: normOwner, department: normDept };
        if ((!assetWithNorm.ownershipHistory || assetWithNorm.ownershipHistory.length === 0) && assetWithNorm.owner) {
          return {
            ...assetWithNorm,
            ownershipHistory: [
              createOwnershipEntry({
                previousOwner: 'None',
                newOwner: assetWithNorm.owner,
                date: assetWithNorm.issuedDate || assetWithNorm.updated || todayIso(),
                reason: assetWithNorm.owner === DEFAULT_OWNER ? 'IT custody recorded' : 'Initial assignment',
                notes: assetWithNorm.department ? `Department: ${assetWithNorm.department}` : (assetWithNorm.notes || ''),
              }),
            ],
          };
        }
        return assetWithNorm;
      });
      const loans = raw.loans.map(normalizeLoanEndDate);

      return {
        ...raw,
        categories: raw.categories || [...new Set(raw.assets.map((a) => a.category).filter(Boolean))].map((name, i) => ({ id: `local-cat-${i}`, name })),
        loans,
        assets: reconcileAllAssets(assetsWithHistory, loans),
      };
    }
    return raw ? {
      ...raw,
      loans: (raw.loans || []).map(normalizeLoanEndDate),
      categories: raw.categories || [...new Set((raw.assets || []).map((a) => a.category).filter(Boolean))].map((name, i) => ({ id: `local-cat-${i}`, name })),
    } : raw;
  });

  const dbRevision = useRef(0);
  const setDb = useCallback((update) => {
    dbRevision.current += 1;
    setDbState((previous) => {
      const next = normalizeDatabaseLocations(typeof update === 'function' ? update(previous) : update);
      return next ? { ...next, departments: departmentDirectoryNames(next) } : next;
    });
  }, []);

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

      const requestedRevision = dbRevision.current;
      try {
        const res = await api.exchange.exportData();
        const categoryRes = await api.directory.getCategories().catch(() => null);
        const statusRes = await api.directory.getStatuses().catch(() => null);
        if (!active || requestedRevision !== dbRevision.current || !res?.success || !res?.db) return;
        const serverDb = res.db;

        // Server snapshots, including empty collections, are authoritative.
        // Refreshes never import browser cache or bundled sample data.
        setDb((prev) => ({
          ...prev,
          assets: reconcileAllAssets(serverDb.assets || [], serverDb.loans || []),
          loans: serverDb.loans || [],
          employees: serverDb.employees || [],
          departments: serverDb.departments || [],
          locations: serverDb.locations || [],
          categories: categoryRes?.categories ?? prev.categories,
          statuses: statusRes?.statuses ?? prev.statuses,
        }));
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
      ? [createOwnershipEntry({ previousOwner: 'None', newOwner: validated.owner, reason: validated.owner === DEFAULT_OWNER ? 'IT custody recorded' : 'Initial assignment' })]
      : [];
    const newAsset = {
      id: asset.id || crypto.randomUUID(),
      ...validated,
      ownershipHistory: validated.ownershipHistory || initialHistory,
      updated: todayIso(),
    };
    setDb((prev) => ({ ...prev, assets: [newAsset, ...prev.assets] }));
    api.assets.create(newAsset).then((result) => setDb((previous) => ({ ...previous, assets: applyAssetActivity(previous.assets, [result.asset]) }))).catch((err) => console.warn('Could not sync asset to server:', err.message));
  }, []);

  const updateAsset = useCallback(async (id, changes) => {
    const result = await api.assets.update(id, changes);
    setDb((prev) => {
      const previousAsset = prev.assets.find((asset) => asset.id === id);
      const savedChanges = { ...changes, ...result.asset };
      const affectedLoans = new Map((result.loans || []).map((loan) => [loan.id, loan]));
      return {
        ...prev,
        loans: (previousAsset && savedChanges.code && previousAsset.code !== savedChanges.code
          ? prev.loans.map((loan) => renameLoanAssetReferences(loan, previousAsset.code, savedChanges.code))
          : prev.loans).map((loan) => affectedLoans.get(loan.id) || loan),
        assets: prev.assets.map((a) => {
          if (a.id !== id) return a;
          let ownershipHistory = result.asset.ownershipHistory || a.ownershipHistory || [];
          if (!result.asset.ownershipHistory && savedChanges.owner !== undefined && savedChanges.owner !== a.owner) {
            ownershipHistory = [
              createOwnershipEntry({
                previousOwner: a.owner || 'None',
                newOwner: savedChanges.owner || 'None',
                reason: savedChanges.owner ? (a.owner ? 'Transferred' : 'Assigned') : 'Unassigned',
              }),
              ...ownershipHistory,
            ];
          }
          return validateAssetStatus({
            ...a,
            ...savedChanges,
            ownershipHistory,
            updated: todayIso(),
          });
        }),
      };
    });
    return result.asset;
  }, []);

  /**
   * Explicitly change the ownership of an asset and record it in the asset's ownership history.
   */
  const changeAssetOwner = useCallback(async (assetId, transfer) => {
    const result = await api.assets.transfer(assetId, transfer);
    setDb((previous) => {
      const returned = new Map((result.loans || []).map((loan) => [loan.id, loan]));
      const location = result.asset.location;
      return {
        ...previous,
        assets: previous.assets.map((asset) => asset.id === assetId ? { ...asset, ...result.asset } : asset),
        loans: previous.loans.map((loan) => returned.get(loan.id) || loan),
        locations: location && !previous.locations.includes(location) ? [...previous.locations, location] : previous.locations,
        employees: result.asset.owner && result.asset.owner !== DEFAULT_OWNER && !previous.employees.some((employee) => employee.name.toLowerCase() === result.asset.owner.toLowerCase())
          ? [...previous.employees, { name: result.asset.owner, department: result.asset.department || '', position: 'Staff' }] : previous.employees,
      };
    });
    return result.asset;
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
    api.assets.batchUpdate([...idSet], changes).then((result) => setDb((previous) => ({ ...previous, assets: applyAssetActivity(previous.assets, result.assetActivity) }))).catch((err) => console.warn('Could not sync batch asset update to server:', err.message));
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
    const effectiveLoan = normalizeLoanEndDate({
      id: loanId,
      ...loanData,
      status: loanData.status || (isLoanOverdue(loanData) ? 'Overdue' : (loanData.pickupDate ? 'Active' : 'Scheduled')),
      isArchived: Boolean(loanData.returnDate || loanData.returnedDate),
    });

    setDb((prev) => {
      const owner = effectiveLoan.assignee || '';
      const handoverAssetCodes = new Set(
        effectiveLoan.pickupDate
          ? [assetUpdates?.code, effectiveLoan.equipment?.Monitor]
              .map((code) => String(code || '').trim())
              .filter((code) => code && code !== '0')
          : [],
      );
      const nextAssets = prev.assets.map((a) => {
        if (!handoverAssetCodes.has(a.code)) return a;
        const history = createOwnershipEntry({
          previousOwner: a.owner || DEFAULT_OWNER,
          newOwner: owner,
          date: effectiveLoan.pickupDate.replace('T', ' '),
          reason: 'Device Handover',
          notes: `Device handed over to ${owner}`,
          location: effectiveLoan.location || a.location,
        });
        return {
          ...a,
          ...(a.code === assetUpdates?.code ? assetUpdates : {}),
          status: tracksEndDate(effectiveLoan.assigneeType) ? 'On loan' : 'Assigned',
          owner,
          location: effectiveLoan.location || a.location,
          ownershipHistory: [history, ...(a.ownershipHistory || [])],
          updated: todayIso(),
        };
      });
      // Auto-create asset if not found
      if (effectiveLoan.pickupDate && assetUpdates?.code && !prev.assets.some((a) => a.code === assetUpdates.code)) {
        nextAssets.push({
          id: crypto.randomUUID(),
          code: assetUpdates.code,
          name: assetUpdates.code,
          category: 'Laptop',
          model: '',
          serial: '',
          status: effectiveLoan.pickupDate
            ? (tracksEndDate(effectiveLoan.assigneeType) ? 'On loan' : 'Assigned')
            : 'Available',
          location: assetUpdates.location || '',
          owner: assetUpdates.owner || (effectiveLoan.pickupDate ? effectiveLoan.assignee || '' : DEFAULT_OWNER),
          ownershipHistory: effectiveLoan.pickupDate
            ? [createOwnershipEntry({
                previousOwner: DEFAULT_OWNER,
                newOwner: effectiveLoan.assignee || '',
                date: effectiveLoan.pickupDate.replace('T', ' '),
                reason: 'Device Handover',
                notes: `Device handed over to ${effectiveLoan.assignee || ''}`,
                location: effectiveLoan.location,
              })]
            : [],
          department: assetUpdates.department || '',
          condition: 'Good',
          notes: '',
          updated: todayIso(),
        });
      }
      const nextEmployees = [...prev.employees];
      if (newEmployee?.name && !prev.employees.some((e) => e.name.toLowerCase() === newEmployee.name.toLowerCase())) {
        nextEmployees.push(newEmployee);
      }
      return {
        ...prev,
        assets: nextAssets,
        loans: [effectiveLoan, ...prev.loans],
        employees: nextEmployees,
        locations: effectiveLoan.location ? [...new Set([...(prev.locations || []), effectiveLoan.location])] : prev.locations,
      };
    });

    api.loans.create(effectiveLoan).then((result) => setDb((previous) => ({ ...previous, assets: applyAssetActivity(previous.assets, result.assetActivity) }))).catch((err) => console.warn('Could not sync loan creation to server:', err.message));
  }, []);

  const updateLoan = useCallback(async (id, changes) => {
    const result = await api.loans.update(id, changes);
    setDb((previous) => ({
      ...previous,
      loans: previous.loans.map((loan) => loan.id === id ? { ...loan, ...result.loan } : loan),
      assets: previous.assets.map((asset) => {
        const saved = (result.assets || []).find((item) => item.id === asset.id);
        return saved ? { ...asset, ...saved, latestChange: saved.latest_change ?? saved.latestChange ?? '', changedAt: saved.changed_at ?? saved.changedAt ?? '' } : asset;
      }),
    }));
    return result.loan;
  }, []);

  const pickupLoan = useCallback(async (id, pickupDate, details = {}) => {
    const timestamp = pickupDate || todayIso();
    const result = await api.loans.pickup(id, { pickupDate: timestamp, ...details });
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
              readyForPickup: false,
              status: isLoanOverdue({ ...merged, pickupDate: timestamp, returnDate: '', returnedDate: '' }) ? 'Overdue' : 'Active',
            }
          : l,
      );
      const effectiveAssetCode = details.assetCode || loan.assetCode;
      const owner = details.assignee || loan.assignee || '';
      const handoverAssetCodes = new Set(
        [effectiveAssetCode, details.equipment?.Monitor]
          .map((code) => String(code || '').trim())
          .filter((code) => code && code !== '0'),
      );
      const nextAssets = prev.assets.map((a) => {
        if (!handoverAssetCodes.has(a.code)) return a;
        const history = createOwnershipEntry({
          previousOwner: a.owner || DEFAULT_OWNER,
          newOwner: owner,
          date: timestamp.replace('T', ' '),
          reason: 'Device Handover',
          notes: `Device handed over to ${owner}`,
          location: details.location || loan.location || a.location,
        });
        return {
          ...a,
          status: tracksEndDate(merged.assigneeType) ? 'On loan' : 'Assigned',
          owner,
          location: details.location || loan.location || a.location,
          department: merged.department ?? a.department,
          ownershipHistory: [history, ...(a.ownershipHistory || [])],
          updated: todayIso(),
        };
      });
      return { ...prev, loans: nextLoans, assets: applyAssetActivity(nextAssets, result.assetActivity) };
    });


  }, []);

  const setLoanReadyForPickup = useCallback((id, ready) => {
    setDb((prev) => ({
      ...prev,
      loans: prev.loans.map((loan) => loan.id === id ? { ...loan, readyForPickup: Boolean(ready) } : loan),
    }));
    api.loans.setReadyForPickup(id, ready).catch((err) => console.warn('Could not sync pickup readiness:', err.message));
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
              status: getAssetStatusAfterReturn(a.status),
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
      if (details.returnedEquipment) merged.returnedEquipment = details.returnedEquipment;
      if (details.returnStatus) merged.returnStatus = details.returnStatus;
      if (details.equipment) {
        merged.equipment = {
          ...(loan.equipment || {}),
          ...details.equipment,
        };
      }
      const nextLoans = prev.loans.map((l) =>
        l.id === id ? merged : l,
      );
      const expectedAssetCode = loan.assetCode || loan.equipment?.Laptop || '';
      const returnedEquipment = details.returnedEquipment || {};
      const hasLaptopReturnDetail = Object.hasOwn(returnedEquipment, 'Laptop');
      const returnedLaptopCode = String(
        hasLaptopReturnDetail ? returnedEquipment.Laptop || '' : details.returnedAssetCode || expectedAssetCode,
      ).trim();
      const returnedAssetCodes = new Set(
        [returnedLaptopCode, returnedEquipment.Monitor]
          .map((code) => String(code || '').trim())
          .filter((code) => code && code !== '0'),
      );
      const nextAssets = prev.assets.map((a) => {
        if (returnedAssetCodes.has(a.code)) {
          const returnEntry = createOwnershipEntry({
            previousOwner: a.owner || details.assignee || loan.assignee || 'Borrower',
            newOwner: DEFAULT_OWNER,
            department: 'IT',
            location: getAssetLocationAfterReturn(a.status),
            reason: 'Device Returned',
            notes: details.note || `Returned to IT Department by ${details.assignee || loan.assignee || 'borrower'}`,
            date: timestamp.replace('T', ' '),
          });
          return {
            ...a,
            status: getAssetStatusAfterReturn(a.status),
            location: getAssetLocationAfterReturn(a.status),
            owner: DEFAULT_OWNER,
            department: '',
            ownershipHistory: [returnEntry, ...(a.ownershipHistory || [])],
            updated: todayIso(),
          };
        }
        if (a.code === expectedAssetCode && expectedAssetCode && !returnedAssetCodes.has(expectedAssetCode)) {
          return {
            ...a,
            status: tracksEndDate(loan.assigneeType) ? 'On loan' : 'Assigned',
            owner: loan.assignee || a.owner,
            updated: todayIso(),
          };
        }
        return a;
      });
      return { ...prev, loans: nextLoans, assets: nextAssets };
    });

    api.loans.returnLoan(id, { returnDate: timestamp, ...details }).then((result) => setDb((previous) => ({ ...previous, assets: applyAssetActivity(previous.assets, result.assetActivity) }))).catch((err) => console.warn('Could not sync loan return to server:', err.message));
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
              returnedEquipment: null,
              returnStatus: '',
              readyForPickup: false,
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
            ? { ...a, status: getAssetStatusAfterReturn(a.status), owner: '', updated: todayIso() }
            : a,
        );
      }
      return { ...prev, loans: nextLoans, assets: nextAssets };
    });

    api.loans.delete(id).catch((err) => console.warn('Could not sync loan deletion to server:', err.message));
  }, []);

  /* ── Import / Revert ────────────────────────────── */

  const importDb = useCallback(async (newDb) => {
    const incomingLoans = (newDb.loans || []).map(normalizeLoanEndDate);
    setDb((prev) => {
      saveImportBackup(prev);
      const reconciledAssets = reconcileAllAssets(newDb.assets || [], incomingLoans);
      return {
        ...newDb,
        loans: incomingLoans,
        assets: reconciledAssets,
      };
    });

    try {
      return await api.exchange.importData({
        assets: newDb.assets || [],
        loans: incomingLoans,
        overwrite: true,
      });
    } catch (err) {
      console.warn('Could not sync imported database to server:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const mergeImportData = useCallback(({ assets: incomingAssets = [], loans: incomingLoans = [] }) => {
    const normalizedLoans = incomingLoans.map(normalizeLoanEndDate);
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
          if (inc.owner && inc.owner !== DEFAULT_OWNER && !nextEmployees.some((e) => e.name === inc.owner)) {
            nextEmployees.push({ name: inc.owner, department: inc.department || '', position: '' });
          }
        });
      }

      // 2. Merge Loans
      if (normalizedLoans.length) {
        normalizedLoans.forEach((incLoan) => {
          const existingIdx = findLoanMatchIndex(nextLoans, incLoan);
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
          if (incLoan.assignee && incLoan.assignee !== DEFAULT_OWNER && !nextEmployees.some((e) => e.name === incLoan.assignee)) {
            nextEmployees.push({
              name: incLoan.assignee,
              department: incLoan.department || '',
              position: incLoan.assigneeType || 'Business traveler',
            });
          }
        });
      }

      // Reconcile all assets with latest loan states
      nextAssets = reconcileAllAssets(nextAssets, nextLoans);

      return {
        ...prev,
        assets: nextAssets,
        loans: deduplicateLoanRecords(nextLoans),
        employees: nextEmployees,
        locations: [...nextLocations],
      };
    });

    return api.exchange.importData({ assets: incomingAssets, loans: normalizedLoans, overwrite: true })
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

  const addCategory = useCallback(async (name) => {
    const result = await api.directory.addCategory(String(name || '').trim());
    setDb((prev) => ({ ...prev, categories: [...(prev.categories || []), result.category] }));
    return result.category;
  }, []);

  const addStatus = useCallback(async (name) => {
    const result = await api.directory.addStatus(String(name || '').trim());
    setDb((prev) => ({ ...prev, statuses: [...(prev.statuses || []), result.status] }));
    return result.status;
  }, []);

  const renameCategory = useCallback(async (id, name) => {
    const result = await api.directory.renameCategory(id, String(name || '').trim());
    setDb((prev) => {
      const oldName = prev.categories?.find((category) => category.id === id)?.name;
      return {
        ...prev,
        categories: (prev.categories || []).map((category) => category.id === id ? result.category : category),
        assets: prev.assets.map((asset) => asset.category === oldName ? { ...asset, category: result.category.name } : asset),
      };
    });
  }, []);

  const deleteCategory = useCallback(async (id) => {
    await api.directory.deleteCategory(id);
    setDb((prev) => ({ ...prev, categories: (prev.categories || []).filter((category) => category.id !== id) }));
  }, []);

  const addLocation = useCallback(async (name) => {
    const result = await api.directory.addLocation(String(name || '').trim());
    setDb((prev) => ({ ...prev, locations: [...new Set([...(prev.locations || []), result.location.name])] }));
    return result.location.name;
  }, []);

  const addDepartment = useCallback(async (name) => {
    const result = await api.directory.addDepartment(String(name || '').trim());
    setDb((prev) => ({ ...prev, departments: [...new Set([...(prev.departments || []), result.department.name])] }));
    return result.department.name;
  }, []);

  const renameDepartment = useCallback(async (currentName, name) => {
    const result = await api.directory.renameDepartment(currentName, String(name || '').trim());
    setDb((prev) => ({ ...prev, departments: (prev.departments || []).map((item) => item === currentName ? result.department.name : item) }));
  }, []);

  const deleteDepartment = useCallback(async (name) => {
    await api.directory.deleteDepartment(name);
    setDb((prev) => ({ ...prev, departments: (prev.departments || []).filter((item) => item !== name) }));
  }, []);

  const renameLocation = useCallback(async (currentName, name) => {
    const result = await api.directory.renameLocation(currentName, String(name || '').trim());
    setDb((prev) => remapDatabaseLocation(prev, result.previousName || currentName, result.location.name));
    return result;
  }, []);

  const deleteLocation = useCallback(async (name) => {
    await api.directory.deleteLocation(name);
    setDb((prev) => ({ ...prev, locations: (prev.locations || []).filter((item) => normalizeLocation(item, '').toLowerCase() !== normalizeLocation(name, '').toLowerCase()) }));
  }, []);

  const value = useMemo(() => ({
    db,
    setDb,
    addCategory,
    addStatus,
    renameCategory,
    deleteCategory,
    addLocation,
    addDepartment,
    renameDepartment,
    deleteDepartment,
    renameLocation,
    deleteLocation,
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
    setLoanReadyForPickup,
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
    addCategory,
    addStatus,
    renameCategory,
    deleteCategory,
    addLocation,
    addDepartment,
    renameDepartment,
    deleteDepartment,
    renameLocation,
    deleteLocation,
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
    setLoanReadyForPickup,
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
import { renameLoanAssetReferences } from '../../shared/assetReferences.js';
