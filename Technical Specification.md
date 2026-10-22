# StarPlus Energy Asset Management System — Technical Specification

| Metadata | Details |
| :--- | :--- |
| **Specification Version** | **v1.2.2** |
| **System Name** | StarPlus Energy Asset Management System (SPE-AMS) |
| **Specification Status** | Approved / Production Architecture |
| **Release Date** | October 2026 |
| **Target Runtime** | Corporate Intranet Server & Modern Browsers (Chromium 100+, Firefox 100+, Safari 16+) |
| **Source Repository** | [Inventory-Management-Software](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software) |
| **Related Documents** | [Software Design Document.md](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/Software%20Design%20Document.md), [PATCH_NOTES.md](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/PATCH_NOTES.md) |

---

## 1. Technology Stack Architecture

The system is engineered as a **Corporate Intranet Client-Server Application**, hosted centrally on an intranet server (`0.0.0.0:5000`) and accessible to multiple workstations across the corporate network, with centralized SQLite database persistence, background multi-host synchronization, and local browser cache resilience.

```mermaid
graph TD
    subgraph Corporate Network Workstations ["Corporate Network Workstations"]
        ClientA["Intranet Workstation A"]
        ClientB["Intranet Workstation B"]
    end

    subgraph CentralServerTier ["Central Intranet Server: Node.js / Express 5"]
        Server["Express Server on 0.0.0.0:5000"]
        SPAFallback["Static Client Dist & SPA Fallback"]
        APIRouter["REST API Routes /api/*"]
        SQLite[("Native SQLite DB inventory.db")]
    end

    ClientA <-->|HTTP / CORS LAN| Server
    ClientB <-->|HTTP / CORS LAN| Server
    Server --> SPAFallback
    Server --> APIRouter
    APIRouter --> SQLite
```

### 1.1 Stack Specification

| Tier | Technology | Version | Purpose & Rationale |
| :--- | :--- | :--- | :--- |
| **Server & HTTP** | **Node.js & Express** | `^5.3.0` | High-performance server binding to `0.0.0.0:5000` with LAN CORS and static SPA hosting. |
| **Database** | **SQLite (`node:sqlite`)** | Native Node.js | Centralized embedded database in WAL mode (`server/data/inventory.db`) with full transactional persistence. |
| **UI Library** | **React** | `^19.0.0` | Declarative UI rendering, modern hooks (`useCallback`, `useMemo`), optimistic mutations. |
| **DOM Renderer** | **React DOM** | `^19.0.0` | Client-side DOM mounting and tree reconciliation. |
| **Build Tooling** | **Vite** | `^6.0.0` | Sub-second cold starts, Hot Module Replacement (HMR), tree-shaken static production bundling. |
| **Vite Plugin** | **@vitejs/plugin-react** | `^4.3.0` | Fast Refresh transform pipeline. |
| **Client Routing** | **React Router** | `^7.0.0` | Lightweight declarative SPA routing (`BrowserRouter`, `Routes`, `Route`, `useNavigate`, `useLocation`). |
| **Styling** | **Vanilla CSS** | Standard CSS3 | CSS Custom Properties (`--blue: #1449d6`, `--ink: #141519`, etc.), responsive flexbox/grid. No Tailwind runtime or precompiler dependencies. |
| **Typography** | **System Font Stack** | Native OS | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...` ensuring clean native rendering without remote font downloads. |
| **Client Cache** | **LocalStorage Engine** | Web Storage API | Client-side snapshot cache for instantaneous initial paint and offline network disconnection fallback. |
| **Spreadsheet Engine** | **Native OpenXML** | Custom ES Module | Zero-dependency pure JavaScript `.xlsx` parser/generator utilizing raw ZIP/DEFLATE OpenXML structures. |

---

## 2. Component Architecture & Directory Structure

```
Inventory-Management-Software/
├── index.html                   # HTML entry point (clean system typography, zero CDNs)
├── package.json                 # Project manifest (v1.2.2, scripts, dependencies)
├── vite.config.js               # Vite 6 configuration with React plugin & loopback IPv4 proxy
├── server/                      # Shared Corporate Intranet Express & SQLite Backend
│   ├── index.js                 # Express 5 server binding to 0.0.0.0:5000, LAN CORS, SPA fallback
│   ├── config.js                # Server configuration (port, host, dbPath, admin & operator accounts)
│   ├── db/
│   │   └── database.js          # Native SQLite (node:sqlite) setup, WAL mode, schema, seed, audit & snapshots
│   ├── middleware/
│   │   └── auth.js              # Authentication & JWT/cookie token verification
│   └── routes/
│       ├── assets.js            # Hardware inventory CRUD, batch operations, ownership transfer
│       ├── loans.js             # Custody checkouts, pickups, returns, accessory tracking
│       ├── directory.js         # Employees, departments, locations, transfer reasons
│       ├── stats.js             # Fleet KPIs and audit logs
│       ├── exchange.js          # Full DB export, TXT import with rollback snapshot, and revert
│       └── auth.js              # User login, logout, profile, and user management
├── src/
│   ├── main.jsx                 # Application entry point, mounts AppShell inside BrowserRouter
│   ├── App.jsx                  # Top-level route switch & context providers
│   ├── index.css                # StarPlus Energy design system, tokens, and utility classes
│   ├── components/
│   │   ├── AppShell.jsx         # Global layout shell (Sidebar + Main panel + PatchHistoryModal + Toast)
│   │   ├── Sidebar.jsx          # Collapsible navigation, hexagon SVG brand mark, clickable version indicator
│   │   ├── TopBar.jsx           # High-density ~32px header, title, clickable version pill, offline indicator
│   │   ├── InOutCalendar.jsx    # Unified in/out schedule calendar with requester filtering & day inspection
│   │   ├── PatchHistoryModal.jsx# In-app release notes viewer per version with search & filtering
│   │   ├── TravelerCalendar.jsx # Monthly schedule calendar with location filtering & day inspection
│   │   ├── Modal.jsx            # Accessible overlay modal dialog with backdrop dismiss
│   │   ├── AssetTable.jsx       # Interactive data grid, batch checkboxes, click-to-transfer badges
│   │   ├── AssetForm.jsx        # Asset registration and editing modal form
│   │   ├── ChangeOwnerModal.jsx # Direct ownership transfer dialog with custom reasons
│   │   ├── LoanForm.jsx         # Internal loan checkout form with equipment checklist
│   │   ├── StatCard.jsx         # High-level KPI metric card with icon & status styling
│   │   ├── BarChart.jsx         # Category distribution chart
│   │   └── Toast.jsx            # Non-blocking feedback notification toast
│   ├── pages/
│   │   ├── OverviewPage.jsx     # Executive dashboard, KPIs, quick filters, category mix
│   │   ├── AssetsPage.jsx       # Hardware inventory register, multi-column search, batch operations
│   │   ├── LoansPage.jsx        # Device custody, checkout/return lifecycle, overdue tracking
│   │   ├── CalendarPage.jsx     # Dedicated In & Out Calendar with multi-tier requester filtering
│   │   ├── BusinessTravelersPage.jsx # Mobile workforce roster list, overdue triage, location matrix
│   │   ├── DirectoryPage.jsx    # Employees with Knox IDs, departments, facility locations
│   │   └── ExchangePage.jsx     # TXT import (extracted from Excel) & 1:1 Excel export (.xlsx)
│   ├── hooks/
│   │   ├── useDb.jsx            # Database context hook providing data access, sync & mutations
│   │   └── useToast.jsx         # Toast notification dispatch hook
│   ├── lib/
│   │   ├── api.js               # Enterprise REST API client (Fetch wrapper with Bearer token & cookies)
│   │   ├── assetExcel.js        # Equipment register column mapping & row serialization
│   │   ├── assetIntegrity.js    # States Version 1.0.0 state machine, passive sync, history engine
│   │   ├── constants.js         # APP_VERSION ('1.2.2'), status enums, Excel headers, default reasons
│   │   ├── db.js                # LocalStorage engine, import backup snapshots, transfer reasons cache
│   │   ├── txtImport.js         # Delimited text parser & format detector for TXT extracted from Excel
│   │   ├── utils.js             # Date formatters (ISO, readable), ID generators, sanitizers
│   │   └── xlsx.js              # Pure JavaScript OpenXML (.xlsx) builder and parser
│   └── data/
│       ├── patchHistory.js      # Structured release notes data per version (SemVer 2.0.0)
│       └── seed.js              # Initial seed database (assets, loans, employees, locations)
```

---

## 3. Data Schema & Models (Schema Version 1.0.0)

### 3.1 Asset Master Record (`Asset`)

```typescript
interface Asset {
  id: string;                      // UUID primary key (crypto.randomUUID())
  code: string;                    // Master Asset Code (e.g., "SPE-1001", "SPE-1002")
  name: string;                    // Display name (e.g., "ThinkPad T14s Gen 3")
  category: string;                // "Laptop" | "Desktop" | "Monitor" | "Peripherals"
  model: string;                   // Hardware model string
  serial: string;                  // Manufacturer serial number
  status: AssetStatus;             // "Available" | "Assigned" | "On loan" | "Damaged" | "Under repair" | "Retired"
  location: string;                // Facility / Room (e.g., "HQ - Storage Room 2B", "Kokomo Plant")
  owner: string;                   // Current holder name (Employee Name or "IT department")
  department: string;              // Assigned department (e.g., "Engineering", "Quality Control")
  condition: string;               // "New" | "Good" | "Fair" | "Needs Maintenance"
  notes: string;                   // General administrative notes
  issuedDate?: string;             // Date asset was issued to current owner
  updated: string;                 // ISO date string of last modification ("YYYY-MM-DD")
  ownershipHistory: OwnershipEntry[]; // Chronological audit trail
}
```

### 3.2 Ownership History Entry (`OwnershipEntry`)

```typescript
interface OwnershipEntry {
  id: string;                      // UUID primary key
  date: string;                    // Timestamp of event ("YYYY-MM-DD HH:mm:ss")
  previousOwner: string;           // Prior holder (e.g., "John Doe", "IT department", or "None")
  newOwner: string;                // Incoming holder (e.g., "Jane Smith" or "IT department")
  location?: string;               // Physical location at time of transfer
  department?: string;             // Department at time of transfer
  reason: string;                  // Standardized or custom transfer reason
  notes?: string;                  // Contextual handover notes
}
```

### 3.3 Internal Loan Record (`Loan`)

```typescript
interface Loan {
  id: string;                      // UUID primary key
  assetCode: string;               // Foreign reference to Asset.code ("SPE-XXXX")
  assignee: string;                // Borrower / Custodian employee name
  knoxId: string;                  // Corporate Knox identity (e.g., "s.connor", "j.smith")
  department: string;              // Borrower's department
  location: string;                // Checkout facility / rental location
  ip: string;                      // Assigned static or leased IP ("105.101.x.x")
  startDate: string;               // Agreement start date ("YYYY-MM-DD")
  pickupDate?: string;             // Date hardware was physically handed over
  endDate: string;                 // Scheduled return due date ("YYYY-MM-DD")
  returnDate?: string;             // Actual date hardware was returned to IT
  status: LoanStatus;              // "Scheduled" | "Active" | "Returned" | "Overdue"
  equipment: EquipmentChecklist;   // Itemized accessories
  others?: string;                 // Miscellaneous items
  note?: string;                   // Custody instructions
  isArchived?: boolean;            // Soft-archive flag for returned loans
}

interface EquipmentChecklist {
  Adapter: number;                 // Power adapter count
  Cable: number;                   // Power cable count
  Dongle: number;                  // USB-C / Display adapter count
  Keyboard: number;                // External keyboard count
  Mouse: number;                   // External mouse count
  Monitor: number;                 // External monitor count
  'Ethernet cable': number;        // RJ45 patch cable count
}
```

---

## 4. States Version 1.0.0 & State Machine Architecture

### 4.1 Asset States Taxonomy

```
+-------------------------------------------------------------------------+
|                        STATES VERSION 1.0.0                             |
+------------------+-----------------------+------------------------------+
| State Code       | Semantics             | Holder Constraint            |
+------------------+-----------------------+------------------------------+
| Available        | In fleet / unassigned | IT department (or empty)     |
| Assigned         | Dedicated allocation  | Named employee / department  |
| On loan          | Temporary checkout    | Active loan assignee         |
| Damaged          | Defective / offline   | IT department / Reporting    |
| Under repair     | Active maintenance    | IT department / Vendor       |
| Retired          | Decommissioned asset  | Decommissioned Archive       |
+------------------+-----------------------+------------------------------+
```

### 4.2 Passive Verification & Sync Service Algorithm

The application does not depend on manual user triggers to reconcile data consistency. Instead, integrity reconciliation executes across both architectural tiers:
- **Client Tier (`src/lib/assetIntegrity.js`)**: `reconcileAllAssets()` runs passively whenever the client mounts, mutates local state, regains window focus, or completes a 15-second background sync.
- **Server Tier (`server/db/database.js`)**: `reconcileAllAssetsInDb()` runs directly within the shared SQLite database during server boot, loan checkout/pickup, return processing, and data exchange imports (`/api/exchange/import`), writing normalized states directly to the database.

```mermaid
flowchart TD
    Start["Passive Sync Triggered"] --> Iterate["Iterate Through All Assets"]
    Iterate --> CheckLoan{"Asset has Active Loan?"}
    
    CheckLoan -- Yes (Picked up, unreturned) --> SetOnLoan["Set Status: On loan<br>Holder: Loan Assignee<br>Location: Loan Location"]
    CheckLoan -- No --> CheckCurrentStatus{"Current Status == On loan?"}
    
    CheckCurrentStatus -- Yes --> FreeFromLoan["Check if Asset has Employee Holder"]
    FreeFromLoan -- Has Employee Holder --> SetAssigned["Set Status: Assigned"]
    FreeFromLoan -- No Employee Holder --> SetAvailable["Set Status: Available<br>Holder: IT department"]
    
    CheckCurrentStatus -- No --> CheckReturnedLoan{"Asset Loan was Returned?"}
    CheckReturnedLoan -- Yes --> CheckHolder{"Holder is empty or pool?"}
    CheckHolder -- Yes --> NormIT["Set Holder: IT department<br>Set Status: Available"]
    CheckHolder -- No --> CheckHolderInvariant
    
    CheckReturnedLoan -- No --> CheckHolderInvariant{"Asset has Employee Holder<br>AND Status == Available?"}
    CheckHolderInvariant -- Yes --> FixAssigned["Enforce Status: Assigned"]
    CheckHolderInvariant -- No --> CheckAssignedWithoutHolder{"Status == Assigned<br>AND No Holder?"}
    CheckAssignedWithoutHolder -- Yes --> FixAvailable["Set Status: Available<br>Holder: IT department"]
    CheckAssignedWithoutHolder -- No --> NextAsset["Proceed to Next Asset"]
    
    SetOnLoan --> NextAsset
    SetAssigned --> NextAsset
    SetAvailable --> NextAsset
    NormIT --> NextAsset
    FixAssigned --> NextAsset
    FixAvailable --> NextAsset
    NextAsset --> Finish["Commit Reconciled State to Shared SQLite DB & Local Cache"]
```

### 4.3 Return Workflow Specification
When a loan is returned via `returnLoan(loanId)`:
1. `loan.returnDate` is stamped with the current date (`todayIso()`).
2. `loan.status` transitions to `'Returned'`.
3. The associated asset is retrieved:
   - `asset.owner` is set strictly to `'IT department'`.
   - `asset.department` is cleared (`''`).
   - `asset.status` transitions to `'Available'` (unless flagged `'Damaged'`).
   - An `ownershipHistory` entry is created:
     ```javascript
     createOwnershipEntry({
       previousOwner: loan.assignee,
       newOwner: 'IT department',
       reason: 'Returned to IT department',
       notes: `Loan completed. Returned on ${todayIso()}`
     })
     ```
4. The passive verification service validates that no other active loans exist for this asset code and commits the transaction.

---

## 5. Direct Ownership Transfer Engine

The Assets table allows instantaneous ownership reassignment by clicking directly on the holder badge:

1. **Trigger**: User clicks `<button className="badge-clickable">` showing the current holder name.
2. **Modal Presentation**: `ChangeOwnerModal.jsx` mounts with target asset metadata pre-populated.
3. **Data Inputs**:
   - **New Owner**: Typeahead or manual input of employee name or `"IT department"`.
   - **Department**: Optional department affiliation.
   - **Effective Date**: Defaults to current ISO timestamp.
   - **Transfer Reason**: Standard dropdown selection or custom text.
   - **Notes**: Operational commentary.
4. **Execution (`changeAssetOwner(assetId, transferData)`)**:
   - Updates `asset.owner` and `asset.department`.
   - If `newOwner === 'IT department'`, enforces `status: 'Available'`.
   - If `newOwner !== 'IT department'`, enforces `status: 'Assigned'`.
   - Appends audit entry to `asset.ownershipHistory` retaining `previousOwner`.
   - Persists state to the shared SQLite database via `api.assets.transfer` (recording audit entry in `ownership_history` and logging to `audit_logs`), updates local storage cache, and broadcasts toast notification.

---

## 6. Native OpenXML Spreadsheet Engine (`lib/xlsx.js`)

To guarantee 100% offline air-gapped capability without external npm libraries or network CDNs, the application bundles a native OpenXML engine.

### 6.1 Package Architecture
The engine constructs valid ZIP-compressed OpenXML packages containing:
- `[Content_Types].xml`: Declares workbook and sheet content types.
- `_rels/.rels`: Package relationship graph.
- `xl/workbook.xml`: Sheet registry and namespaces.
- `xl/_rels/workbook.xml.rels`: Worksheet target mappings.
- `xl/worksheets/sheet1.xml`: Cell table data with row/column coordinate references.
- `xl/styles.xml`: StarPlus Energy enterprise styling (Corporate Blue headers, borders, font definitions).
- `xl/sharedStrings.xml`: Deduplicated string lookup table.

### 6.2 1:1 Schema Mapping Table

| Export Column | XML Cell Type | Source Property | Fallback / Formatting |
| :--- | :--- | :--- | :--- |
| `no` | Number | `index + 1` | `1, 2, 3...` |
| `Name` | String | `loan.assignee` | `""` |
| `Knox ID` | String | `loan.knoxId` | `""` |
| `Rental Location` | String | `asset.location \|\| loan.location` | `""` |
| `IP` | String | `loan.ip` | `""` |
| `Start Date` | String | `loan.startDate` | `YYYY-MM-DD` |
| `Pickup Date` | String | `loan.pickupDate` | `YYYY-MM-DD` |
| `End Date` | String | `loan.endDate` | `YYYY-MM-DD` |
| `Return Date` | String | `loan.returnDate` | `YYYY-MM-DD` |
| `Laptop` | String | `loan.assetCode` | `SPE-XXXX` |
| `Charging Adapter` | Number | `loan.equipment.Adapter` | Default `1` |
| `Charging Cable` | Number | `loan.equipment.Cable` | Default `1` |
| `Dongle` | Number | `loan.equipment.Dongle` | Default `0` |
| `Keyboard` | Number | `loan.equipment.Keyboard` | Default `0` |
| `Mouse` | Number | `loan.equipment.Mouse` | Default `0` |
| `Monitor` | Number | `loan.equipment.Monitor` | Default `0` |
| `Ethernet cable` | Number | `loan.equipment['Ethernet cable']` | Default `0` |
| `others` | String | `loan.others` | `""` |
| `Note` | String | `loan.note` | `""` |

### 6.3 Shared Data Exchange & Transactional Backup Engine (`server/routes/exchange.js`)

The system implements a centralized data exchange engine backed by transactional SQLite operations and audit logging:

1. **Full Database Export (`GET /api/exchange/export`)**:
   - Queries and packages all master records (`assets`, `ownership_history`, `loans`, `employees`, `departments`, `locations`, `transfer_reasons`) into a structured JSON payload.
   - Powers the client's automated multi-host synchronization (15-second polling interval and window focus events in `useDb.jsx`).

2. **Transactional Ingestion with Automated Snapshot (`POST /api/exchange/import`)**:
   - Accepts parsed asset and loan datasets extracted from `.txt` or `.xlsx` files.
   - Before executing writes, triggers `createSnapshot()` to serialize the current database state into the `import_backups` table with a unique timestamped identifier (`snap-<timestamp>`).
   - Executes mutations inside a SQLite transaction (`BEGIN TRANSACTION ... COMMIT`):
     - Inserts or updates assets based on code parity.
     - Automatically creates and records initial or overwrite history entries in `ownership_history`.
     - Upserts loans with JSON accessory checklists and soft-archive flags.
   - Automatically invokes `reconcileAllAssetsInDb()` immediately after commit to validate and enforce all States v1.0.0 rules.
   - Records an `IMPORT_DATA` event in `audit_logs` tracking snapshot ID, imported counts, and actor identity. If an error is encountered, the transaction triggers an automatic `ROLLBACK`.

3. **One-Click Transactional Revert (`POST /api/exchange/revert`)**:
   - Locates the latest restorable snapshot from `import_backups`.
   - Executes an atomic rollback within `BEGIN TRANSACTION ... COMMIT`: wipes working tables (`ownership_history`, `assets`, `loans`, `employees`, `departments`, `locations`) and re-populates them with the exact snapshot dataset.
   - Deletes the consumed snapshot entry and records a `REVERT_IMPORT` audit event.
   - Accompanied by client-side local cache restoration (`IMPORT_BACKUP_KEY`) to ensure instant consistency across all intranet workstations.

---

## 7. Performance & Build Metrics

Production build execution via `npm run build`:
- **Modules Transformed**: 81 modules.
- **HTML Bundle**: `dist/index.html` (~0.92 kB).
- **CSS Bundle**: `dist/assets/index-[hash].css` (~72.0 kB, ~14.0 kB gzip).
- **JS Bundle**: `dist/assets/index-[hash].js` (~515.5 kB, ~148.3 kB gzip) — includes full OpenXML parser, DEFLATE compressor, client API client, calendar engine, seed database, and React 19 runtime.
- **Build Duration**: ~1.2 seconds.
- **Initial Paint**: < 100ms in modern browsers.

---

## 8. Patch History Architecture & Layout Guarantees

### 8.1 Access Pattern
The patch history system is accessible via:
1. **Interactive Global Modal (`PatchHistoryModal.jsx`)**:
   - Triggered from any page via the TopBar `v1.2.2 • Patch Notes` button or the sticky bottom-left Sidebar footer pill (`v1.2.2 • Patch Notes`), keeping the main sidebar menu clean and uncluttered.
   - Direct button in the Business Travelers view header (`view-header-actions`), ensuring instant visibility alongside view mode toggles.
   - Pinned header and filter controls with internal scrolling stream (`.patch-cards-stream`).
   - Anchored from the top (`margin: 12px auto !important; align-items: flex-start; z-index: 100000;`) to prevent header clipping in all viewport heights.
2. **Dedicated Full-Page Route (`PatchHistoryPage.jsx`)**:
   - Routed at `/patch-history` and `/changelog` for direct deep-linking when needed.

### 8.2 Layout Overflow & Obscurity Prevention
- **Sticky Sidebar Positioning**: `.sidebar` is styled with `position: sticky; top: 0; height: 100vh; max-height: 100vh; flex-shrink: 0; overflow-y: auto;`. This ensures that on tall pages (such as Business Travelers), the bottom-left version info (`v1.2.2 • Patch Notes`) remains permanently pinned in the viewport without scrolling out of sight.
- **Card Flex-Shrink Prevention**: `.patch-card`, `.patch-card-header`, and `.patch-card-body` are configured with `flex-shrink: 0 !important; min-height: min-content !important;`. This prevents CSS flexbox from squishing cards into flat horizontal lines when multiple versions are expanded, allowing the cards to render at full natural height with an active vertical scrollbar on `.patch-cards-stream`.
- **Container Constraints**: `.main-content` is styled with `max-width: calc(100vw - 252px); overflow-x: hidden; min-width: 0;` to ensure wide tabular or calendar content never expands the viewport horizontally.
- **Component Horizontal Scrollers**: `TravelerCalendar` and tables are wrapped in containers with `overflow-x: auto; max-width: 100%;`, preserving the visibility of `.top-actions` and TopBar version pills regardless of display resolution.
- **Exclusive Calendar View**: On `/business-travelers`, activating Calendar View cleanly hides KPI stat cards, location breakdown lists, overdue blocks, and roster tables, ensuring the schedule calendar receives 100% of the focus area.
