# StarPlus Energy Asset Management System — Patch Notes & Changelog

All notable changes, architectural updates, and state engine revisions for the **StarPlus Energy Asset Management System (SPE-AMS)** are documented in this file.

This file is generated from [`src/data/patchHistory.js`](src/data/patchHistory.js). Update that release history and `package.json`, then run `npm run docs:sync`.

The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.11.2] — 2026-11-12

### Four-Digit Year Input Limits

Use shared date inputs to limit years to four digits throughout asset and custody forms.

#### Highlights
- Cap native date and date-time fields at year 9999 and reject longer typed or pasted years.

#### Shared Date Input

- Reuse DateInput for asset issue dates, loan creation/editing, inline edits, pickup dates and ownership/equipment transfers.
- Preserve clearing, required fields, earlier date limits and date-time values. Purchase and warranty text fields retain DD-MM-YYYY entry.

---

## [1.11.1] — 2026-11-12

### Shared Quantity Normalization

Normalize accessory counts consistently across forms, imports, transfers and API save paths.

#### Highlights
- Convert 01 to 1 and 00 to 0 for accessory counts while keeping asset tags and free text unchanged.
- Reuse the same quantity input and normalization rule in create, edit, pickup, return and transfer windows.

#### Shared Equipment Counts

- Centralize quantity-field metadata and canonical digit formatting in shared/equipment.js.
- Normalize loaded drafts, form payloads, API records and imports; preserve PC/monitor leading zeros and Others / Peripherals text.
- Replace the separate transfer number input with EquipmentQuantityInput and normalize transferred quantities.
- Verify direct API create/edit/pickup/return writes store canonical counts and retain historical descriptive values.
- Use UUIDs for loan-created employees to avoid rapid-create collisions, and make the ownership-history regression independent of the current date.

---

## [1.11.0] — 2026-11-10

### Seven-Day Traveler Reminders & Overdue Sorting

Prepare return reminders for equipment due within seven days and sort overdue traveler records.

#### Highlights
- Open Reminder for business travelers with picked-up equipment due today through seven calendar days ahead.
- Copy unique Knox IDs as knoxidA;knoxidB; using the same shared contact list as Follow-up.
- Hide Location distribution in Follow-up and Reminder, and sort Overdue Only columns ascending or descending.

#### Traveler Contact Lists

- Share clipboard, manual-copy fallback, record table and view/edit actions across reminder and follow-up views.
- Exclude scheduled pickups, returned records, employees, overdue dates and missing due dates from Reminder. Sort reminders by nearest due date using calendar-day arithmetic.

#### Overdue Sorting

- Sort No, Traveler, Location, Asset Number, Due Date, Overdue By and Knox IP through keyboard-accessible header buttons.
- Default to earliest due date; use numeric duration and natural text comparisons, with missing values last.

---

## [1.10.1] — 2026-11-10

### Keep Deployment Separate from Inventory Data

Remove automatic operational-data imports and reseeding after reloads and server restarts.

#### Highlights
- Keep npm run build limited to generating application files in dist.
- Never upload a cached browser database automatically or reinsert sample assets and loans into empty tables.

#### Data Preservation

- Accept successful server snapshots, including empty collections, as authoritative without triggering an import.
- Start missing or unreadable browser caches with empty operational records and stop injecting sample assets on reload.
- Retain schema, account and reference-data initialization while removing sample asset, loan and employee seeding.
- Verify edited loan end dates survive repeated startup and empty operational tables remain empty.

---

## [1.10.0] — 2026-11-10

### Calendar Pickup Information & Day Return Filters

Show actual pickup events in both calendars and synchronize Hide returned inside day details.

#### Highlights
- See completed pickups on the actual pickup date in Business Travelers and In & Out calendars.
- Use the same compact pickup row and Hide returned switch in both day dialogs.

#### Calendar Pickup Events

- Share pickup indexing and detail rows with recipient, Knox ID, actual pickup time, PC, monitor and location.
- Add Picked up calendar and day filters and include actual pickups in event counts.
- Keep pending schedules separate from completed pickups. Hide returned removes completed-return records from grid events, counts and open day details through the same state.

---

## [1.9.4] — 2026-11-10

### Allow Pickup Without an Unavailable Monitor

Complete pickup when a requested monitor could not be provided.

#### Highlights
- Leave the monitor asset field blank at pickup even when Monitor was requested in the schedule.

#### Pickup Validation

- Remove the blocking monitor-selection message in the pickup form and API.
- Preserve the original monitor request while recording only equipment actually handed over.

---

## [1.9.3] — 2026-11-10

### Repair Returns to IT Custody

Treat Under repair as a return to IT Department followed by service-center custody.

#### Highlights
- Selecting Under repair sets Current holder to IT Department and Location to service center.
- Close previous device custody and record the IT return for single and bulk status changes.

#### Repair Custody

- Share repair holder, department and location rules across form entry, normalization and persistence.
- Preserve Under repair status, clear the employee department, and retain missing accessories as partial returns.
- Use unique history IDs when creating pickups to prevent rapid loan creation from colliding.

---

## [1.9.2] — 2026-11-10

### Compact Calendar Rows & Stable Saved Ownership

Fit calendar details into tighter rows and prevent stale background refreshes from replacing saved ownership on screen.

#### Highlights
- Size calendar row sections to their content and keep actions beside recipient, readiness, equipment and dates where space permits.
- Discard background snapshots started before a newer local database change, including successful ownership transfers.

#### Calendar Layout

- Reuse compact spacing in both calendar day dialogs. Wrap long values and stack sections on smaller screens without clipping details or actions.

#### Ownership Synchronization

- Keep independently saved transfers visible when an older background refresh completes. No parent asset Save changes is required for a confirmed transfer.

---

## [1.9.1] — 2026-11-10

### Persistent Ownership Transfers & Cleaner Calendar Details

Keep ownership transfers saved independently of the asset form and simplify scheduled calendar rows.

#### Highlights
- Remove the redundant Scheduled badge and Pickup readiness label; retain the Ready / Not ready toggle.
- Close previous device custody in the ownership-transfer transaction so reconciliation cannot restore the old holder.

#### Ownership Persistence

- Save transfers directly to the database without requiring Save changes in the parent asset window.
- Check in only the transferred device from previous active custody; preserve outstanding accessories as partial returns.
- Use unique employee IDs to prevent collisions during rapid ownership changes.

#### Calendar Details

- Hide Scheduled text for pending pickups in both calendar day dialogs while keeping the shared readiness toggle.

---

## [1.9.0] — 2026-11-10

### Traveler Follow-up & Calendar Readiness

Collect overdue and unreturned traveler recipients, distinguish calendar return stages, and improve transfer handovers.

#### Highlights
- Use the Business Travelers Follow-up tab to copy unique Knox IDs as knoxid_1;knoxid_2; for email follow-up.
- Filter traveler calendar events by Incoming, Returning, Returned or Overdue.
- View and toggle pickup readiness in both calendar day detail windows.
- Transfer actual equipment over the selected schedule plan and immediately refresh current-holder details after ownership changes.

#### Traveler Follow-up

- List overdue travelers and partial returns with equipment outstanding using the existing custody grouping rules.
- Copy trimmed, case-insensitively deduplicated Knox IDs with semicolon separators and a trailing semicolon. Offer selectable text when clipboard access fails.

#### Calendar & Transfers

- Separate expected, completed and overdue returns in calendar filters and counts; keep unpicked schedules out of expected returns.
- Reuse the pickup-readiness switch in calendar day details and update the shared custody record.
- Replace planned schedule equipment with the actual transferred items without requiring a separate schedule edit.
- Resynchronize open asset forms when saved ownership changes, including blank-owner returns to IT Department at IT Office.

---

## [1.8.1] — 2026-11-06

### Day-First Asset Dates & Location in Every Custody Tab

Use DD-MM-YYYY for asset lifecycle date entry and show sortable locations throughout Assignments & Pickups.

#### Highlights
- Enter and edit purchase and warranty expiration dates in DD-MM-YYYY format for every asset type.
- See and sort Location in Scheduled, Assigned, Loans, Overdue, Returned, Unreturned and All records.

#### Asset Dates

- Convert day-first form entries to ISO calendar dates before saving; validate calendar dates and warranty ordering using the same format.
- Keep existing stored dates and import date conventions intact.

#### Assignments & Pickups

- Reuse the sortable Location column in every tab, including matching inline edits and expanded row spans.

---

## [1.8.0] — 2026-11-06

### Shared Workflows, Directory Merging & Clearer Equipment Handover

Reuse common controls across assignment, calendar, and traveler modules; add linked location renaming and merging, consistent pickup readiness, and a compact equipment handover UI.

#### Highlights
- Shared forms and return dialogs keep field changes consistent across modules.
- Rename or merge locations and update all linked assets and assignment or loan records together.
- Group PC and monitor searches with accessory quantities; remove special keyboard/mouse highlighting and 0/1 buttons.
- Use IT Office as the default location and IT Department as the owner.

#### Shared Components & Equipment Entry

- Share recipient, date, note, directory, timestamp, equipment-request, quantity and summary controls across create, edit, pickup, transfer and return windows.
- Use a common return form in Assignments & Pickups, Business Travelers and Calendar, including missing-accessory quantities and partial returns.
- Centralize equipment field metadata, device keys, default owner values, form initialization, validation and payload builders.
- Share calendar navigation and record presentation; control table columns explicitly instead of hiding numbered columns with CSS.
- Record accessory quantities as nonnegative whole numbers. Default charging adapter and cable to 1 when PC is requested and reset them to 0 when unchecked; keep Others / Peripherals as text.
- Offer directory choices and custom typing for rental location and department; leave Department blank for new schedules.
- Group PC and monitor asset-number fields in the handover equipment panel, followed by equal-weight accessory quantity inputs and a peripherals text field.

#### Directory Management & Location Integrity

- Add Directory search and ascending/descending name sorting; sort directory dropdown options ascending by default.
- Allow in-use locations to be renamed through Select and Edit. Update every matching asset and assignment or loan location in one transaction.
- Merge into an existing destination location, retain its ID, remove the old entry, and update linked records and the browser cache together.
- Trim leading and trailing whitespace while preserving spaces between words. Normalize legacy location names consistently for counts and asset browsing.
- Delete unused stale/cache-only locations without a location-not-found error; stop rental history from recreating deleted directory entries.
- Keep Directory panel headings and Add/Select controls visible while each card list scrolls. Save Directory edits with Enter.
- Preserve manually saved Asset Register locations through reconciliation. Migrate legacy default locations to IT Office while keeping IT Department as the owner.

#### Pickup, Calendar & Custody Records

- Use the same Ready / Not ready switch in Scheduled and All records. Hide readiness actions after pickup or return.
- Add a sortable Location column to All records and default new transfer recipients to Business traveler while respecting the selected schedule type.
- Provide a shared Hide returned checkbox in both calendars, updating events, counts and day details together.
- Treat a standalone PC value of 1 as a quantity/request rather than an asset number; retain the record without registering or tracking asset 1.
- Treat a blank new ownership holder as a return to IT. Record selected transfer dates and display fixed, readable custody timestamps without regenerating dates while viewing history.
- Display a matching Knox ID alongside the asset current holder when available.

#### Verification & Release Maintenance

- Pass 74 automated checks covering custody, imports, location merging/deletion, shared form round trips, partial returns, calendar filtering and table alignment.
- Validate the production build and preserve lazy-loaded route and spreadsheet modules.
- Require version, patch-note and affected-document updates with each completed code change; regenerate release metadata using npm run docs:sync.

---

## [1.7.0] — 2026-11-05

### Assignments & Pickups, Reliable Asset History & Schedule Rows

Separate employee assignments from traveler loans, fulfill pickup schedules by transfer, and keep asset dates, current holders, and ownership history consistent.

#### Highlights
- Assignments & Pickups: Shared scheduling with separate Assigned and Loans sections, pickup readiness, and borrower type.
- Transfer to schedule: Search by Knox ID, review traveler dates, and fulfill an existing pickup schedule in place.
- Asset integrity: Persist asset-number edits, record returns to IT, and repair missing history for existing Available assets.
- Schedule rows: Full-width entries in both calendar day dialogs; completed pickups leave pending schedules.

#### Pickup Scheduling & Calendar Layout

- Place Action, Pickup readiness, and Borrower type first in Scheduled; keep employee and traveler pickup requests together.
- Hide pickup date in Record assignment or loan until the Picked up checkbox beside Due date is checked.
- Hide return time when editing a scheduled record and reject returns before pickup through full edit, direct return, and mixed bulk return requests.
- Hide return time in expanded Scheduled rows as well as full editing. Omit the return-date column and expanded return time in Overdue; return-date records cannot be overdue.
- Display full-width schedule rows in both In & Out and Business Travelers day dialogs, with responsive layouts for smaller windows.
- Remove picked-up, returned, and transferred records from pending pickup rows and counts; refresh open-day contents from current records.

#### Equipment Transfers & Readable Times

- Select a new recipient or an existing pickup schedule. Search schedules by full or partial Knox ID without losing the current selection.
- Require valid start and end dates for business traveler recipients and preserve employee assignment semantics.
- Fulfill the selected schedule without creating a duplicate recipient record; record actual transferred items, clear readiness, and mark Pickup by transfer.
- Keep source custody and ownership history while updating registered PC and monitor ownership atomically.
- Display UTC transfer timestamps in local time without milliseconds or Z suffixes; use readable holder details and time-zone labels in new notes.
- Render older generated transfer notes without exposing internal record IDs, while preserving stored history.

#### Asset Dates, Renaming & Directory Browsing

- Provide optional Purchase date and Warranty expiration date for every asset type, accepting MM-DD-YYYY entry and retaining ISO storage.
- Validate calendar dates and warranty ordering; preserve dates through editing, TXT/XLSX exchange, backups, and restores.
- Add the warranty database column automatically and include warranty data in spreadsheet exports when populated.
- Persist asset-number changes and update linked custody, equipment, returned-device, and ownership-history references in the same transaction.
- Reject duplicate asset numbers and keep failed saves open with an error message.
- Open matching assets by clicking a Directory status, category, department, or location; search and edit asset details from that list.
- Prevent a drag beginning inside a dialog from dismissing it when the pointer ends on the backdrop.

#### IT Custody & Ownership History

- Treat clearing Current holder or selecting Available as a return to IT department, recording the previous holder and return time.
- Move returned devices to IT Department while preserving the Under repair service-center rule.
- Update linked pickup records for the returned device without falsely returning other issued equipment.
- Repair blank or stale holders and missing IT-custody history on existing Available records once. Identify reconciliation time when the original return date is unknown.
- Represent the latest current holder in Ownership History even if an older entry already names that holder.

---

## [1.6.0] — 2026-11-04

### Loan Equipment Transfers & Complete Pickup Workflows

Transfer all or part of a loan to another owner, carry equipment requests through pickup, and share business rules across the client and server.

#### Highlights
- Equipment transfers: Select all items or individual quantities for a new owner, with linked loan records and device ownership history.
- Scheduled pickups: Include employee schedules, show assignees, and hide pickup, return, and status columns during scheduling.
- Pickup details: Edit requested PC and monitor flags and select actual device asset numbers at handover.
- Locations: Use IT Department as the default and automatically assign service center to assets under repair.

#### Loan Scheduling, Pickup & Returns

- Keep employee and traveler records without pickup dates in Scheduled, including requests whose planned dates have passed.
- Display Assignee in the loan table and hide pickup date, return date, and status columns in the Scheduled tab.
- Accept manually typed rental locations alongside Directory suggestions in the add and full edit forms.
- Carry requested PC and monitor flags into full details and Confirm pickup; provide PC and monitor asset selectors at handover.
- Save the selected PC asset number during pickup and wait for the server response before confirming success.
- Display all recorded returned quantities, including USB Dongle, monitor, Ethernet cable, and other items.

#### Equipment Transfers

- Expand a picked-up outstanding loan and choose Transfer equipment; enter a different owner Knox ID and optional name.
- Select all equipment or specific items and quantities. Retain remaining items on the source loan and create a linked custody record for transferred items.
- Update ownership history for registered PCs and monitors. Archive fully transferred source records with a Transferred label without recording a physical return.
- Validate available quantities and apply loan, asset, and ownership history updates atomically, rolling back on failure.

#### Shared Rules, Location Defaults & Reliability

- Extract shared loan rules, equipment schemas, import mappings, calendar helpers, form controls, Directory panels, and server serializers.
- Rename legacy Head Office locations to IT Department on startup, import, and restore; merge duplicate default entries.
- Automatically register service center and assign it to Under repair assets across single and batch edits, imports, restores, and reconciliation.
- Preserve repair state during ongoing loan edits and returns; an explicit new pickup follows the handover transition.
- Preserve physical spreadsheet column positions when headers contain blanks and handle custom status names safely during export.
- Add regression checks for shared behavior, loan transfers, quantity conservation, ownership history, and transactional rollback.

---

## [1.5.0] — 2026-11-02

### Flexible Loan Recording, Reliable Imports & Restore History

Record loans with only a Knox ID, enter pickups directly, search PC and monitor assets by type, and merge repeat imports using shared loan identity rules.

#### Highlights
- Loan Recording: Knox ID is the only required field; assignee name and PC asset number are optional. Enter a pickup date to record an existing handover directly.
- Equipment Search: Search laptops, MES PCs, and PCs in the PC field; monitor search accepts registered monitor assets.
- Reliable Imports: Preview, local merging, and server imports share loan matching rules so regenerated import IDs do not create repeated records.
- Restore History: Browse saved database restore points and restore a selected snapshot.

#### Loan Recording & Display

- Display and sort by PC asset number in the Loans table instead of displaying a row sequence number.
- Allow schedules without a full name or PC assignment; avoid creating empty asset and employee records.
- An optional pickup date records the handover immediately and updates the linked PC custody state.
- Filter PC suggestions to Laptop, MES PC, and PC categories, and monitor suggestions to Monitor and Monitors categories.

#### Import Matching & Duplicate Cleanup

- Share identity matching between the import preview, client merge, and server import using record IDs, asset/person identifiers, and start, pickup, or return dates.
- Use a unique asset/person fallback when only one side lacks start and pickup dates; retain separate dated records when no match is established.
- Preserve blank imported start dates instead of substituting the import date, and report added and updated loan counts separately on the server.
- Remove exact duplicate loan records during imports and server startup. Startup cleanup saves a restore point before clearing start dates later than the return date on records without a pickup date and removing resulting duplicates.

#### Directory, Data Exchange & Loading

- Manage custom asset statuses from the Asset & Organization Directory and add statuses from asset forms.
- Support the revised 10-column SPE equipment register, including asset type, purchase date, department, location, and notes.
- Show database restore point history and allow restoration by snapshot ID, saving the current state before restoration.
- Load route pages, patch history dialogs, and spreadsheet processing on demand to reduce the initial JavaScript bundle.

---

## [1.4.0] — 2026-10-27

### Partial Return Tracking, Pickup Readiness & Directory Management

Track missing equipment after a partial return, mark scheduled equipment ready for pickup, and manage asset categories, departments, and locations from the Directory page.

#### Highlights
- Unreturned Loans: Review partial returns in a dedicated Loans section and see which issued accessories remain outstanding.
- Ready for Pickup: Mark scheduled loan equipment as prepared for incoming personnel.
- Directory Management: Add, select, edit, and bulk-delete categories, departments, and locations; values in use by assets are protected.
- Version Governance: Application metadata is sourced from package.json (v1.4.0).

#### Partial Return Tracking

- Added a dedicated Unreturned section in Loans for partial returns, including loans that are not overdue.
- Record actual returned accessory counts separately from the issued equipment checklist and display outstanding items in the loan list and details.

#### Scheduled Pickup Readiness

- Operators can mark scheduled equipment ready for pickup by an incoming employee and clear the flag when the equipment is picked up.

#### Directory Management

- Added selection, select-all, edit, and bulk-delete controls for asset categories, departments, and locations.
- Values referenced by assets are visibly marked in use and protected from editing or deletion.

#### Documentation & Versioning

- Updated package metadata and synchronized documentation to v1.4.0.
- Updated README, Software Design Document, Technical Specification, and patch notes for this release.

---

## [1.3.0] — 2026-10-26

### Loan Search, Flexible Custody Updates & Asset Multi-Selection

Expanded loan management with searchable and filterable records, editable equipment details during pickup and return, and drag selection for faster asset register batch operations.

#### Highlights
- Loan Search & Filters: Search loan records across all fields or target assignee, Knox ID, asset, location, IP address, department, and notes; narrow results by loan status.
- Pickup & Return Updates: Review and edit accessory counts and loan details as equipment is handed over or returned, with changes persisted by the server.
- Asset Register Drag Selection: Select multiple asset rows with a drag gesture to streamline existing batch actions.
- Version Governance: Bumped the application, server health/export metadata, and documentation to v1.3.0.

#### Loan Search & Filtering

- Added a loan search bar with selectable search fields for assignee, Knox ID, laptop/asset number, location, IP address, department, and note/purpose, plus an all-fields option.
- Added loan status filtering to help operators isolate scheduled, active, overdue, and returned records.

#### Pickup & Return Details

- Pickup and return workflows can update the itemized equipment checklist and supporting loan details alongside their respective custody dates.
- Persisted pickup and return edits through the loans API while retaining the existing asset custody and audit-history workflows.

#### Asset Register Selection

- Added drag-to-select interaction across asset table rows for efficient multi-record batch operations.

#### Documentation & Versioning

- Bumped package metadata, client version, server health response, and exchange export metadata to v1.3.0.
- Synchronized the README, Software Design Document, Technical Specification, and patch notes with this release.

---

## [1.2.2] — 2026-10-21

### Vite Proxy Network Stability & Full-Stack Development Orchestration

Resolved Vite HTTP proxy ECONNREFUSED network errors, hardened IPv4 proxy routing to 127.0.0.1, introduced graceful HTTP 503 proxy offline interceptors, and added single-command full-stack development orchestration via concurrently.

#### Highlights
- Vite HTTP Proxy Stability: Eliminated ECONNREFUSED AggregateError proxy crashes on background polls (/api/auth/me and /api/exchange/export).
- Direct IPv4 Loopback Routing: Configured Vite proxy target to http://127.0.0.1:5000, eliminating Windows dual-stack IPv6 [::1] DNS resolution latency and connection refusal.
- Graceful Backend Offline Handling: Added configure error interceptor in vite.config.js returning a clean HTTP 503 JSON response when the backend server is stopped.
- Single-Command Full-Stack Orchestration: Integrated concurrently and added npm run dev:all to run both the Express API server and Vite frontend dev server simultaneously.

#### Vite Dev Server & Proxy Configuration

- Direct IPv4 Target: Updated proxy target in vite.config.js from http://localhost:5000 to http://127.0.0.1:5000, ensuring immediate connection to Node's IPv4 server listener without IPv6 ::1 loopback ambiguity.
- Proxy Error Interception: Configured proxy.on("error") handler to intercept ECONNREFUSED events and respond with HTTP 503 Service Unavailable, preventing uncaught Node.js stack traces in terminal consoles.

#### Development Workflow & Tooling

- Added npm run dev:all script utilizing concurrently to orchestrate npm run server:dev and npm run dev side-by-side in a single console window.
- Updated project documentation with clear local development workflows (single-command vs dual-terminal options).

#### In & Out Calendar Module

- Separated In & Out Calendar into a dedicated top-level sidebar menu item (/calendar).
- Displays device loan/custody schedules for all user types, covering both standard SPE employees and business travelers.
- Integrated requester filtering controls: toggle by user type (All, Business Traveler, SPE Employee) or select a specific individual requester.
- Interactive 42-day month grid with visual chips, indicators, and complete day schedule inspection drawers.

#### System Documentation & Version Governance

- Bumped project version to v1.2.2 in package.json, server/index.js, exchange router, and client constants.
- Synchronized README.md, Software Design Document (SDD), Technical Specification, and PATCH_NOTES.md.

---

## [1.2.1] — 2026-10-09

### Exclusive Calendar Focus View, Frontend Patch History & Versioning Calibration

Calibrated Semantic Versioning progression to standard patch increments, added an exclusive Calendar-only view mode for the Business Travelers page, introduced in-app patch history inspection per version, and synchronized all technical documentation.

#### Highlights
- Exclusive Calendar View: When calendar view is selected, KPI cards and location distribution panels are hidden to dedicate full screen exclusively to the schedule calendar.
- Frontend Patch History Modal: In-app release notes viewer per version accessible directly via the TopBar version pill and Sidebar footer.
- Semantic Versioning Calibration: Restrained minor version jumps by adhering to SemVer patch increments (1.2.x) for iterative UI polish and view state refinements.
- System Documentation Sync: Synchronized PATCH_NOTES.md, README.md, Technical Specification, and Software Design Document.

#### Business Travelers Module

- Exclusive Calendar View Mode: When "Calendar View" is active, the KPI stat cards, Location Distribution matrix, and Roster tables are cleanly omitted, presenting solely the monthly schedule calendar.
- Maintained view toggle controls so operators can seamlessly switch between "Calendar View", "Roster List", "Overdue Only", and "All Sections".
- Preserved all calendar interactions: month navigation, location filtering, search, and day assignment inspection drawers.

#### Frontend Patch History Viewer

- Added interactive Patch History Modal with multi-version tabs, per-version inspection, change categorization, and keyword search.
- Integrated clickable trigger into the TopBar version pill (v1.2.1) with hover micro-animations.
- Integrated clickable trigger into the Sidebar footer for convenient global access from any application page.
- Included full release notes history from initial prototype v0.1.0 through current v1.2.1.

#### Versioning Policy & Documentation

- Calibrated version increment cadence to strictly follow Semantic Versioning (Major.Minor.Patch) so version numbers do not advance prematurely for incremental refinements.
- Updated project README.md, Software Design Document (SDD), and Technical Specification to v1.2.1.

---

## [1.2.0] — 2026-10-07

### TXT File Import Extracted from Excel & Preserved 1:1 Excel Export

Standardized system import engine to ingest tab-delimited text (.txt) files exported directly from Excel for both Equipment Master Register and IT Equipment Loan List, while maintaining 1:1 Excel OpenXML export capabilities.

#### Highlights
- Primary TXT File Import Architecture for SPE_Equipments_example.txt and SPE_IT_Equipment_Loan_List_Example.txt
- Universal client-side multiline and quoted field delimited parser
- Interactive pre-flight import preview modal with tabbed inspection
- Preserved 1:1 reference Excel exports with full OpenXML schema parity

#### Data Ingestion Architecture

- Ingests tab-delimited text files (.txt) extracted from Excel, supporting BOM headers, CRLF linebreaks, and multiline quotes.
- Automatic signature detection recognizes Equipment Master vs Loan List files.
- Batch multi-file ingestion parses equipment registers and loan records in tandem.
- Pre-flight preview modal supports Merge & Sync or Full Database Replacement modes.

#### Spreadsheet Interoperability

- Maintained client-side OpenXML .xlsx export with 19-column loan schema and equipment master schema.
- Quick import buttons on Assets and Loans tables accept .txt files natively.

---

## [1.1.1] — 2026-10-07

### Full Screen Roster Mode & Specific URL Routing

Enhanced Business Traveler roster tracking with 1-click full-screen mode, sticky column headers, and explicit /business-travelers route naming.

#### Highlights
- Full-body expanded roster mode with Escape key and background scroll locking
- Sticky column headers maintaining reference during deep vertical scrolling
- Specific URL routing to /business-travelers with backward compatibility redirection

#### Business Traveler Usability

- Added 1-click "Full Screen Roster" toggle expanding the roster table across the entire viewport.
- Persistent search, status filters, and + Record Traveler dispatch button in full screen.
- Refactored route path from /travelers to /business-travelers with seamless redirect.

---

## [1.1.0] — 2026-10-07

### Dedicated Business Travelers Management Module & Location Matrix

Launched dedicated Business Travelers management module tracking mobile personnel, field deployments, location distribution matrix, and custody return workflows.

#### Highlights
- Sidebar navigation item for Business Travelers with live active count badge
- Fleet metrics: Active in Field, Travel Locations, Scheduled Trips, Total Travelers
- Where They Are location distribution matrix with 1-click site filtering
- One-click return confirmation flow routing equipment back to IT as Available

#### Mobile Workforce Management

- Dedicated /business-travelers page with enterprise briefcase navigation icon.
- Location distribution cards tracking custody across deployment facilities.
- Direct return flow updating asset custody back to IT department.

---

## [1.0.0] — 2026-10-07

### Official Production Baseline Release

Official baseline release featuring StarPlus Energy rebrand, compact UI architecture, state machine engine, and corporate intranet multi-host deployment.

#### Highlights
- StarPlus Energy corporate palette and geometric hexagon brand mark
- Corporate intranet operation with zero external cloud dependencies or remote fonts
- Reconciled lifecycle state machine engine across assets and loans
- High-density UI with ~32px compact topbar and scroll-free modal forms
- Direct click-to-transfer ownership badges on asset register

#### Branding & Architecture

- Implemented official brand colors (#1449d6, #0a2547, #f8fafc, #e2e8f0, #141519).
- Eliminated all remote CDN and external font dependencies in favor of native system font stack.
- Reconciled asset and loan lifecycle state reconciliation engine.
- Pure client-side zero-dependency OpenXML export generator.

---

## [0.2.0] — 2026-09-18

### Prototype Iteration: Knox ID & Custody Tracking

Prototype iteration adding corporate directory Knox ID integration, IP address tracking, accessory checklists, and ownership audit history.

#### Highlights
- Knox ID integration across employee records and device loan entries
- IP address assignment field (105.101.x.x) for laptop custody
- Itemized equipment accessory checklist (adapters, cables, dongles, peripherals)
- Initial asset ownership history audit timeline

#### Prototype Extensions

- Integrated Knox ID fields into custody records.
- Added IP prefix validation and accessory tracking.
- Built initial client-side XLSX generation.

---

## [0.1.0] — 2026-08-10

### Initial Concept Prototype

Initial concept prototype establishing the local asset index register, basic checkout/return tracking, and browser local storage persistence.

#### Highlights
- Asset index register for laptops, monitors, and peripherals
- Basic internal checkout and return custody workflows
- Executive dashboard counters and organization directory
- Local workstation browser storage persistence

#### Foundation

- Initial local data model and storage schema.
- Prototype dashboard and asset catalog.

---
