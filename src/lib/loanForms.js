import { getLoanLocation } from '../../shared/loanLocations.js';
import { normalizePcRecord, pcAssetCode } from '../../shared/pcReferences.js';
import { buildIpAddress, ipAddressToForm, isIpAddressInvalid } from './ipAddress.js';
import { buildLoanEquipment, buildReturnedEquipment, equipmentToForm, equipmentQuantitiesToForm, newLoanEquipmentForm, isBusinessTraveler, getMissingReturnItems } from './loanEquipment.js';
import { findAssetByCode, matchesAssetCategory, PC_CATEGORIES, MONITOR_CATEGORIES } from './assetCategories.js';
import { readableTransferNote } from './transferNotes.js';
import { todayIso } from './utils.js';

export function createLoanForm(record, assigneeType = 'Business traveler') {
  const loan = normalizePcRecord(record);
  const equipment = loan?.equipment || {};
  return {
    assetCode: loan?.assetCode || '',
    requestPc: Boolean(equipment.RequestedPC || loan?.assetCode),
    requestMonitor: Boolean(equipment.RequestedMonitor || equipment.Monitor),
    assigneeType: loan?.assigneeType || assigneeType,
    assignee: loan?.assignee || loan?.borrower || '', knoxId: loan?.knoxId || '',
    ...ipAddressToForm(loan?.ip),
    startDate: loan ? (loan.startDate || loan.loanDate || '').slice(0, 10) : todayIso(),
    pickupDate: loan?.pickupDate || '', pickedUp: Boolean(loan?.pickupDate),
    endDate: loan && isBusinessTraveler(loan.assigneeType) ? (loan.endDate || loan.dueDate || '').slice(0, 10) : '',
    returnDate: loan?.returnDate || loan?.returnedDate || '',
    location: loan?.location || '', department: loan?.department || '',
    ...(loan ? equipmentToForm(equipment) : newLoanEquipmentForm()),
    others: loan?.others || '', note: readableTransferNote(loan?.note || loan?.purpose || ''),
  };
}

export function loanFormErrors(form, { assets = [], validateDevices = false, confirmPickup = false } = {}) {
  const errors = {};
  if (!form.knoxId.trim()) errors.knoxId = 'Knox ID is required';
  if (confirmPickup && form.pickedUp && !form.pickupDate) errors.pickupDate = 'Enter the pickup date or uncheck Picked up';
  if (validateDevices) {
    const pc = findAssetByCode(assets, pcAssetCode(form.assetCode));
    if (pc && !matchesAssetCategory(pc.category, PC_CATEGORIES)) errors.assetCode = 'Select a Laptop or MES PC asset';
    const monitor = String(form.monitor || '').trim();
    if (monitor && !matchesAssetCategory(findAssetByCode(assets, monitor)?.category, MONITOR_CATEGORIES)) errors.monitor = 'Select a monitor from the matching asset list';
  }
  if (isBusinessTraveler(form.assigneeType) && form.startDate && form.endDate && form.endDate < form.startDate) errors.endDate = 'Due date cannot be earlier than start date';
  if (isIpAddressInvalid(form)) errors.ip = 'IP subnet and number must each be between 0 and 255';
  return errors;
}

export function buildLoanFormData(form, { equipment = {}, includeReturn = false } = {}) {
  const assetCode = pcAssetCode(form.assetCode);
  const endDate = isBusinessTraveler(form.assigneeType) ? form.endDate : '';
  return {
    assetCode, assignee: form.assignee.trim(), assigneeType: form.assigneeType, knoxId: form.knoxId.trim(),
    ip: buildIpAddress(form), startDate: form.startDate, loanDate: form.startDate, endDate, dueDate: endDate,
    pickupDate: form.pickupDate, returnDate: includeReturn ? form.returnDate : '',
    ...(includeReturn ? { returnedDate: form.returnDate } : {}),
    location: getLoanLocation(form), department: form.department, others: form.others, note: form.note,
    equipment: { ...equipment, ...buildLoanEquipment(form, assetCode), RequestedPC: form.requestPc || Boolean(assetCode), RequestedMonitor: form.requestMonitor || Boolean(form.monitor) },
  };
}

export function createLoanReturnForm(loan, timestamp) {
  const equipment = loan.equipment || {}, returned = loan.returnedEquipment || equipment;
  return {
    returnDate: timestamp, returnedLaptopCode: returned.Laptop ?? loan.assetCode ?? equipment.Laptop ?? '',
    ...equipmentQuantitiesToForm(returned, equipment), others: returned.Others ?? loan.others ?? '',
    note: readableTransferNote(loan.note || ''),
  };
}

export function buildLoanReturnDetails(loan, form) {
  const returnedEquipment = buildReturnedEquipment(form);
  const issued = { ...loan.equipment, Laptop: loan.assetCode || loan.equipment?.Laptop || '' };
  const missingItems = getMissingReturnItems(issued, returnedEquipment);
  return {
    missingItems,
    details: { returnedEquipment, returnedAssetCode: returnedEquipment.Laptop, returnStatus: missingItems.length ? 'Partial' : 'Complete', others: form.others, note: form.note },
  };
}
