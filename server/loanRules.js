export function tracksEndDate(assigneeType) {
  return String(assigneeType || 'Business traveler').trim().toLowerCase() === 'business traveler';
}