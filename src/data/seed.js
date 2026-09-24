export const seed = {
  assets: [
    { id: 'a1', code: 'AST-2024-001', name: 'Dell Latitude 7440', category: 'Laptop', model: 'Latitude 7440', serial: 'DL7440-8891', status: 'Assigned', location: 'Head Office', owner: 'Maya Chen', department: 'Finance', condition: 'Good', notes: 'Primary finance laptop', updated: '2024-08-18' },
    { id: 'a2', code: 'AST-2024-002', name: 'HP LaserJet Pro M404', category: 'Printer', model: 'M404dn', serial: 'HP-M404-1142', status: 'Available', location: 'Head Office', owner: '', department: '', condition: 'Good', notes: 'Ready for deployment', updated: '2024-08-17' },
    { id: 'a3', code: 'AST-2024-003', name: 'Cisco Catalyst 9200', category: 'Network', model: 'C9200L-24P', serial: 'CS9200-4129', status: 'Under repair', location: 'IT Store', owner: '', department: '', condition: 'Needs service', notes: 'Replacement fan ordered', updated: '2024-08-12' },
    { id: 'a4', code: 'AST-2024-004', name: 'MacBook Pro 14-inch', category: 'Laptop', model: 'M2 Pro', serial: 'MBP14-5271', status: 'On loan', location: 'Regional Office', owner: 'Daniel Okoro', department: 'Operations', condition: 'Excellent', notes: 'Due back 30 Aug 2024', updated: '2024-08-10' },
    { id: 'a5', code: 'AST-2024-005', name: 'Epson EB-FH52 Projector', category: 'AV Equipment', model: 'EB-FH52', serial: 'EPFH52-7330', status: 'Available', location: 'Head Office', owner: '', department: '', condition: 'Good', notes: 'Meeting room equipment', updated: '2024-08-02' },
    { id: 'a6', code: 'AST-2024-006', name: 'Samsung Galaxy S23', category: 'Mobile', model: 'SM-S911B', serial: 'SGS23-2256', status: 'Damaged', location: 'Head Office', owner: 'Maya Chen', department: 'Finance', condition: 'Cracked screen', notes: 'Awaiting repair assessment', updated: '2024-07-28' },
  ],
  loans: [
    { id: 'l1', assetCode: 'AST-2024-004', assignee: 'Daniel Okoro', department: 'Operations', loanDate: '2024-08-10', dueDate: '2024-08-30', status: 'Active', purpose: 'Regional site visit' },
  ],
  employees: [
    { name: 'Maya Chen', department: 'Finance', position: 'Finance Lead' },
    { name: 'Daniel Okoro', department: 'Operations', position: 'Operations Manager' },
    { name: 'Priya Shah', department: 'IT', position: 'Systems Analyst' },
  ],
  departments: ['Finance', 'Operations', 'IT', 'People & Culture'],
  locations: ['Head Office', 'Regional Office', 'IT Store'],
};
