# StarPlus Energy Asset Management System — Patch Notes & Changelog

All notable changes, architectural updates, and state engine revisions for the **StarPlus Energy Asset Management System (SPE-AMS)** are documented in this file.

The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] — 2026-10-09

### Added & Improved: Exclusive Calendar View, Frontend Patch History & Versioning Calibration

#### 📅 Exclusive Calendar View Mode (`/business-travelers`)
- **Focused Calendar Display**: When the operator selects **"Calendar View"**, the system now exclusively displays the monthly schedule calendar (`TravelerCalendar.jsx`), cleanly omitting the KPI stat cards, "Where They Are" location distribution matrix, overdue alert panels, and the roster table.
- **De-cluttered Workspace**: Maximizes viewport real estate for inspecting month-by-month traveler dispatches, returns, and daily scheduled events without vertical page scrolling or visual distraction.
- **Persistent View Switcher**: Operators can seamlessly toggle between **"Calendar View"** (calendar only), **"Roster List"** (KPIs, locations & table), **"Overdue Only"** (urgent overdue travelers), and **"All Sections"** (complete combined dashboard).

#### 📋 Frontend Patch History & Release Notes Modal (`PatchHistoryModal.jsx`)
- **Direct Frontend Access**: Integrated an interactive Patch History modal accessible anywhere in the application by clicking the **`v1.2.1` version pill** in the TopBar or clicking the **`v1.2.1 • Patch Notes`** footer in the Sidebar.
- **Per-Version Inspection**: Organizes release notes per version with quick selector tabs (`All Versions`, `v1.2.1`, `v1.2.0`, `v1.1.1`, `v1.1.0`, `v1.0.0`, `v0.2.0`, `v0.1.0`).
- **Interactive Search & Type Filtering**: Real-time keyword search across all version summaries, highlights, and change items, accompanied by type filter pills (`All Types`, `Patches`, `Minor`, `Major`).
- **Detailed Categorized Breakdown**: Displays release dates, active version indicators, categorized change badges (`UI Enhancement`, `New Feature`, `Governance & Docs`), and expand/collapse controls.
- **Structured Dataset (`src/data/patchHistory.js`)**: Backed by a clean, typed changelog data module mirroring `PATCH_NOTES.md` for offline intranet use.

#### ⚖️ Semantic Versioning Calibration & Governance
- **Paced Version Increments**: Addressed version inflation where minor versions advanced too quickly for iterative feature refinements. Calibrated version increments strictly to Semantic Versioning (SemVer 2.0.0):
  - **Patch Increments (`1.2.x`)**: Reserved for UI refinements, view focus controls, bug fixes, changelog displays, and documentation synchronization.
  - **Minor Increments (`1.x.0`)**: Reserved for major new standalone modules or external data exchange formats.
  - **Major Increments (`x.0.0`)**: Reserved for breaking architectural shifts or master database schema overhauls.

#### 🛡️ Layout Overflow & Modal Clipping Fixes (Patch History Visibility)
- **Modal Header Anchoring & Elevated Z-Index**: Corrected modal positioning by pinning `.modal.patch-history-modal-wrapper` to an explicit top offset (`margin: 12px auto !important; align-items: flex-start; z-index: 100000;`), preventing the top header, release tags, and close button from being clipped off in tall or zoomed viewports or obscured by full-screen overlays.
- **Card Flex Shrinkage Prevention**: Fixed critical flex compression issue by setting `flex-shrink: 0 !important; min-height: min-content !important;` on `.patch-card`, `.patch-card-header`, and `.patch-card-body`. This prevents cards from being crushed into flattened horizontal stripes when multiple versions or "Expand All" are active, guaranteeing each card renders at full natural height with a smooth, dedicated vertical scrollbar.
- **Dedicated Single-Scroll Cards Stream**: Encapsulated release cards within an internal scroll container (`.patch-cards-stream`) with custom thin scrollbar while keeping the modal header, search filters, and footer permanently pinned.
- **Sticky Sidebar & Pinned Bottom-Left Footer**: Made `.sidebar` sticky (`position: sticky; top: 0; height: 100vh; max-height: 100vh; overflow-y: auto;`). The bottom-left `v1.2.1 • Patch Notes` footer pill is now permanently pinned to the viewport, never scrolling out of sight on tall pages such as Business Travelers.
- **Business Travelers Direct Patch Notes Button**: Integrated an explicit `📋 v1.2.1 Patch Notes` button directly into the Business Travelers view header (`view-header-actions`), making release notes immediately accessible when viewing the calendar or roster.
- **Horizontal Viewport Overflow Prevention**: Constrained `.main-content` (`max-width: calc(100vw - 252px); overflow-x: hidden;`) and wide components (such as `TravelerCalendar`'s 7-column grid) with `overflow-x: auto;`, preventing layout blowouts that pushed the TopBar `v1.2.1 • Patch Notes` button off-screen.
- **Global Context Provider**: Introduced `PatchHistoryContext` in `AppShell` with `usePatchHistoryModal` hook, allowing any view to trigger the release notes modal cleanly.

---

## [1.2.0] — 2026-10-07

### Added: TXT File Import Extracted from Excel & Preserved 1:1 Excel Export

#### 📥 Primary TXT File Import Architecture (`src/lib/txtImport.js`)
- **Extracted from Excel Support**: Standardized the system import engine to ingest tab-delimited text (`.txt`) files exported directly from Excel:
  - **Equipment Master Register (`SPE_Equipments_example.txt`)**: Parses `Host Name`, `Serial Number`, `Status`, `Issued Knox ID`, and `Issued Date`, updating or creating master inventory records and ownership lineage.
  - **IT Equipment Loan List (`SPE_IT_Equipment_Loan_List_Example.txt`)**: Parses `Start Date`, `Pickup Date`, `End Date`, `Return Date`, `Laptop`, accessories (`Adapter`, `Cable`, `Dongle`, `Keyboard`, `Mouse`, `Monitor`, `Ethernet cable`), and notes.
- **Universal Multiline & Quote Delimited Parser**: Handles multiline Excel quoted fields (e.g., `"Charging \r\nAdapter"`), BOM headers (`\uFEFF`), CRLF/LF line breaks, and auto-detects tab vs comma delimiters completely client-side.
- **Automatic Format Detection**: Automatically inspects header signatures to identify whether an uploaded text file is an Equipment Master Register or a Loan List.
- **Batch Multi-File Ingestion**: Allows administrators to drag & drop or select both `SPE_Equipments_example.txt` and `SPE_IT_Equipment_Loan_List_Example.txt` simultaneously. The engine parses both files in tandem, cross-referencing borrower Knox IDs with laptop custody records.

#### 👁️ Interactive Import Preview Modal
- **Live Pre-Flight Inspection**: Inspects extracted rows and presents a tabbed preview (`Equipment Assets` vs `Loan Records`) before writing to storage.
- **Flexible Ingestion Modes**:
  - **Merge & Sync (Recommended)**: Intelligently updates matching assets and loans, appending new records while safeguarding existing unmentioned entries.
  - **Full Database Replacement**: Performs a clean database replacement with automated pre-import restore snapshots.

#### 📊 Preserved 1:1 Reference Excel Exports
- **Excel Export Parity**: Retained exact `.xlsx` OpenXML export capabilities:
  - `SPE_IT_Equipment_Loan_List_YYYY-MM-DD.xlsx` with all 19 corporate standard columns.
  - `SPE_Equipments_YYYY-MM-DD.xlsx` with official equipment columns (`Host Name`, `Serial Number`, `Status`, `Issued Knox ID`, `Issued Date`).
- **Assets Page TXT Support**: Extended the Quick Import button on the Assets table (`/assets`) to seamlessly accept `.txt` equipment files.

---

## [1.1.1] — 2026-10-07

### Improved: Full Screen Roster Mode & Specific URL Routing

#### 🖥️ Business Traveler Roster Full Screen Mode
- **Full-Body Expanded View**: Added a 1-click **"Full Screen Roster"** toggle to the Business Traveler Roster panel, allowing administrators to view the complete mobile workforce roster across the entire viewport (`roster-fullscreen`).
- **Sticky Column Headers**: Table headers remain anchored at the top during vertical scrolling to maintain clear column reference across high-density lists.
- **Persistent Management Controls**: Fullscreen mode preserves quick search, status filtering tabs, and the `+ Record Traveler` dispatch button directly in view.
- **Escape Key & Scroll Lock**: Added automatic keyboard support for the `Escape` key to instantly exit full-screen mode, along with background page scroll locking.

#### 🔗 Explicit & Specific URL Routing (`/business-travelers`)
- **Route Renaming**: Upgraded the URL from the generic `/travelers` to `/business-travelers` for clear, descriptive navigation.
- **Backward Compatibility**: Configured automatic redirection from `/travelers` to `/business-travelers` so any cached links or bookmarks resolve smoothly.
- **Component Standard**: Refactored the view to `BusinessTravelersPage.jsx`.

---

## [1.1.0] — 2026-10-07

### Added: Dedicated Business Travelers Management Module & Location Matrix

#### ✈️ Dedicated Business Travelers Management (`/travelers`)
- **Sidebar Integration**: Added a dedicated **Business Travelers** navigation item to the sidebar with an enterprise briefcase icon and an active count badge showing unreturned travelers in real time.
- **"How Many They Are" Fleet Metrics**:
  - **Active in Field**: Total travelers holding IT hardware on active or overdue assignments outside IT custody.
  - **Travel Locations**: Count of active remote plant/office deployment sites.
  - **Scheduled Trips**: Upcoming equipment pickups awaiting dispatch.
  - **Total Travelers**: Count of unique personnel who have undertaken travel assignments.
- **"Where They Are" Location Distribution Grid**:
  - Interactive cards grouped by deployment location (e.g., Kokomo Plant, Regional Office, Detroit Center, Head Office).
  - Displays headcount of travelers deployed per site, active/overdue breakdown, and lists assigned staff names.
  - One-click location filtering: clicking any location card instantly filters the roster table to that site.
- **Mobile Workforce Roster & Return Actions**:
  - Searchable by traveler name, Knox ID, location, asset code, or IP.
  - Filterable by status (Active in Field, Scheduled, Overdue, Returned, All).
  - Direct **"Return"** action button launching a dedicated return confirmation modal that routes equipment directly back to the IT department as `Available`.
  - Direct **"Edit"** trip button opening the full loan editor modal.
  - Direct **"+ Record Business Traveler"** workflow for quick deployment registration.
- **Header & Navigation Metadata**:
  - Integrated `/travelers` in TopBar with eyebrow `FIELD DEPLOYMENTS & MOBILE WORKFORCE` and title `Business Travelers`.

---

## [1.0.0] — 2026-10-07 (Official Production Release)

### Baseline Release: StarPlus Energy Rebrand, States Engine v1.0.0, and 100% Offline Air-Gap Architecture

#### 🎨 Corporate Branding & High-Density UI
- **StarPlus Energy Corporate Palette**: Implemented official brand colors:
  - **Corporate Blue (`#1449d6`)**: Primary brand accents, active navigation, buttons, and status highlights.
  - **Deep Navy (`#0a2547`)**: Contrast headers, card titles, and high-emphasis elements.
  - **Neutral Canvas (`#f8fafc`)**: Crisp, modern background replacing dark/low-contrast tones.
  - **Clean Borders (`#e2e8f0`)**: Subtle, crisp dividers and structural outlines.
  - **Slate Ink (`#141519`)**: High-contrast, legible typography.
- **Geometric Hexagon SVG Brand Mark**: Replaced placeholder symbols with an inline vector hexagon logo mark aligned with StarPlus Energy's battery and clean energy engineering identity.
- **Ultra-Compact Topbar (~32px)**: Redesigned the global header into a slim, single-line bar (~32px height), recovering over 100px of vertical space for the primary asset and loan data tables.
- **Professional Enterprise Layout**:
  - Eliminated informal greeting banners (*"Good morning, James"*) in favor of a clean, structured operational interface.
  - Removed redundant `<h2>` section headers above data tables to maximize vertical data density.
  - Added visible **v1.0.0 Version Pills** in both the TopBar action cluster and the Sidebar footer.
  - **Scroll-Free Compact Modal Forms**: Re-engineered the Asset Form from a tall 2-column layout (6 rows) into an ultra-compact 4-column x 3-row responsive grid (`.asset-form-grid`) with proportional column widths (`1fr 1.15fr 1fr 1.35fr`), reducing modal height by over 45% (~300px reduction) and completely eliminating the vertical scrollbar. Equipment checklists in loan forms were similarly consolidated into a 4-column subgrid.

#### 🔒 100% Air-Gapped Offline Operation
- **Zero Remote Dependencies**: Completely eliminated external Google Fonts (`Outfit`, `Space Grotesk`) and external CDN links from `index.html`.
- **Native OS Font Stack**: Configured a high-performance system typography stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", Arial, sans-serif`), guaranteeing instant rendering in air-gapped corporate environments.
- **Client-Side Storage**: All operations, data persistence, and audit logging execute purely inside workstation browser storage (LocalStorage / IndexedDB) with zero remote telemetry.

#### ⚙️ States Version 1.0.0 & State Machine Engine
- **Formalized Operational States**: Standardized six mutually exclusive asset states:
  - `Available`: Asset is in storage/fleet ready for deployment. Current holder is strictly `IT department` or unassigned.
  - `Assigned`: Asset is deployed to a designated employee or department.
  - `On loan`: Asset is actively checked out under a temporary custody loan agreement.
  - `Damaged`: Hardware fault recorded; awaiting evaluation.
  - `Under repair`: Active internal or external vendor maintenance.
  - `Retired`: Asset decommissioned and permanently archived.
- **Active Holder Invariant**: Enforced rule where any asset with an assigned employee holder cannot have status `Available`; the engine automatically validates and normalizes the status to `Assigned` (or `On loan`).
- **Return to IT Department Workflow**:
  - Returning an asset from a loan or assignment automatically sets the current holder to **`IT department`**.
  - Status transitions automatically to **`Available`** (unless flagged as damaged).
  - Appends an immutable record to `ownershipHistory` preserving the prior borrower as `previousOwner`, `IT department` as `newOwner`, timestamp, and reason `"Returned to IT department"`.
- **Passive Verification & Sync Background Service**:
  - Eliminated the need for manual administrative sync triggers.
  - Continuous, non-intrusive background service reconciles loan checkouts and returns against the master asset index upon database mount and every state mutation.
  - Normalizes legacy pool strings (`"pool"`, `"returned to pool"`) directly to `"IT department"`.

#### 🔄 Direct Ownership Transfer & Table Usability
- **Click-to-Transfer Interaction**: Removed the cluttered `ACTIONS` column from the Assets table. Users can now click directly on the current holder badge to open the **Change Ownership Modal**.
- **Spacious Transfer Modal**: Expanded modal layout with comfortable padding and distinct input zones.
- **Customizable Transfer Reasons**: Added quick-select standardized reasons (*"Reassigned to new staff"*, *"New Hire onboarding"*, *"Department Transfer"*, *"Returned to IT department"*, *"Temporary Handover"*, *"Repaired & Reassigned"*) alongside arbitrary custom reasons stored persistently.
- **Historical Continuity**: Fixed edge cases where transferring a laptop to IT department caused previous holder data to be lost. The system strictly records the transition from the previous holder to `IT department`.

#### 📊 Excel Exchange Engine (1:1 Schema Parity)
- **Zero-Dependency OpenXML Parser/Generator**: Pure client-side JavaScript engine constructing valid ZIP/OpenXML packages without third-party npm libraries.
- **1:1 Column & Header Parity**: Exported `.xlsx` files exactly match the structure and column order of the reference workbook (`SPE_IT_Equipment_Loan_List.xlsx`):
  `no`, `Name`, `Knox ID`, `Rental Location`, `IP`, `Start Date`, `Pickup Date`, `End Date`, `Return Date`, `Laptop`, `Charging Adapter`, `Charging Cable`, `Dongle`, `Keyboard`, `Mouse`, `Monitor`, `Ethernet cable`, `others`, `Note`.
- **Pre-Import Restore Snapshot**: Automatically serializes and caches the active database before any Excel replacement import, enabling immediate one-click rollback via **"Revert last import"**.

#### ⚡ Modernized Core Tech Stack
- Upgraded to **React 19** (`^19.0.0`) for modern concurrent rendering and performance.
- Upgraded to **Vite 6** (`^6.0.0`) for sub-second build times and streamlined HMR.
- Upgraded to **React Router 7** (`^7.0.0`) for declarative client-side SPA routing.

---

## [0.2.0] — 2026-09-18 (Prototype Iteration)

### Added
- **Knox ID Integration**: Integrated Knox directory identification into employee records and device loan entries.
- **IP Address Tracking**: Added IP address assignment field (`105.101.x.x`) for laptop loan records.
- **Equipment Checklist**: Expanded loan checkouts to track itemized accessories (Adapter, Cable, Dongle, Keyboard, Mouse, Monitor, Ethernet cable).
- **Ownership History Timeline**: Added initial history tracking table to the asset editing modal.
- **Basic Excel Import/Export**: Added initial client-side XLSX generation and workbook ingestion.

---

## [0.1.0] — 2026-08-10 (Initial Prototype)

### Pre-release Prototype
- **Asset Index Register**: Core table for managing company hardware (laptops, monitors, peripherals).
- **Internal Loan Tracking**: Basic checkout and return workflows for employee hardware.
- **Executive Dashboard**: High-level counters for available, assigned, and damaged assets.
- **Directory**: Basic employee and department listings.
- **Workstation Local Storage**: Browser-based persistence without server dependencies.
