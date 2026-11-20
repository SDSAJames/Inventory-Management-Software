# StarPlus Energy Asset Management System (v1.24.12)

> **High-reliability IT equipment asset index and custody management portal.**  
> Built for StarPlus Energy operations deployed on a corporate intranet server, accessible by workstations across the company network with centralized SQLite database persistence, tab-delimited TXT data import (extracted from Excel), 1:1 Excel XLSX export interoperability, and real-time state synchronization.

---

## Overview

The **StarPlus Energy Asset Management System (SPE-AMS)** serves as the central operational index for corporate IT hardware, laptops, peripherals, and device loans. The system is engineered to run on a **corporate intranet web server**, binding to all network interfaces (`0.0.0.0:5000`) so staff across the corporate network can access the central portal from their workstations with zero external internet dependencies, remote fonts, or telemetry.

### Core Highlights
- **Overview dashboard**: Category and location diagrams appear above the full-width Recently updated table. On wide screens, the charts share a row with a compact three-column summary grid on the right, with two columns on phones. Cards and charts adapt to smaller screens; quick actions remain below the diagrams.
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
2. **Asset Register (`/assets`)**: Non-MES hardware inventory with sortable column headers (asset number ascending by default), multi-column filtering, drag-to-select rows, bulk status updates, admin-only asset deletion, and direct click-to-transfer ownership badges. Supports TXT and XLSX imports.
3. **Assignments & Pickups (`/loans`)**: Manage employee laptop assignments and business-traveler equipment checkouts together. Knox ID is the only required field when adding a schedule; assignee name and PC asset number are optional. Check Picked up to reveal the pickup date and record a handover directly. Search laptops, MES PCs, and PCs in the PC field, and registered monitors in the monitor field. The table displays PC asset numbers and supports search, status filters, a shared pickup-readiness toggle, a sortable Location column in every tab, return details, and an Unreturned section for partial returns. Return forms let operators select returned devices and accessories with checkboxes, enter received asset numbers, and adjust accessory quantities. A partial return splits the received items into a completed record and the remaining items into a linked active or overdue record. Device selection and asset inputs align on one row; accessory names have room beside compact count fields.
4. **In & Out Calendar (`/calendar`)**: Unified schedule tracking hardware checkouts (Out) and returns (In) across all user types (SPE employees and business travelers). Features real-time filtering by requester type (`Business traveler` vs `SPE employee`), individual requester selection, flow direction (`Out / Checkout` vs `In / Return`), location, keyword search, and shared **Hide picked up** (on by default) and **Hide returned** switches that update events, counts and day details.
5. **Business Travelers (`/business-travelers`)**: Dedicated mobile workforce custody; features focused **Calendar View**, **Roster List** with 1-click full-screen mode, **Overdue Only** urgent triage with a copyable `knox_a;knox_b;knox_c;` list and outstanding equipment labels (including registered asset numbers), location distribution breakdown, and direct return workflows.
6. **Asset & Organization Directory (`/directory`)**: Manage asset categories, statuses, departments, and locations. Add custom statuses here or from asset forms. Search and sort directory entries, and manage them with Select, Edit and bulk deletion. Rename in-use locations to update linked asset and assignment/loan records; an existing destination name merges the locations. Deletion is restricted to unused values. Card headings stay pinned while lists scroll.
7. **Data Exchange (`/exchange`)**: Tab-delimited TXT import, reference-format `.xlsx` export and interactive preview. Restore point history is managed separately in Backup & Restore. Loan imports share matching rules with the preview and client merge to update existing records even when import IDs change.
8. **Patch History & Changelog (`/patch-history` & `/changelog`)**: Dedicated release notes view with version filtering, keyword search, type toggles, and detailed per-version changelogs. Also accessible anywhere via the TopBar version button and bottom-left Sidebar footer.
9. **Backup & Restore (`/backups`, admin only)**: Create a manual inventory restore point, refresh the history, or restore a selected snapshot after confirmation. A compact contained table shows up to 50 restore points, newest first. Restoring inventory does not change user accounts.
10. **User Management (`/users`, admin only)**: Search, create, edit and delete accounts, assign Admin/Operator roles, and reset passwords. New and reset passwords require at least six characters.
11. **My Profile (`/profile`)**: Click your name in the top bar to view your account. Username and Knox ID are one account identity, shown as a single **Knox ID** field. Admins can edit their Knox ID, name and job title; operators see read-only account details and can change only their own password, using the current password and a new password of at least six characters.

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

For an outstanding picked-up loan, expand its row and choose **Transfer equipment**. Select all items or individual items and quantities, then enter the new owner's Knox ID, optional name and destination location. The location defaults to the source loan or selected pickup schedule and can be chosen from Directory suggestions or typed. Transfers create a linked recipient custody record and ownership history for registered devices. A partial transfer also creates an archived **Transferred** record containing only the moved items, while the original owner's loan remains active with its remaining equipment. The records retain transfer links so each asset can be traced across owners. A fully transferred source is archived with a **Transferred** label. Transfers do not record a physical return.

Choose **Recipient / pickup schedule** to fulfill an existing schedule by transfer. Review the loaded recipient and dates before confirming. Business travelers require valid start and end dates, with the end on or after the start. The selected schedule receives the actual transferred equipment and pickup timestamp, clears its readiness flag, and moves out of Scheduled with **Pickup by transfer** shown beside the pickup time. Planned quantities are replaced by the actual handover; a different preselected PC or monitor must be corrected on the schedule first.

### Import matching and cleanup

Repeat loan imports match existing IDs first, then asset and Knox ID/name with start, pickup, or return dates. If only one side lacks start and pickup dates, an asset/person match is used only when there is a single candidate. Blank imported start dates remain blank.

Imports remove exact duplicate records. On server startup, cleanup first saves a database restore point, clears impossible start dates later than the return date on records without a pickup date, and removes exact duplicates. Records with differing details remain available for review. Restart the server to apply startup cleanup; its backup appears in the admin Backup & Restore history.

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

**Accounts and permissions:** Asset deletion, including bulk deletion in Assets and MES, requires a signed-in admin account. Operators retain asset editing, import and export. Backup & Restore and User Management also require a real saved admin account, even when `AUTH_OPTIONAL` permits other intranet operations. Initial environment accounts are provisioned only once on a new database; existing accounts are adopted, and later profile, role, password and deletion changes survive restart. Environment settings do not overwrite managed accounts. Account forms show one Knox ID rather than separate username and Knox ID inputs. An explicit identity edit updates both stored identifiers; existing differing identifiers remain unchanged during password-only saves. The top bar opens My Profile from your name; the former Corporate Intranet badge has been removed.

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

Both Business Travelers and In & Out calendars show **Picked up** events on the actual pickup date. Open a date to see the shared pickup row with recipient, pickup time, PC, monitor and location. **Hide picked up** is enabled by default in both calendars and is available beside **Hide returned** in the toolbar and each day dialog. The controls stay synchronized with visible events and counts. Showing or hiding pickup events leaves upcoming returns and overdue entries available.

**Build and data preservation:** `npm run build` generates frontend code in `dist`; it does not import TXT files or replace the SQLite database. Keep the existing database and its configured `DB_PATH` when deploying code. Reloads never upload browser cache automatically, and server restarts do not repopulate sample assets, loans or employees. Missing browser caches start empty; a successful server snapshot is authoritative even when it contains no records. Import data explicitly through Data Exchange; admins restore inventory through Backup & Restore.

Business Travelers **Reminder** lists picked-up business-traveler equipment due today through the next **7 calendar days**, nearest due date first. Copy unique recipients as `knoxidA;knoxidB;` with **Copy Knox IDs**, or select the displayed text manually. Follow-up and Reminder share the same contact-list UI and hide Location distribution. **Overdue Only** lists which equipment items are still out; click a data-column header to change the sort. It starts with the earliest due date.

Accessory counts use one shared normalization rule across create, edit, pickup, return and transfer: `01` becomes `1`, and `00` becomes `0`. The same rule applies when saving through the API or importing records. PC and monitor asset numbers retain leading zeros; Others / Peripherals stays text. Existing stored records are not bulk-rewritten during upgrades.

Date and date-time fields limit the year to four digits, up to 9999, across asset and custody forms. Existing date limits and optional-field clearing still apply. Purchase and warranty fields keep their DD-MM-YYYY format.

Pending pickup schedules preserve a blank Rental location through saving, editing and calendar display; they do not inherit IT Office or the asset location. Scheduled due-date fields prefill the current year while leaving month/day blank. The due date remains empty in saved data until all three parts form a valid date; the calendar picker is also available.

Scheduled due-date segments reserve enough width to display the full current year and MM/DD placeholders in compact loan forms. Year-only drafts still save no due date.

When transferring equipment to a pickup schedule, search by all or part of either the **Knox ID or assignee name**. Search ignores case; the selected schedule remains selected when the search changes.

**Correcting returned quantities:** In Assignments & Pickups, open a returned record and choose **Edit full details** to correct its returned PC/monitor and accessory quantities. This section appears only after a return has been recorded. Saving recalculates Complete or Partial return status and refreshes the Unreturned list; it corrects the historical return without moving equipment from its current holder.

Editing a completed transfer sender preserves **Transferred** status and does not move equipment back from the receiver. Explicitly clearing an incorrect PC reference remains saved. If a correction after partial transfer leaves no equipment outstanding, the sender closes as Transferred. Loan edits wait for database confirmation; failed saves remain open for retry.

Opening or switching menu pages starts at the top. Changing a tab or search within the same page keeps its current scroll position.

**Revert last change** in the top bar undoes the most recent successful inventory save made after this update. Review the action, author and time, then confirm. Linked assets, custody records and directory changes are restored together. One undo is available; failed/no-op saves leave it intact, and undo consumes it. Operators can undo their own latest change when it does not remove assets; undoing asset creation or another change that removes assets requires a saved admin account. Admins can undo the latest shared change. A newer or externally changed database state requires reviewing the latest action again. Import restore history, security accounts and audit logs remain separate. Restart the backend after upgrading to enable the undo checkpoint table and endpoints.

**MES equipment register:** Data Exchange accepts `data/SPE_MES_Equipments_example.txt` and matching `.xlsx` files. Its 11 columns are Asset Number, Asset Type, Serial Number, Purchase Date, Status, Issued Knox ID, Issued Name, Issued Date, Department, Location and Notes. Issued Name is preserved separately from the Knox ID. Use **Export XLSX MES Equipments** to download MES assets in this layout as `SPE_MES_Equipments_YYYY-MM-DD.xlsx`. MES assets are identified by their MES asset type or MES-prefixed register number; MES Monitor is available in monitor searches. Restart the backend once after upgrading to add the optional issue metadata columns. Existing records are preserved, and importing remains an explicit action.

Unsaved asset typing stays in place during background refresh. Untouched fields can refresh from the database, while saved ownership transfers update custody fields without clearing unrelated notes or serial edits. Opening a different asset starts its own draft.

**MES (`/mes`):** Manage MES PCs, monitors and other MES equipment separately from the standard Assets page. Both registers share the same records, editing, ownership and bulk actions. Imports must match the selected register; MES exports use the eleven-column MES Excel format. Editable department and location dropdowns show the full Directory list on focus or reopening, support typing to filter, and scroll through longer lists.

**Category menu:** Assets and MES show **All** and category buttons beside the selected-row count, populated from the current Directory category pool and categories present in that register. When the menu does not fit on one line, the buttons wrap onto another line. Names are sorted ascending and matched without case or outer-space differences; Laptop variants retain their own categories. Each button shows its register-wide count before search or status filters, including zero for unused Directory categories. Choose a category to combine it with search and status filtering; changing category clears row selection and returns to page one. Category filtering also applies to export and MES Location counts.

On the MES page, switch between **Assets** and **Location**. Each occupied location shows its total assets and counts by equipment type. Click its row to browse and edit the equipment there. Category, search and status filters apply to the counts and lists.

Asset add/edit dialogs, including MES, use a searchable Department dropdown. Type to filter Directory entries, choose with the mouse or arrow keys and Enter, or enter a custom department. Reopen the dropdown to see all choices; + Add still creates a Directory entry.

**Paged asset lists:** Overview, Assets and MES show 15 rows per page by default. Choose 10, 15, 20 or 30 with **Rows per page** at the top right, then use First, Previous, Next or Last below the records. Search, filters and sorting apply to the full matching list. MES Location rows and expanded asset lists also use the selected page size; location totals include every matching asset. Exports include all matching assets.

The top left shows the selected-row count. Use checkboxes, drag across rows, or Shift-click a range on the current page. Select-all affects only that page; selections on other pages remain. Use Clear selection to deselect everything.

Start a drag directly on a row checkbox and release over another checkbox to select the range. Starting on an already selected checkbox clears the dragged range. A normal click still toggles only that row.

**Directory field spacing:** Rental location and Department remove leading and trailing spaces when leaving the field and saving. Spaces between words remain unchanged. The same behavior applies to shared forms, pickup, transfers, bulk asset changes and imports; a blank scheduled location stays blank.

**Department links:** Saving a department on an asset, assignment/pickup record or employee automatically registers it in Directory. Dropdown choices refresh from the same saved data. Departments referenced by historical assignment/pickup records remain In use and show their record count, even after equipment returns. Restart the backend after upgrading to register missing departments from existing history and enable automatic database linking; history itself is preserved.

The Assets and MES registers, including expanded MES location asset lists, display Asset number, Category, Status, Current holder, Department and Location, in that order. Department supports sorting and search; Modification date is hidden in these views.

**Overview updates:** Asset mix combines parenthesized Laptop variants (including Laptop(others) and Laptop(vendor A)) under Laptop without changing their saved categories. The asset list shows the latest actual change, before/after values, and its saved local date/time through seconds. Older records without this metadata are marked as details or time not recorded. Restart the backend after upgrading to enable automatic change recording; existing history is preserved.

**Contractor borrowers:** Choose Contractor in assignment/loan creation, editing or transfer. Contractors have due dates, overdue handling and On loan equipment custody like business travelers. A schedule still changes inventory only after pickup. Contractor transfers require valid start and end dates. In & Out Calendar includes a separate Contractor filter and counts. Contractor remains distinct from Employee and Business traveler; the Business Travelers page retains its traveler scope. Existing loan spreadsheet exports use Contractor in the Business Traveler column for contractor records, while 1/0 still represent traveler/employee.

**Recent assignment updates and editors:** Overview shows the newest asset or linked assignment/pickup change, including borrower-type edits such as Business traveler → Contractor, its saved time, and **Changed by** (signed-in name and Knox ID/username). Earlier records without an editor show Not recorded. Changes without a recorded time, including legacy date-only values, display no date and follow dated records in the default recent list. Automatic reconciliation and restore do not stamp today onto old records.

Employee custody stays **Assigned** through editing, return reverts and reconciliation; business travelers and contractors use **On loan**. Overview also shows an **Asset locations** diagram with counts and percentages alongside Asset mix. Assignments & Pickups defaults to **Pickup date descending** in Assigned and Loans, **End date ascending** in Overdue, **Return date descending** in Returned, and **Start date ascending** in the other tabs. Switching tabs restores that tab's default sort. Undated rows remain last; headers still allow manual sorting. Restart the backend once after upgrading to enable assignment change tracking and editor capture for subsequent saves.

**Responsive Overview:** Recent-update tables scroll horizontally inside their own panel. Asset mix and the location diagram stay within the page; below 1200px the panels stack. Phone layouts use a compact navigation header, and page/account actions wrap to fit.

**Overview counts:** Separate cards show Total assets, Available now, Assigned assets, Loaned assets, Broken assets and Under repair. Asset cards filter the full-width table. Overdue loans and Unreturned records show separate record counts and open the matching Assignments & Pickups tab, including records containing only accessories. Partial returns remain separate from overdue loans.

**Current business travelers:** Overview, the sidebar badge and Business Travelers use the same count of distinct people currently holding equipment. It includes picked-up active/overdue loans and partial returns with outstanding items, including accessories. Multiple records for one Knox ID count once, ignoring case and outer spaces; a real name is used only when Knox ID is absent. Schedules, full returns, completed transfers, employees and contractors are excluded. This people count is separate from loan and unreturned record totals.

**Interactive asset diagrams:** Overview shows both Asset mix and Asset locations as diagrams. Hover a segment or legend entry to highlight it and see the count and percentage; keyboard focus and Enter/Space offer the same details. Both charts share the same interaction behavior. Asset locations shows up to five legend entries initially; choose **Show more** to see all locations or **Show less** to fold the list again. The diagram and totals always include every location.

**IT custody and storage:** An asset can be held by IT Department while located in IT Storage room or another Directory location. Changing that location persists through saving, synchronization and restart, including Damaged and Retired equipment. A real return still defaults to IT Office; Under repair still requires service center.
