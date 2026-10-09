# StarPlus Energy Asset Management System (v1.2.1)

> **High-reliability, air-gapped IT equipment asset index and custody management portal.**  
> Built for StarPlus Energy operations with 100% offline guarantees, tab-delimited TXT data import (extracted from Excel), 1:1 Excel XLSX export interoperability, and deterministic state management.

---

## Overview

The **StarPlus Energy Asset Management System (SPE-AMS)** serves as the central operational index for corporate IT hardware, laptops, peripherals, and device loans. The system is engineered to run completely offline without external network connectivity, cloud APIs, remote fonts, or telemetry.

### Core Highlights
- **100% Air-Gapped Offline Operation**: Completely self-contained. No external CDN scripts, no remote Google Fonts, and zero telemetry. All fonts use the native operating system typography stack.
- **Corporate Brand Identity**: Built in accordance with StarPlus Energy design standards featuring Corporate Blue (`#1449d6`), Deep Navy (`#0a2547`), Slate (`#141519`), and the geometric SVG hexagon brand mark.
- **Frontend Patch History & Versioning Governance**: In-app Patch History modal displaying full release notes per version, accessible directly via the TopBar version pill, the sticky bottom-left Sidebar footer pill (`v1.2.1 • Patch Notes`), and the Business Travelers header button. Adheres strictly to Semantic Versioning (SemVer 2.0.0) with paced patch increments (`1.2.x`).
- **Dedicated Calendar-Only Focus View**: Operators can toggle the Business Travelers module into an exclusive Calendar View that omits KPI stat cards and location panels to display solely the monthly schedule calendar.
- **Tab-Delimited TXT Import Engine**: Fast, robust client-side parser specifically designed for text files extracted from Excel (`SPE_Equipments_example.txt` & `SPE_IT_Equipment_Loan_List_Example.txt`). Supports multiline quoted headers, BOM stripping, date normalization (handling Excel serials and `1/0/1900` nulls), and auto-detecting file signatures.
- **1:1 Excel OpenXML Export Parity**: Pure client-side `.xlsx` generator maintaining exact 19-column parity with corporate loan spreadsheets (`SPE_IT_Equipment_Loan_List.xlsx`) and equipment registers (`SPE_Equipments.xlsx`), backed by automated pre-import restore snapshots.
- **States Version 1.0.0 State Engine**: Strict operational states (`Available`, `Assigned`, `On loan`, `Damaged`, `Under repair`, `Retired`) with invariant validation.
- **Passive Verification & Sync Service**: Background synchronization engine that automatically reconciles loan checkouts and returns with the asset inventory register without manual user intervention.
- **Return to IT Department Workflow**: Assets returned from custody automatically default to holder **IT department** with status **Available**, maintaining an unbroken audit lineage of prior borrowers.
- **Direct Click-to-Transfer**: Clicking an asset holder's badge in the table opens the **Change Ownership Modal** directly, eliminating redundant table action columns.

---

## Technology Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend Framework** | **React 19** (`^19.0.0`) | Modern component model with concurrent rendering |
| **Bundler & Dev Server** | **Vite 6** (`^6.0.0`) | Lightning-fast HMR and optimized production build |
| **Routing** | **React Router 7** (`^7.0.0`) | Client-side Single Page Application routing |
| **Styling** | **Vanilla CSS** | Design tokens via CSS variables; zero runtime CSS-in-JS or Tailwind |
| **Typography** | **System Font Stack** | Native OS fonts (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`) |
| **Local Storage** | **Browser Storage** | LocalStorage / IndexedDB with automatic backup snapshots |
| **Data Exchange Engine** | **Delimited Text Parser & OpenXML Generator** | In-browser Excel TXT extraction parser and zero-dependency `.xlsx` exporter |

---

## Application Views

1. **Operations Dashboard (`/`)**: Fleet KPIs (Available, Assigned, On loan, Issues, Overdue), category mix breakdown, and quick filtered lists.
2. **Asset Register (`/assets`)**: Hardware inventory with multi-column filtering, bulk status updates, batch deletion, and direct click-to-transfer ownership badges. Supports TXT and XLSX imports.
3. **Loans & Custody (`/loans`)**: Checkouts, pickups, accessory checklists (Adapter, Cable, Dongle, Keyboard, Mouse, Monitor, Ethernet cable), and return processing.
4. **Business Travelers (`/business-travelers`)**: Dedicated mobile workforce custody; features focused **Calendar View** (renders only the monthly schedule calendar), **Roster List** with 1-click full-screen mode, **Overdue Only** urgent triage, location distribution breakdown, and direct return workflows.
5. **Directory (`/directory`)**: Personnel directory with Knox IDs, department rosters, and rental facility locations.
6. **Data Exchange (`/exchange`)**: Tab-delimited TXT file import extracted from Excel, 1:1 reference-format `.xlsx` export, interactive pre-flight preview modal, and one-click database rollback.
7. **Patch History & Changelog (`/patch-history` & `/changelog`)**: Dedicated release notes view with version filtering, keyword search, type toggles, and detailed per-version changelogs. Also accessible anywhere via the TopBar `v1.2.1 • Patch Notes` button and bottom-left Sidebar footer.

---

## Development & Usage

### Prerequisites
- Node.js (v18+ recommended)
- Modern web browser (Chrome, Edge, Firefox, Safari)

### Commands

```bash
# Install dependencies
npm install

# Start local development server with Hot Module Replacement (HMR)
npm run dev

# Build production bundle for offline air-gapped distribution
npm run build

# Preview production build locally
npm run preview
```

The production output in `dist/` can be served by any static web server or opened directly on intranet workstations without an active internet connection.

---

## Documentation

- **[Software Design Document (SDD)](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/Software%20Design%20Document.md)**: Product scope, business rules, corporate palette, state transitions, and user workflows.
- **[Technical Specification](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/Technical%20Specification.md)**: Component architecture, data schemas, passive reconciliation algorithm, and OpenXML mapping.
- **[Patch Notes](file:///c:/Users/Developer/Documents/workspace/Inventory-Management-Software/PATCH_NOTES.md)**: Comprehensive release history and changelog.
