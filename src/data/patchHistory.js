/**
 * patchHistory.js
 * Structured changelog data powering the in-app Patch History Modal.
 * Mirrors PATCH_NOTES.md with Semantic Versioning (SemVer 2.0.0).
 */

export const PATCH_HISTORY = [
  {
    version: '1.2.1',
    date: '2026-10-09',
    title: 'Exclusive Calendar Focus View, Frontend Patch History & Versioning Calibration',
    tag: 'Latest Patch',
    type: 'patch',
    summary:
      'Calibrated Semantic Versioning progression to standard patch increments, added an exclusive Calendar-only view mode for the Business Travelers page, introduced in-app patch history inspection per version, and synchronized all technical documentation.',
    highlights: [
      'Exclusive Calendar View: When calendar view is selected, KPI cards and location distribution panels are hidden to dedicate full screen exclusively to the schedule calendar.',
      'Frontend Patch History Modal: In-app release notes viewer per version accessible directly via the TopBar version pill and Sidebar footer.',
      'Semantic Versioning Calibration: Restrained minor version jumps by adhering to SemVer patch increments (1.2.x) for iterative UI polish and view state refinements.',
      'System Documentation Sync: Synchronized PATCH_NOTES.md, README.md, Technical Specification, and Software Design Document.',
    ],
    sections: [
      {
        heading: 'Business Travelers Module',
        badge: 'UI Enhancement',
        items: [
          'Exclusive Calendar View Mode: When "Calendar View" is active, the KPI stat cards, Location Distribution matrix, and Roster tables are cleanly omitted, presenting solely the monthly schedule calendar.',
          'Maintained view toggle controls so operators can seamlessly switch between "Calendar View", "Roster List", "Overdue Only", and "All Sections".',
          'Preserved all calendar interactions: month navigation, location filtering, search, and day assignment inspection drawers.',
        ],
      },
      {
        heading: 'Frontend Patch History Viewer',
        badge: 'New Feature',
        items: [
          'Added interactive Patch History Modal with multi-version tabs, per-version inspection, change categorization, and keyword search.',
          'Integrated clickable trigger into the TopBar version pill (v1.2.1) with hover micro-animations.',
          'Integrated clickable trigger into the Sidebar footer for convenient global access from any application page.',
          'Included full release notes history from initial prototype v0.1.0 through current v1.2.1.',
        ],
      },
      {
        heading: 'Versioning Policy & Documentation',
        badge: 'Governance & Docs',
        items: [
          'Calibrated version increment cadence to strictly follow Semantic Versioning (Major.Minor.Patch) so version numbers do not advance prematurely for incremental refinements.',
          'Updated project README.md, Software Design Document (SDD), and Technical Specification to v1.2.1.',
        ],
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-07',
    title: 'TXT File Import Extracted from Excel & Preserved 1:1 Excel Export',
    tag: 'Feature Release',
    type: 'minor',
    summary:
      'Standardized system import engine to ingest tab-delimited text (.txt) files exported directly from Excel for both Equipment Master Register and IT Equipment Loan List, while maintaining 1:1 Excel OpenXML export capabilities.',
    highlights: [
      'Primary TXT File Import Architecture for SPE_Equipments_example.txt and SPE_IT_Equipment_Loan_List_Example.txt',
      'Universal client-side multiline and quoted field delimited parser',
      'Interactive pre-flight import preview modal with tabbed inspection',
      'Preserved 1:1 reference Excel exports with full OpenXML schema parity',
    ],
    sections: [
      {
        heading: 'Data Ingestion Architecture',
        badge: 'Import Engine',
        items: [
          'Ingests tab-delimited text files (.txt) extracted from Excel, supporting BOM headers, CRLF linebreaks, and multiline quotes.',
          'Automatic signature detection recognizes Equipment Master vs Loan List files.',
          'Batch multi-file ingestion parses equipment registers and loan records in tandem.',
          'Pre-flight preview modal supports Merge & Sync or Full Database Replacement modes.',
        ],
      },
      {
        heading: 'Spreadsheet Interoperability',
        badge: 'Excel Export',
        items: [
          'Maintained client-side OpenXML .xlsx export with 19-column loan schema and equipment master schema.',
          'Quick import buttons on Assets and Loans tables accept .txt files natively.',
        ],
      },
    ],
  },
  {
    version: '1.1.1',
    date: '2026-10-07',
    title: 'Full Screen Roster Mode & Specific URL Routing',
    tag: 'UI & Routing',
    type: 'patch',
    summary:
      'Enhanced Business Traveler roster tracking with 1-click full-screen mode, sticky column headers, and explicit /business-travelers route naming.',
    highlights: [
      'Full-body expanded roster mode with Escape key and background scroll locking',
      'Sticky column headers maintaining reference during deep vertical scrolling',
      'Specific URL routing to /business-travelers with backward compatibility redirection',
    ],
    sections: [
      {
        heading: 'Business Traveler Usability',
        badge: 'Full Screen',
        items: [
          'Added 1-click "Full Screen Roster" toggle expanding the roster table across the entire viewport.',
          'Persistent search, status filters, and + Record Traveler dispatch button in full screen.',
          'Refactored route path from /travelers to /business-travelers with seamless redirect.',
        ],
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-07',
    title: 'Dedicated Business Travelers Management Module & Location Matrix',
    tag: 'New Module',
    type: 'minor',
    summary:
      'Launched dedicated Business Travelers management module tracking mobile personnel, field deployments, location distribution matrix, and custody return workflows.',
    highlights: [
      'Sidebar navigation item for Business Travelers with live active count badge',
      'Fleet metrics: Active in Field, Travel Locations, Scheduled Trips, Total Travelers',
      'Where They Are location distribution matrix with 1-click site filtering',
      'One-click return confirmation flow routing equipment back to IT as Available',
    ],
    sections: [
      {
        heading: 'Mobile Workforce Management',
        badge: 'New Module',
        items: [
          'Dedicated /business-travelers page with enterprise briefcase navigation icon.',
          'Location distribution cards tracking custody across deployment facilities.',
          'Direct return flow updating asset custody back to IT department.',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-07',
    title: 'Official Production Baseline Release',
    tag: 'Production Baseline',
    type: 'major',
    summary:
      'Official baseline release featuring StarPlus Energy rebrand, compact UI architecture, state machine engine, and 100% air-gapped offline operation.',
    highlights: [
      'StarPlus Energy corporate palette and geometric hexagon brand mark',
      '100% air-gapped offline operation with zero remote dependencies or external fonts',
      'Reconciled lifecycle state machine engine across assets and loans',
      'High-density UI with ~32px compact topbar and scroll-free modal forms',
      'Direct click-to-transfer ownership badges on asset register',
    ],
    sections: [
      {
        heading: 'Branding & Architecture',
        badge: 'Baseline',
        items: [
          'Implemented official brand colors (#1449d6, #0a2547, #f8fafc, #e2e8f0, #141519).',
          'Eliminated all remote CDN and external font dependencies in favor of native system font stack.',
          'Reconciled asset and loan lifecycle state reconciliation engine.',
          'Pure client-side zero-dependency OpenXML export generator.',
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-18',
    title: 'Prototype Iteration: Knox ID & Custody Tracking',
    tag: 'Prototype',
    type: 'minor',
    summary:
      'Prototype iteration adding corporate directory Knox ID integration, IP address tracking, accessory checklists, and ownership audit history.',
    highlights: [
      'Knox ID integration across employee records and device loan entries',
      'IP address assignment field (105.101.x.x) for laptop custody',
      'Itemized equipment accessory checklist (adapters, cables, dongles, peripherals)',
      'Initial asset ownership history audit timeline',
    ],
    sections: [
      {
        heading: 'Prototype Extensions',
        badge: 'Prototype',
        items: [
          'Integrated Knox ID fields into custody records.',
          'Added IP prefix validation and accessory tracking.',
          'Built initial client-side XLSX generation.',
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-08-10',
    title: 'Initial Concept Prototype',
    tag: 'Prototype',
    type: 'minor',
    summary:
      'Initial concept prototype establishing the local asset index register, basic checkout/return tracking, and browser local storage persistence.',
    highlights: [
      'Asset index register for laptops, monitors, and peripherals',
      'Basic internal checkout and return custody workflows',
      'Executive dashboard counters and organization directory',
      'Local workstation browser storage persistence',
    ],
    sections: [
      {
        heading: 'Foundation',
        badge: 'Prototype',
        items: [
          'Initial local data model and storage schema.',
          'Prototype dashboard and asset catalog.',
        ],
      },
    ],
  },
];
