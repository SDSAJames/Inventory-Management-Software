/**
 * patchHistory.js
 * Canonical structured changelog for the in-app release history and generated PATCH_NOTES.md.
 * Uses Semantic Versioning (SemVer 2.0.0).
 */
import { APP_VERSION } from '../lib/constants.js';

export const PATCH_HISTORY = [
  {
    version: APP_VERSION,
    date: '2026-10-27',
    title: 'Partial Return Tracking, Pickup Readiness & Directory Management',
    tag: 'Feature Release',
    type: 'minor',
    summary:
      'Track missing equipment after a partial return, mark scheduled equipment ready for pickup, and manage asset categories, departments, and locations from the Directory page.',
    highlights: [
      'Unreturned Loans: Review partial returns in a dedicated Loans section and see which issued accessories remain outstanding.',
      'Ready for Pickup: Mark scheduled loan equipment as prepared for incoming personnel.',
      'Directory Management: Add, select, edit, and bulk-delete categories, departments, and locations; values in use by assets are protected.',
      `Version Governance: Application metadata is sourced from package.json (v${APP_VERSION}).`,
    ],
    sections: [
      {
        heading: 'Partial Return Tracking',
        badge: 'Custody Workflow',
        items: [
          'Added a dedicated Unreturned section in Loans for partial returns, including loans that are not overdue.',
          'Record actual returned accessory counts separately from the issued equipment checklist and display outstanding items in the loan list and details.',
        ],
      },
      {
        heading: 'Scheduled Pickup Readiness',
        badge: 'Operations Workflow',
        items: [
          'Operators can mark scheduled equipment ready for pickup by an incoming employee and clear the flag when the equipment is picked up.',
        ],
      },
      {
        heading: 'Directory Management',
        badge: 'Administration',
        items: [
          'Added selection, select-all, edit, and bulk-delete controls for asset categories, departments, and locations.',
          'Values referenced by assets are visibly marked in use and protected from editing or deletion.',
        ],
      },
      {
        heading: 'Documentation & Versioning',
        badge: 'Governance & Docs',
        items: [
          `Updated package metadata and synchronized documentation to v${APP_VERSION}.`,
          'Updated README, Software Design Document, Technical Specification, and patch notes for this release.',
        ],
      },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-26',
    title: 'Loan Search, Flexible Custody Updates & Asset Multi-Selection',
    tag: 'Feature Release',
    type: 'minor',
    summary:
      'Expanded loan management with searchable and filterable records, editable equipment details during pickup and return, and drag selection for faster asset register batch operations.',
    highlights: [
      'Loan Search & Filters: Search loan records across all fields or target assignee, Knox ID, asset, location, IP address, department, and notes; narrow results by loan status.',
      'Pickup & Return Updates: Review and edit accessory counts and loan details as equipment is handed over or returned, with changes persisted by the server.',
      'Asset Register Drag Selection: Select multiple asset rows with a drag gesture to streamline existing batch actions.',
      'Version Governance: Bumped the application, server health/export metadata, and documentation to v1.3.0.',
    ],
    sections: [
      {
        heading: 'Loan Search & Filtering',
        badge: 'Workflow Enhancement',
        items: [
          'Added a loan search bar with selectable search fields for assignee, Knox ID, laptop/asset number, location, IP address, department, and note/purpose, plus an all-fields option.',
          'Added loan status filtering to help operators isolate scheduled, active, overdue, and returned records.',
        ],
      },
      {
        heading: 'Pickup & Return Details',
        badge: 'Custody Workflow',
        items: [
          'Pickup and return workflows can update the itemized equipment checklist and supporting loan details alongside their respective custody dates.',
          'Persisted pickup and return edits through the loans API while retaining the existing asset custody and audit-history workflows.',
        ],
      },
      {
        heading: 'Asset Register Selection',
        badge: 'Usability Enhancement',
        items: [
          'Added drag-to-select interaction across asset table rows for efficient multi-record batch operations.',
        ],
      },
      {
        heading: 'Documentation & Versioning',
        badge: 'Governance & Docs',
        items: [
          'Bumped package metadata, client version, server health response, and exchange export metadata to v1.3.0.',
          'Synchronized the README, Software Design Document, Technical Specification, and patch notes with this release.',
        ],
      },
    ],
  },
  {
    version: '1.2.2',
    date: '2026-10-21',
    title: 'Vite Proxy Network Stability & Full-Stack Development Orchestration',
    tag: 'Latest Patch',
    type: 'patch',
    summary:
      'Resolved Vite HTTP proxy ECONNREFUSED network errors, hardened IPv4 proxy routing to 127.0.0.1, introduced graceful HTTP 503 proxy offline interceptors, and added single-command full-stack development orchestration via concurrently.',
    highlights: [
      'Vite HTTP Proxy Stability: Eliminated ECONNREFUSED AggregateError proxy crashes on background polls (/api/auth/me and /api/exchange/export).',
      'Direct IPv4 Loopback Routing: Configured Vite proxy target to http://127.0.0.1:5000, eliminating Windows dual-stack IPv6 [::1] DNS resolution latency and connection refusal.',
      'Graceful Backend Offline Handling: Added configure error interceptor in vite.config.js returning a clean HTTP 503 JSON response when the backend server is stopped.',
      'Single-Command Full-Stack Orchestration: Integrated concurrently and added npm run dev:all to run both the Express API server and Vite frontend dev server simultaneously.',
    ],
    sections: [
      {
        heading: 'Vite Dev Server & Proxy Configuration',
        badge: 'Network Stability',
        items: [
          'Direct IPv4 Target: Updated proxy target in vite.config.js from http://localhost:5000 to http://127.0.0.1:5000, ensuring immediate connection to Node\'s IPv4 server listener without IPv6 ::1 loopback ambiguity.',
          'Proxy Error Interception: Configured proxy.on("error") handler to intercept ECONNREFUSED events and respond with HTTP 503 Service Unavailable, preventing uncaught Node.js stack traces in terminal consoles.',
        ],
      },
      {
        heading: 'Development Workflow & Tooling',
        badge: 'DevOps & Tooling',
        items: [
          'Added npm run dev:all script utilizing concurrently to orchestrate npm run server:dev and npm run dev side-by-side in a single console window.',
          'Updated project documentation with clear local development workflows (single-command vs dual-terminal options).',
        ],
      },
      {
        heading: 'In & Out Calendar Module',
        badge: 'New Module',
        items: [
          'Separated In & Out Calendar into a dedicated top-level sidebar menu item (/calendar).',
          'Displays device loan/custody schedules for all user types, covering both standard SPE employees and business travelers.',
          'Integrated requester filtering controls: toggle by user type (All, Business Traveler, SPE Employee) or select a specific individual requester.',
          'Interactive 42-day month grid with visual chips, indicators, and complete day schedule inspection drawers.',
        ],
      },
      {
        heading: 'System Documentation & Version Governance',
        badge: 'Governance & Docs',
        items: [
          'Bumped project version to v1.2.2 in package.json, server/index.js, exchange router, and client constants.',
          'Synchronized README.md, Software Design Document (SDD), Technical Specification, and PATCH_NOTES.md.',
        ],
      },
    ],
  },
  {
    version: '1.2.1',
    date: '2026-10-09',
    title: 'Exclusive Calendar Focus View, Frontend Patch History & Versioning Calibration',
    tag: 'Patch Release',
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
      'Official baseline release featuring StarPlus Energy rebrand, compact UI architecture, state machine engine, and corporate intranet multi-host deployment.',
    highlights: [
      'StarPlus Energy corporate palette and geometric hexagon brand mark',
      'Corporate intranet operation with zero external cloud dependencies or remote fonts',
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
