import { groupLoans } from './loanSelectors.js';
import { currentTravelerCount } from './travelerMetrics.js';

/** Keep card values and their asset drilldowns on the same data and lifecycle rules. */
export function overviewDashboardMetrics(assets = [], loans = []) {
  const assetGroups = {
    all: assets,
    available: assets.filter((asset) => asset.status === 'Available'),
    assigned: assets.filter((asset) => asset.status === 'Assigned'),
    loaned: assets.filter((asset) => asset.status === 'On loan'),
    broken: assets.filter((asset) => ['Damaged', 'Broken'].includes(asset.status)),
    repair: assets.filter((asset) => asset.status === 'Under repair'),
  };
  const { overdue, unreturned } = groupLoans(loans);
  return { assetGroups, overdue, unreturned, currentTravelers: currentTravelerCount(loans) };
}
