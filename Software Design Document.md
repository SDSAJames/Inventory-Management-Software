# StarPlus Energy Asset Management System — Software Design Document (SDD)

| Metadata | Details |
| :--- | :--- |
| **Document Version** | **v1.3.0** |
| **System Name** | StarPlus Energy Asset Management System (SPE-AMS) |
| **Document Status** | Approved / Production Specification |
| **Release Date** | October 2026 |
| **Target Environment** | Corporate Intranet Server (Multi-Host Network Deployment) |
| **Tech Stack** | Node.js 22+, Express 5, SQLite (`node:sqlite`), React 19, Vite 6, React Router 7, Vanilla CSS |
| **Related Documents** | [Technical Specification.md](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/Technical%20Specification.md), [PATCH_NOTES.md](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/PATCH_NOTES.md) |

---

## 1. Executive Summary & Document Purpose

The **StarPlus Energy Asset Management System (SPE-AMS)** is a high-reliability, corporate intranet internal inventory and custody management web application designed for StarPlus Energy IT operations. 

The application serves as the **single source of truth** for company hardware (laptops, monitors, peripherals, and network accessories), replacing ad-hoc spreadsheets while maintaining 100% bidirectional data interoperability with corporate Excel workbooks (`.xlsx`) and sharing persistent data across all intranet workstations.

### Core Business Pillars
1. **Asset as Master Record**: Every physical device carries a unique asset code (`SPE-XXXX` or serial number) that remains perpetual regardless of reassignments, temporary loans, maintenance cycles, or returns.
2. **Corporate Intranet Operation**: Deployed centrally on the corporate network (`0.0.0.0:5000`) with zero dependencies on external cloud APIs, remote CDNs, or external typography services (Google Fonts). All assets, styling, and data storage operate strictly within the company network.
3. **Deterministic State Lifecycle & Passive Sync**: A strict state machine enforces valid operational states (`Available`, `Assigned`, `On loan`, `Damaged`, `Under repair`, `Retired`) supported by a non-intrusive background verification engine that actively reconciles custody states.
4. **Unified Custody & Return Lineage**: Full chronological tracking of ownership transfers. When an asset is returned from custody, it is formally received by the **IT department**, returning its status to **Available** while preserving its prior holder lineage.

---

## 2. Brand Identity & Design System

The application incorporates the formal StarPlus Energy corporate brand guidelines:

### 2.1 Corporate Palette

| Role | Color Name | Hex Code | Usage |
| :--- | :--- | :--- | :--- |
| **Primary** | Corporate Blue | `#1449d6` | Key actions, active states, brand mark, active navigation |
| **Primary Dark** | Deep Navy | `#0a2547` | Headings, brand contrast accents |
| **Primary Light** | Soft Blue Tint | `#eef4ff` | Badges, selection highlights, version pill |
| **Background** | Clean Neutral | `#f8fafc` | Main application shell background |
| **Surface** | Pure White | `#ffffff` | Content panels, cards, data tables, modals |
| **Borders** | Slate Line | `#e2e8f0` | Dividers, card boundaries, table cell borders |
| **Typography** | Slate Ink | `#141519` | High-contrast body text and titles |
| **Muted Ink** | Slate Gray | `#64748b` | Subtitles, labels, metadata, secondary icons |
| **Success** | Emerald | `#10b981` | Available status, healthy indicators, offline status dot |
| **Warning** | Amber | `#f59e0b` | On loan badges, scheduled loans |
| **Danger** | Crimson | `#ef4444` | Damaged assets, overdue loan alerts, destructive actions |

### 2.2 Corporate Mark & Typography
- **Geometric Hexagon SVG Mark**: Custom inline vector hexagon glyph representing StarPlus Energy's battery and clean energy engineering identity.
- **Air-Gapped Typography Stack**: Native system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", Arial, sans-serif`). Zero external network requests to Google Fonts or Typekit, guaranteeing consistent, instantaneous rendering in offline and intranet environments.
- **High-Density Compact Layout**: An ultra-compact topbar (~32px height) eliminating wasted vertical space and maximizing the viewable area for large asset tables and inventory grids. Redundant greeting banners have been eliminated in favor of a clean enterprise header.

---

## 3. Technology Stack & Architecture

```mermaid
graph TD
    subgraph Workstations ["Corporate Intranet Workstations"]
        UI["React 19 + React Router 7 Presentation Layer"]
        Context["DbContext & useDb Hook"]
        APIClient["lib/api.js REST API Client"]
        Integrity["assetIntegrity.js State Engine"]
        ClientCache["lib/db.js LocalStorage Cache"]
        ExcelEngine["lib/xlsx.js Native OpenXML Engine"]
        TxtParser["lib/txtImport.js Delimited Text Parser"]

        UI --> Context
        Context --> Integrity
        Context --> ClientCache
        Context --> APIClient
        Context --> ExcelEngine
        Context --> TxtParser
    end

    subgraph CentralServer ["Central Intranet Server: Node.js 22+ & Express 5 on 0.0.0.0:5000"]
        Server["Express Server & LAN CORS Middleware"]
        StaticSPA["Static Client Dist & SPA Fallback"]
        AuthMiddleware["middleware/auth.js JWT Auth"]

        subgraph APIRouters ["REST API Routers"]
            AssetsRoute["/api/assets"]
            LoansRoute["/api/loans"]
            DirectoryRoute["/api/directory"]
            StatsRoute["/api/stats"]
            ExchangeRoute["/api/exchange (Import, Export, Revert)"]
            AuthRoute["/api/auth"]
        end

        ServerStateEngine["reconcileAllAssetsInDb State Engine"]
        SnapshotEngine["createSnapshot Transaction Engine"]
        AuditEngine["logAudit & Audit Logger"]

        subgraph SQLitePersistence ["Shared Native SQLite Database: node:sqlite in WAL Mode"]
            DB[("server/data/inventory.db")]
            T_Assets[("assets")]
            T_Loans[("loans")]
            T_History[("ownership_history")]
            T_Backups[("import_backups")]
            T_Audit[("audit_logs")]
            T_Ref[("employees, departments, locations, users")]

            DB --- T_Assets
            DB --- T_Loans
            DB --- T_History
            DB --- T_Backups
            DB --- T_Audit
            DB --- T_Ref
        end
    end

    APIClient <-->|HTTP REST / LAN CORS| Server
    Server --> StaticSPA
    Server --> AuthMiddleware
    AuthMiddleware --> APIRouters
    APIRouters --> ServerStateEngine
    APIRouters --> SnapshotEngine
    APIRouters --> AuditEngine
    ServerStateEngine --> DB
    SnapshotEngine --> DB
    AuditEngine --> DB
    APIRouters --> DB
```

| Layer | Component | Specification | Rationale |
| :--- | :--- | :--- | :--- |
| **Backend & Web Server** | Node.js 22+ & Express 5 (`express: ^5.3.0`) | High-performance HTTP API & static SPA server binding to `0.0.0.0:5000` | Multi-host intranet connectivity, LAN CORS, JWT auth, and centralized REST endpoints (`/api/assets`, `/api/loans`, `/api/directory`, `/api/stats`, `/api/exchange`). |
| **Shared Database Engine** | SQLite (`node:sqlite`) | Native Node.js embedded database in WAL mode (`server/data/inventory.db`) | Central single source of truth across all intranet workstations with ACID compliance, transaction rollback snapshots (`import_backups`), and zero external database server daemons. |
| **Frontend Framework** | React 19 (`react: ^19.0.0`) | Modern component model, hooks, concurrent rendering & optimistic UI | Fast client-side rendering with real-time background synchronization (15s polling and focus re-sync) against the central Express server. |
| **Bundler & Dev Proxy** | Vite 6 (`vite: ^6.0.0`) | Lightning-fast HMR and optimized production bundle | Dev proxy targeting `http://127.0.0.1:5000` with graceful 503 error interception when the backend server is offline. |
| **Routing** | React Router 7 (`react-router-dom: ^7.0.0`) | SPA client-side route handling with Express wildcard fallback | Instant view switching across Overview, Assets, Loans, Calendar, Business Travelers, Directory, Exchange. |
| **Styling** | Vanilla CSS Design Tokens | Native CSS variables, zero runtime CSS-in-JS | Complete layout flexibility, no Tailwind dependencies, 100% offline air-gapped styling. |
| **Client Cache & Resilience** | Browser Web Storage (`lib/db.js`) | LocalStorage snapshot cache | Sub-millisecond initial paint, local snapshot buffering, and seamless offline fallback during network disconnections. |
| **Spreadsheet & TXT Engine** | Pure JS OpenXML & Delimited Text Parser | Native ZIP/DEFLATE generator (`lib/xlsx.js`) & TXT parser (`lib/txtImport.js`) | In-browser Excel TXT extraction parser and 1:1 `.xlsx` workbook generation with zero third-party cloud or binary dependencies. |
| **Dev Orchestration** | Concurrently (`concurrently: ^10.0.6`) | Single-command full-stack startup (`npm run dev:all`) | Simultaneously launches Express API server and Vite dev server with colored prefix logging. |

---

## 4. States Version & State Machine Specification (v1.0.0)

### 4.1 Asset States Definition (States Schema v1.0.0)

The system recognizes exactly six mutually exclusive operational states for all hardware items:

| Status | Code | Description | Permitted Current Holder |
| :--- | :--- | :--- | :--- |
| **Available** | `Available` | Asset is in storage/fleet, tested, and ready for immediate deployment or checkout. | Strictly `IT department` or Unassigned (`""`) |
| **Assigned** | `Assigned` | Asset is assigned to a specific employee or department for day-to-day work duties. | Must be a named employee or department |
| **On loan** | `On loan` | Asset is out on active temporary custody under a formal loan agreement. | Must match the active loan's `assignee` |
| **Damaged** | `Damaged` | Asset has reported physical or functional defects; held for evaluation. | `IT department` or reporting employee |
| **Under repair** | `Under repair` | Asset is actively undergoing internal repair or external vendor service. | `IT department` or Vendor |
| **Retired** | `Retired` | Asset decommissioned, disposed of, or parted out; retained for audit history. | Decommissioned archive |

### 4.2 State Transition Diagram

```mermaid
stateDiagram-v2
    [*] --> Available: Asset Registered
    
    Available --> Assigned: Assign to Employee / Dept
    Available --> On_loan: Check Out on Loan (Pickup)
    Available --> Damaged: Defect Reported
    Available --> Retired: Decommissioned
    
    Assigned --> Available: Return to IT Department
    Assigned --> On_loan: Handover to Loan
    Assigned --> Damaged: Defect Reported
    Assigned --> Under_repair: Maintenance
    
    On_loan --> Available: Loan Returned (Holder to IT department)
    On_loan --> Damaged: Defect on Return
    
    Damaged --> Under_repair: Sent for Servicing
    Under_repair --> Available: Repair Completed (Holder to IT department)
    Under_repair --> Retired: Beyond Economic Repair
    
    Retired --> [*]
```

### 4.3 State Invariants & Business Transition Rules

1. **Active Holder Invariant**:
   - If an asset has an assigned employee or department holder (`owner != ''` and `owner != 'IT department'`), its status **cannot** be `Available`. The system automatically normalizes the status to `Assigned` (or `On loan` if tied to an active checkout).
   - If an asset is marked `Available`, its holder is normalized to `IT department` (or empty).
2. **Return to IT Department Workflow**:
   - When any asset is returned from an assignment or loan checkout:
     - The holder is explicitly set to **`IT department`**.
     - The status transitions to **`Available`** (unless flagged as damaged).
     - An immutable entry is appended to the asset's `ownershipHistory`, recording the previous borrower as `previousOwner`, `IT department` as `newOwner`, the return timestamp, and the reason `"Returned to IT department"`.
3. **Passive Verification & Sync Service**:
   - Rather than requiring manual administrative triggers, a passive background integrity service runs automatically during database initialization and state mutations across both client and server tiers:
     - **Frontend Client (`src/lib/assetIntegrity.js` via `useDb.jsx`)**: `reconcileAllAssets()` continuously reconciles local state upon initialization, loan pickup/return, periodic polling (every 15s), and window focus.
     - **Shared Backend Server (`server/db/database.js`)**: `reconcileAllAssetsInDb()` runs directly against the SQLite database during server boot, loan checkout/pickup, return processing, and data exchange imports (`/api/exchange/import`), committing synchronized state updates across all connected intranet hosts.
   - It continuously reconciles loan records against the asset register:
     - If an active loan is picked up and unreturned, the asset status is enforced as `On loan`, and its location and holder reflect the loan record.
     - When all loans for an asset are returned, the asset is automatically freed from `On loan` status and restored to `Available` held by `IT department`.
     - Normalizes legacy references (e.g. `"pool"`, `"returned to pool"`) directly to `"IT department"`.
4. **Direct Ownership Transfer**:
   - Clicking on any holder badge in the Assets table directly launches the **Change Ownership Modal**, eliminating the need for a redundant "Actions" column in the table layout.
   - Provides selectable standardized reasons (*"Reassigned to new staff"*, *"New Hire onboarding"*, *"Department Transfer"*, *"Returned to IT department"*, *"Temporary Handover"*, *"Repaired & Reassigned"*) alongside custom entry.

---

## 5. Unified Ownership History Architecture

Every asset maintains a nested, chronological `ownershipHistory` array:

```json
{
  "id": "e9f1a234-8c90-4e2b-a132-7589d6b45a90",
  "code": "SPE-1002",
  "name": "ThinkPad T14s Gen 3",
  "category": "Laptop",
  "owner": "IT department",
  "department": "",
  "status": "Available",
  "location": "HQ - Storage Room 2B",
  "updated": "2026-10-07",
  "ownershipHistory": [
    {
      "id": "hist-101",
      "date": "2026-10-07 14:15:00",
      "previousOwner": "Sarah Connor",
      "newOwner": "IT department",
      "reason": "Returned to IT department",
      "notes": "Project completed, clean condition"
    },
    {
      "id": "hist-100",
      "date": "2026-03-15 09:00:00",
      "previousOwner": "IT department",
      "newOwner": "Sarah Connor",
      "reason": "Department Transfer",
      "notes": "Engineering allocation"
    }
  ]
}
```

The system dynamically merges permanent assignments with internal loan checkout/return events via `getAssetEffectiveOwnershipHistory()`, ensuring an unbroken audit trail from initial registration to decommissioning.

---

## 6. Data Exchange Engine (TXT Import & 1:1 Excel Export)

To maximize interoperability with corporate spreadsheet workflows, the application standardizes on tab-delimited text (`.txt`) imports extracted directly from Excel, while preserving exact 1:1 OpenXML `.xlsx` exports.

### 6.1 Supported Import Formats (TXT Extracted from Excel)
The client-side parser (`src/lib/txtImport.js`) runs 100% offline and automatically recognizes:
1. **Equipment Inventory Master (`SPE_Equipments_example.txt`)**:
   - `Host Name` (Asset code), `Serial Number`, `Status`, `Issued Knox ID`, `Issued Date`.
   - Automatically maps statuses (`Issued` ➔ `Assigned`, `Broken` ➔ `Damaged`, `Available` ➔ `Available`).
2. **IT Equipment Loan List (`SPE_IT_Equipment_Loan_List_Example.txt`)**:
   - `Start Date`, `Pickup Date`, `End Date`, `Return Date`, `Laptop`, itemized accessories (`Adapter`, `Cable`, `Dongle`, `Keyboard`, `Mouse`, `Monitor`, `Ethernet cable`), and notes.
   - Accurately parses multiline quoted fields (e.g. `"Charging \r\nAdapter"`), BOM marks, and normalizes Excel null dates (`1/0/1900`).
   - Automatically correlates laptop asset codes with equipment holder records to ensure borrower identities remain consistent.
3. **Batch Multi-File Ingestion**:
   - Allows administrators to upload both files in tandem; the engine cross-references equipment serials and active loans before synchronizing to the shared Express/SQLite database via `/api/exchange/import` and updating the local client cache.

### 6.2 1:1 Reference Excel Exports
Export functionality continues to generate native OpenXML `.xlsx` workbooks:
- `SPE_IT_Equipment_Loan_List_YYYY-MM-DD.xlsx` with exact 1:1 column parity matching the corporate loan register.
- `SPE_Equipments_YYYY-MM-DD.xlsx` matching the equipment master structure.

### 6.3 Shared Database Snapshot & One-Click Revert Architecture
To safeguard corporate records against accidental overwrites or malformed text files during data imports, the system implements a dual-layer transactional snapshot and rollback mechanism:
1. **Server-Side Transactional Snapshot (`createSnapshot` & `import_backups`)**:
   - Prior to executing import mutations via `POST /api/exchange/import`, the Express exchange router automatically calls `createSnapshot()`, generating an immutable JSON snapshot of all current assets, loans, ownership histories, employees, departments, and locations, stamped with a unique snapshot ID (`snap-<timestamp>`) and stored in the SQLite `import_backups` table.
   - The import is executed within a strict database transaction (`BEGIN TRANSACTION ... COMMIT`). If an unhandled exception or parsing error occurs, the server rolls back (`ROLLBACK`) with zero data corruption.
   - An audit record is logged to `audit_logs` capturing the snapshot ID, number of imported assets, updated records, and loans.
2. **Client-Side Snapshot Buffering (`IMPORT_BACKUP_KEY`)**:
   - Concurrently, the frontend client caches a pre-import snapshot to `localStorage` under `IMPORT_BACKUP_KEY` via `saveImportBackup()`.
3. **One-Click Rollback (`POST /api/exchange/revert`)**:
   - When the operator clicks **"Revert last import"** on the Data Exchange view, the client calls `api.exchange.revert()`.
   - The Express server retrieves the latest snapshot from `import_backups`, clears working tables, restores all records and ownership histories transactionally (`BEGIN TRANSACTION ... COMMIT`), deletes the consumed snapshot, and logs the `REVERT_IMPORT` event to `audit_logs`.
   - The client simultaneously restores its local cache from `IMPORT_BACKUP_KEY` and broadcasts a toast notification, instantly reflecting the restored state across all connected intranet workstations.

---

## 7. User Interface Layout & Views

The frontend application provides eight core operational views accessed via the left navigation sidebar:

1. **Operations Dashboard (`/`)**:
   - High-level KPI stat cards (Total Fleet, Available for Deployment, In Active Custody, Under Maintenance/Repair, Overdue Loans).
   - Category distribution bar chart with count breakdowns.
   - Interactive quick-filtered asset view (Recently updated, Available, Assigned, Needs Attention).
2. **Asset Register (`/assets`)**:
   - Complete inventory data grid with multi-column filtering (Status, Category, Location, Search term across all fields).
   - Click and drag row selection with bulk status updates and bulk deletion.
   - Interactive holder badges: clicking an owner opens the **Change Ownership Modal** directly.
3. **Loans & Custody (`/loans`)**:
   - Active, Scheduled, Overdue, and Returned custody management.
   - One-click **"Confirm Pickup"** and **"Return Asset"** workflows.
   - Search across loan fields with selectable field and status filters.
   - Editable accessory checklist and supporting loan details during pickup and return.
4. **In & Out Calendar (`/calendar`)**:
   - Universal schedule calendar tracking hardware checkouts (Out / Departure) and returns (In / Return) across all enterprise personnel.
   - Encompasses all requester types, displaying both standard SPE Employees and mobile Business Travelers.
   - Multi-tier filtering: filter by Requester Type (`Business traveler` vs `SPE employee`), select an individual requester from a categorized dropdown, filter by flow direction (`Out` vs `In`), or search by keyword.
   - Interactive day detail modal with complete item cards, accessory checklists, and direct custody action buttons.
5. **Business Travelers (`/business-travelers`)**:
   - Dedicated mobile workforce custody and field deployment management (accessible via `/business-travelers` with automatic `/travelers` redirection).
   - **Exclusive Calendar View Mode**: Operators selecting **"Calendar View"** see solely the monthly schedule calendar (`TravelerCalendar.jsx`), omitting KPI stat cards and location panels for an uncluttered planning experience.
   - **"How Many They Are"**: Real-time KPI statistics tracking active in-field deployments, total distinct travelers, scheduled pickups, overdue loans, and active locations.
   - **"Where They Are"**: Interactive location distribution grid grouping travelers by deployment facility (Kokomo Plant, Regional Office, Detroit Center, Head Office) with one-click filtering.
   - **Full-Screen Full-Body Roster Mode**: 1-click toggle expanding the complete mobile workforce roster across the viewport with sticky column headers and Escape key exit.
   - **Mobile Workforce Roster**: Searchable, filterable table detailing traveler names, Knox IDs, deployed hardware/IP, assignment duration, and countdown badges.
   - **Integrated Workflows**: Direct Return confirmation returning hardware to IT department, trip editor, and new business traveler dispatch recording.
6. **Directory (`/directory`)**:
   - Personnel directory with Knox IDs, departments, and active equipment counts.
   - Department directory and rental facility locations.
7. **Data Exchange (`/exchange`)**:
   - Tab-delimited text (`.txt`) import extracted from Excel (`SPE_Equipments_example.txt` & `SPE_IT_Equipment_Loan_List_Example.txt`).
   - Interactive preview modal with pre-flight record validation and Merge vs Replace options.
   - Reference-format `.xlsx` OpenXML export maintaining 1:1 column parity.
   - Snapshot restore point management.
8. **Patch History & Release Notes (`PatchHistoryModal.jsx` & `PatchHistoryPage.jsx`)**:
   - In-app release notes viewer accessible via the TopBar version pill, the Sidebar footer, or the dedicated `/patch-history` and `/changelog` routes.
   - Pinned modal header and filter controls with internal single-scroll stream (`.patch-cards-stream`), preventing clipped headers and double scrollbars.
   - Per-version tabbed navigation, real-time keyword search, change type filtering (`All Types`, `Patches`, `Minor`, `Major`), and structured release highlights.

---

## 8. Non-Functional Guarantees

| Requirement | Implementation & Standard |
| :--- | :--- |
| **Air-Gap Compliance** | 100% offline. No telemetry, no external CSS/JS CDNs, no Google Fonts, no remote analytics. |
| **Performance** | Instantaneous search and filter response (< 50ms) via in-memory React state indexing and SQLite WAL indexing (`idx_assets_code`, `idx_loans_asset_code`, etc.). |
| **Compatibility** | Tested on Chromium (Edge, Chrome) and Firefox across Windows 10/11 enterprise workstations. |
| **Data Safety & Shared Persistence** | Centralized ACID transaction persistence via native SQLite (`node:sqlite`) in WAL mode with server-side rollback snapshots (`import_backups` table), foreign key enforcement, audit logging (`audit_logs`), and local browser cache resilience. |
| **Deployment & Orchestration** | Central intranet server (`npm start` or `npm run server` on `0.0.0.0:5000`) hosting both static SPA bundles (`dist/`) and shared SQLite database, or single-command local development (`npm run dev:all`). |

---

## 9. Version Control & History

- **v1.3.0** *(Loan Search, Flexible Custody Updates & Asset Multi-Selection)*:
   - Added field-selectable loan search and status filtering for assignee, Knox ID, asset, location, IP address, department, and note/purpose.
   - Added editable equipment checklist and supporting loan details during pickup and return, persisted through the loans API.
   - Added drag-to-select interaction in the asset register for multi-record batch operations.
   - Synchronized application metadata and release documentation to `v1.3.0`.
- **v1.2.2** *(Vite Proxy Network Stability & Full-Stack Development Orchestration)*:
  - Hardened Vite proxy routing by redirecting target from `http://localhost:5000` to explicit `http://127.0.0.1:5000`, resolving dual-stack IPv6 `::1` connection drops on Windows.
  - Implemented graceful HTTP 503 error interceptor in `vite.config.js` to handle backend downtime cleanly without terminal stack trace spam.
  - Added `concurrently` orchestration script (`npm run dev:all`) allowing developers to launch both backend API and Vite frontend servers in a single terminal session.
  - Synchronized documentation, system health endpoints, and release note datasets to `v1.2.2`.
- **v1.2.1** *(Exclusive Calendar Focus View, Frontend Patch History & Versioning Calibration)*:
  - Added exclusive Calendar View mode on `/business-travelers` hiding KPI cards and location breakdown blocks to display only the monthly schedule calendar.
  - Implemented in-app Patch History Modal (`PatchHistoryModal.jsx`) and dataset (`src/data/patchHistory.js`) triggered via TopBar, sticky bottom-left Sidebar footer pill (`v1.2.1 • Patch Notes`), and direct button in the Business Travelers header.
  - Made sidebar sticky (`position: sticky; top: 0; height: 100vh`) ensuring the bottom-left version info is permanently pinned in view on tall pages.
  - Resolved modal clipping, horizontal blowout, and card flex-shrink compression (`flex-shrink: 0; min-height: min-content`) ensuring patch history renders full release notes and scrolls smoothly without squishing.
  - Calibrated Semantic Versioning policy to restrained patch increments (`1.2.x`) for UI refinements, bug fixes, and documentation synchronizations.
  - Updated all technical and design documentation.
- **v1.2.0** *(TXT Import Extracted from Excel & 1:1 Excel Export)*:
  - Standardized on tab-delimited `.txt` import format for Equipment Inventory (`SPE_Equipments_example.txt`) and IT Loan Lists (`SPE_IT_Equipment_Loan_List_Example.txt`).
  - Added multiline quoted field parser and automatic header format detection (`src/lib/txtImport.js`).
  - Interactive import preview modal with Merge & Sync vs Full Replace modes.
  - Preserved 1:1 OpenXML `.xlsx` exports for both loans and equipment masters.
- **v1.1.1** *(Full Screen Roster Mode & Specific URL Routing)*:
  - Upgraded route from `/travelers` to specific `/business-travelers` with backward-compatible redirect.
  - Added 1-click Full Screen Roster mode (`roster-fullscreen`) with full-body viewport layout, sticky table headers, and Escape key dismissal.
  - Migrated component to `BusinessTravelersPage.jsx`.
- **v1.1.0** *(Business Travelers Management & Location Matrix)*:
  - Dedicated Business Travelers management view (`/travelers`) with real-time active field badge in the sidebar.
  - "How many they are": KPI counters for active in field, travel locations, scheduled trips, and total unique travelers.
  - "Where they are": Interactive location distribution matrix grouping travelers by destination/plant with one-click filtering.
  - Integrated mobile workforce roster with countdown badges, trip editing, and return-to-IT workflow.
- **v1.0.0** *(Official Production Baseline)*:
  - Production architecture in React 19 + Vite 6 + React Router 7.
  - StarPlus Energy corporate design language (Blue `#1449d6`, Navy `#0a2547`, Slate `#141519`, geometric SVG logo).
  - High-density compact topbar (~32px) and scroll-free 4-column compact modal forms.
  - States Version 1.0.0 state machine and continuous passive verification & sync engine.
  - Return to IT department workflow with unbroken ownership history.
  - Direct holder click-to-transfer modal with custom transfer reasons.
  - 100% offline air-gapped system font stack (zero external Google Fonts / CDNs).
  - 1:1 Excel column header preservation and rollback engine.
