# StarPlus Energy Asset Management System (v1.10.0)

> **High-reliability IT equipment asset index and custody management portal.**  
> Built for StarPlus Energy operations deployed on a corporate intranet server, accessible by workstations across the company network with centralized SQLite database persistence, tab-delimited TXT data import (extracted from Excel), 1:1 Excel XLSX export interoperability, and real-time state synchronization.

---

## Overview

The **StarPlus Energy Asset Management System (SPE-AMS)** serves as the central operational index for corporate IT hardware, laptops, peripherals, and device loans. The system is engineered to run on a **corporate intranet web server**, binding to all network interfaces (`0.0.0.0:5000`) so staff across the corporate network can access the central portal from their workstations with zero external internet dependencies, remote fonts, or telemetry.

### Core Highlights
- **Shared Workflow Components**: Create/edit, transfer, pickup and return windows reuse common controls, equipment metadata and form builders. See the shared-implementation map in [Software Design Document.md](Software%20Design%20Document.md#31-shared-ui-and-workflow-ownership).
- **Corporate Intranet Multi-Host Network Architecture**: Hosted centrally on the intranet server and accessible from any workstation or host on the corporate network (`http://<server-ip>:5000`). Zero external cloud dependencies, no remote CDN scripts, and zero telemetry. All fonts use the native operating system typography stack.
- **Centralized SQLite Database**: Uses Node.js's native high-performance SQLite engine (`node:sqlite`) in WAL mode (`server/data/inventory.db`). All client workstations share the exact same synchronized database in real time with client-side offline cache resilience.
- **Corporate Brand Identity**: Built in accordance with StarPlus Energy design standards featuring Corporate Blue (`#1449d6`), Deep Navy (`#0a2547`), Slate (`#141519`), and the geometric SVG hexagon brand mark.
- **Frontend Patch History & Versioning Governance**: In-app Patch History modal displaying full release notes per version, accessible directly via the TopBar version pill, the sticky bottom-left Sidebar footer pill, and the Business Travelers header button. Adheres to Semantic Versioning (SemVer 2.0.0), with patch increments for refinements and minor increments for additive features.
- **Dedicated Calendar-Only Focus View**: Operators can toggle the Business Travelers module into an exclusive Calendar View that omits KPI stat cards and location panels to display solely the monthly schedule calendar.
- **Tab-Delimited TXT Import Engine**: Fast, robust client-side parser specifically designed for text files extracted from Excel. Equipment registers use `Asset Number`, `Asset Type`, `Serial Number`, `Purchase Date`, `Status`, `Issued Knox ID`, `Issued Date`, `Department`, `Location`, and `Notes`; loan lists retain their workbook columns. Supports multiline quoted headers, BOM stripping, date normalization (handling Excel serials and `1/0/1900` nulls), and auto-detecting file signatures.
- **Excel OpenXML Export**: Pure client-side `.xlsx` generator exporting the equipment register in its 10-column SPE format and maintaining 19-column parity with corporate loan spreadsheets, backed by automated pre-import restore snapshots.
- **States Version 1.0.0 State Engine**: Strict operational states (`Available`, `Assigned`, `On loan`, `Damaged`, `Under repair`, `Retired`) with invariant validation.
- **Passive Verification & Sync Service**: Background synchronization engine that automatically reconciles loan checkouts and returns with the asset inventory register without manual user intervention.
- **Return to IT Department Workflow**: Returned assets use owner **IT Department** and default location **IT Office**, with status **Available** unless maintenance or retirement rules apply. Prior custody remains in the audit history.
- **Direct Click-to-Transfer**: Clicking an asset holder's badge in the table opens the **Change Ownership Modal** directly, eliminating redundant table action columns.

---

## Technology Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Backend & Web Server** | **Node.js 22+ & Express 5** | High-performance HTTP API & static SPA server |
| **Database** | **SQLite (`node:sqlite`)** | Embedded persistent database in WAL mode (`server/data/inventory.db`) |
| **Network Architecture** | **Corporate Intranet (`0.0.0.0:5000`)** | Multi-host intranet connectivity with dynamic CORS for LAN subnets |
| **Frontend Framework** | **React 19** (`^19.0.0`) | Modern component model with concurrent rendering & optimistic UI |
| **Bundler & Dev Server** | **Vite 6** (`^6.0.0`) | Lightning-fast HMR and optimized production build |
| **Routing** | **React Router 7** (`^7.0.0`) | Client-side Single Page Application routing with Express SPA fallback |
| **Styling** | **Vanilla CSS** | Design tokens via CSS variables; zero runtime CSS-in-JS or Tailwind |
| **Typography** | **System Font Stack** | Native OS fonts (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`) |
| **Client Cache** | **Browser Storage** | LocalStorage backup cache for fast load and offline resilience |
| **Data Exchange Engine** | **Delimited Text Parser & OpenXML Generator** | In-browser Excel TXT extraction parser and zero-dependency `.xlsx` exporter |

---

## Application Views

1. **Operations Dashboard (`/`)**: Fleet KPIs (Available, Assigned, On loan, Issues, Overdue), category mix breakdown, and quick filtered lists.
2. **Asset Register (`/assets`)**: Hardware inventory with multi-column filtering, drag-to-select rows, bulk status updates, batch deletion, and direct click-to-transfer ownership badges. Supports TXT and XLSX imports.
3. **Assignments & Pickups (`/loans`)**: Manage employee laptop assignments and business-traveler equipment checkouts together. Knox ID is the only required field when adding a schedule; assignee name and PC asset number are optional. Check Picked up to reveal the pickup date and record a handover directly. Search laptops, MES PCs, and PCs in the PC field, and registered monitors in the monitor field. The table displays PC asset numbers and supports search, status filters, a shared pickup-readiness toggle, a sortable Location column in every tab, return details, and an Unreturned section for partial returns. Pickup and return windows group PC/monitor asset searches with plain accessory quantity inputs; Others / Peripherals remains text.
4. **In & Out Calendar (`/calendar`)**: Unified schedule tracking hardware checkouts (Out) and returns (In) across all user types (SPE employees and business travelers). Features real-time filtering by requester type (`Business traveler` vs `SPE employee`), individual requester selection, flow direction (`Out / Checkout` vs `In / Return`), location, keyword search, and a shared **Hide returned** checkbox that updates events, counts and day details.
5. **Business Travelers (`/business-travelers`)**: Dedicated mobile workforce custody; features focused **Calendar View**, **Roster List** with 1-click full-screen mode, **Overdue Only** urgent triage, location distribution breakdown, and direct return workflows.
6. **Asset & Organization Directory (`/directory`)**: Manage asset categories, statuses, departments, and locations. Add custom statuses here or from asset forms. Search and sort directory entries, and manage them with Select, Edit and bulk deletion. Rename in-use locations to update linked asset and assignment/loan records; an existing destination name merges the locations. Deletion is restricted to unused values. Card headings stay pinned while lists scroll.
7. **Data Exchange (`/exchange`)**: Tab-delimited TXT import, reference-format `.xlsx` export, interactive preview, and saved restore point history with restoration of a selected snapshot. Loan imports share matching rules with the preview and client merge to update existing records even when import IDs change.
8. **Patch History & Changelog (`/patch-history` & `/changelog`)**: Dedicated release notes view with version filtering, keyword search, type toggles, and detailed per-version changelogs. Also accessible anywhere via the TopBar version button and bottom-left Sidebar footer.

---

### Asset and custody workflows

In **Record assignment or loan**, the **Picked up** checkbox sits beside Due date. Keep it unchecked for a schedule; checking it reveals the pickup date. Scheduled full-detail editing omits return time, and return actions require a completed pickup. The In & Out day view uses full-width rows and removes picked-up or completed records from outgoing schedules, with counts and open-day details refreshed from current records.

Click a Directory status, category, department, or location to open its matching asset list. Search the list and open an asset to edit its location or other details; saving returns to the refreshed list. Use Select to rename or delete unused directory values. Asset number edits persist and update linked custody and ownership-history references together; duplicate numbers are rejected and failed saves keep the form open.

All asset types include optional **Purchase date** and **Warranty expiration date**. Enter and view these dates as **DD-MM-YYYY**; for example, `07-10-2023` means 7 October 2023. Dates are stored internally as ISO calendar dates. The warranty date must be on or after the purchase date when both are supplied. Dates persist through editing, database backup/restore, and equipment import/export; exports append a warranty column when a recorded value needs it. Restart the backend after upgrading to add the warranty database column automatically.

Returned devices move to **IT Department**. The existing **Under repair → service center** location rule remains in effect, and the original rental location remains on the custody record.

Clearing an existing asset's **Current holder** and saving records a return to **IT Department** in Ownership History, including the previous holder and timestamp. The linked pickup records the returned device so synchronization keeps it in IT custody. Other devices and accessories remain outstanding until checked in.

**Available** means IT custody: the current holder is **IT Department**, including after single or bulk status changes. Startup repairs existing Available records with blank or stale holders and fills missing ownership history once. When an earlier return date is unknown, the added entry identifies the custody reconciliation time rather than claiming a historical return date.

**Assignments & Pickups** brings employee laptop assignments and business-traveler equipment checkouts together. Both use the same Scheduled pickup list; picked-up employee equipment appears under **Assigned**, while business-traveler checkouts appear under **Loans**. Return records capture the laptop asset number actually received, including missing or substituted laptops. The existing `/loans` address continues to open this page.

Employee and traveler requests without a pickup remain in the Assignments & Pickups **Scheduled** tab. Its columns begin with Action, Pickup readiness, and Borrower type, followed by asset and assignee details; pickup, return, and status columns are omitted. Expanded Scheduled details and scheduled full editing omit return time. Overdue also omits the return-date column and expanded return time. Rental locations offer Directory suggestions and accept typed values. Requested PC and monitor flags can be edited in full details and confirmed alongside actual asset numbers during pickup.

For an outstanding picked-up loan, expand its row and choose **Transfer equipment**. Select all items or individual items and quantities, then enter the new owner's Knox ID and optional name. Transfers create a linked custody record and ownership history for registered devices. Remaining items stay with the original owner; a fully transferred source is archived with a **Transferred** label. Transfers do not record a physical return.

Choose **Recipient / pickup schedule** to fulfill an existing schedule by transfer. Review the loaded recipient and dates before confirming. Business travelers require valid start and end dates, with the end on or after the start. The selected schedule receives the actual transferred equipment and pickup timestamp, clears its readiness flag, and moves out of Scheduled with **Pickup by transfer** shown beside the pickup time. Planned quantities are replaced by the actual handover; a different preselected PC or monitor must be corrected on the schedule first.

### Import matching and cleanup

Repeat loan imports match existing IDs first, then asset and Knox ID/name with start, pickup, or return dates. If only one side lacks start and pickup dates, an asset/person match is used only when there is a single candidate. Blank imported start dates remain blank.

Imports remove exact duplicate records. On server startup, cleanup first saves a database restore point, clears impossible start dates later than the return date on records without a pickup date, and removes exact duplicates. Records with differing details remain available for review. Restart the server to apply startup cleanup; its backup appears in Data Exchange restore point history.

## Development & Server Deployment

### Prerequisites
- Node.js (v22+ recommended for native `node:sqlite`)
- Modern web browser across corporate workstations (Chrome, Edge, Firefox, Safari)

### Production Server Deployment (Corporate Intranet)

```bash
# 1. Install dependencies
npm install

# 2. Build production frontend bundle into dist/
npm run build

# 3. Start central intranet server (hosts web portal & API)
npm start
# or: npm run server
```

The server binds to `0.0.0.0:5000` and displays:
- **Local Access**: `http://localhost:5000`
- **Corporate Intranet URL**: `http://<server-ip>:5000` (e.g. `http://10.37.41.33:5000`)
- **System Health & DB Stats**: `http://<server-ip>:5000/api/health`

Any workstation on the corporate network can navigate to `http://<server-ip>:5000` to access the portal. All changes are immediately saved to the centralized SQLite database on the server.

### Local Development Mode

**Option A — Single Command (Recommended):**
```bash
npm run dev:all
```
*Runs both the backend API server (port 5000) and the Vite dev server (port 5173) concurrently in one terminal.*

**Option B — Two Terminals:**
```bash
# Terminal 1: Backend server with hot watch (port 5000)
npm run server:dev

# Terminal 2: Vite dev server with HMR (port 5173)
npm run dev
```

---

### Validation and Shared Code

Run `npm test` for regression checks and `npm run build` for the production frontend. Database tests use in-memory SQLite.

Shared functions and controls own repeated business rules, import mappings, loan fields, directory panels, calendars, and server serializers. See **Technical Specification → 2.1 Shared Modules and Change Ownership** for the module map and asset location rules.

## Documentation

- **Release source of truth**: `package.json` owns the application version and `src/data/patchHistory.js` owns release notes. After changing either, run `npm run docs:sync` to update generated patch notes and documentation version metadata.
- **[Software Design Document (SDD)](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/Software%20Design%20Document.md)**: Product scope, business rules, corporate palette, state transitions, and user workflows.
- **[Technical Specification](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/Technical%20Specification.md)**: Component architecture, data schemas, passive reconciliation algorithm, and OpenXML mapping.
- **[Patch Notes](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/PATCH_NOTES.md)**: Comprehensive release history and changelog.

Business Travelers includes a **Follow-up** tab for overdue equipment and partial returns. **Copy Knox IDs** copies unique recipients as `knoxid_1;knoxid_2;...;` for email follow-up; the list is also selectable manually. Its calendar distinguishes **Incoming**, **Returning**, **Returned**, and **Overdue**, and both calendar day dialogs expose the shared pickup-readiness toggle. Transfers into a schedule replace its planned equipment with the actual transferred items. Open asset forms refresh Current holder after ownership changes, including returns to IT Department at IT Office.

Ownership changes are saved when **Confirm Ownership Change** succeeds; closing the parent asset window without saving does not undo the transfer. Previous device custody is checked in while missing accessories remain outstanding. Pending calendar rows show only the Ready / Not ready control without redundant Scheduled or Pickup readiness text.

Calendar day dialogs use compact, content-sized rows with wrapping for long values and smaller screens. Background refreshes discard older snapshots when a newer local database change has occurred, so a confirmed ownership transfer stays visible without saving the parent asset form.

Changing an asset to **Under repair** returns custody to **IT Department**, clears the employee department, and sets Location to **service center**. Saving a single or bulk change records the return and checks in that device from active custody; missing accessories remain outstanding.

A scheduled monitor request does not require a monitor at actual pickup. Leave its asset field blank if none can be provided; the request remains recorded, and no monitor is assigned.

Both Business Travelers and In & Out calendars show **Picked up** events on the actual pickup date. Open a date to see the shared pickup row with recipient, pickup time, PC, monitor and location. **Hide returned** is also available inside each day dialog and stays synchronized with the calendar toolbar, rows and counts.
