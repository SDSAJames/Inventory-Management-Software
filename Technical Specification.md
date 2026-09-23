# Asset Index Management System Technical Specification

This document defines the technical implementation of the Asset Index Management System. Product scope, business rules, functional requirements, and user workflows are defined in [Software Design Document.md](Software%20Design%20Document.md).

## 1. Recommended Stack

A simple and scalable stack for this business case is:

- Frontend: React
- Backend: Node.js with Express or ASP.NET Core
- Database: PostgreSQL
- Authentication: JWT or session-based authentication
- API: REST API
- Deployment: local server deployment

## 2. Application Architecture

The application should use the following layers:

- Presentation layer: dashboard, forms, list pages, and detail pages
- Application layer: business rules and workflow logic
- Data layer: PostgreSQL database with relational tables
- Authentication layer: login and authorization

The asset remains the central domain object. Assignment, loan, return, and history operations should update the asset and its related records through the application layer so that business rules are applied consistently.

## 3. Data Model

The database should use normalized relational tables for asset master records, employees, departments, categories, locations, loans, and ownership history.

### 3.1 Assets

- id
- asset_code
- name
- category_id
- model
- serial_no
- status
- current_location_id
- current_owner_type
- current_owner_id
- condition
- notes
- created_at
- updated_at

### 3.2 AssetCategories

- id
- name

### 3.3 Employees

- id
- employee_code
- name
- department_id
- position

### 3.4 Departments

- id
- name

### 3.5 Locations

- id
- name

### 3.6 OwnershipHistory

- id
- asset_id
- from_owner_type
- from_owner_id
- to_owner_type
- to_owner_id
- effective_from
- effective_to
- transfer_reason
- notes

### 3.7 InternalLoans

- id
- asset_id
- employee_id
- department_id
- loan_date
- due_date
- returned_date
- status
- purpose
- notes

### 3.8 Database Constraints and Indexes

- Enforce unique asset codes.
- Restrict asset status to the values defined in the SDD.
- Require a valid asset reference for loans and ownership history entries.
- Prevent an asset from having conflicting active assignments or loans.
- Add indexes for asset code, employee, department, status, location, and loan dates.
- Preserve asset master records through archival or retention rules instead of physical deletion.

## 4. API Surface

The initial REST API should provide endpoints for:

- creating an asset
- updating an asset
- listing and searching assets
- retrieving asset details
- assigning an asset
- creating an internal loan
- returning an asset
- retrieving ownership history
- managing categories, employees, departments, and locations
- downloading an Excel import template
- validating and importing assets from an Excel workbook
- exporting filtered assets, loans, and ownership history to an Excel workbook

API authorization must follow the roles and permissions defined in the SDD.

### 4.1 Excel Import and Export

Excel processing should be implemented in a dedicated application service rather than in controllers. The service must:

- accept offline Excel-compatible `.xls`, CSV, and tab-separated files and enforce a configured file-size limit
- validate the workbook name, required sheet, header names, data types, required values, duplicate asset codes, and reference values
- support a dry-run validation step that does not modify the database
- return row number, field name, error code, and human-readable message for each rejected row
- create or update assets by `asset_code` only after explicit confirmation
- apply valid changes transactionally and preserve existing ownership, loan, and audit history rules
- generate exports from authorized queries using stable column names and ISO-compatible date values
- protect exported workbook values from formula interpretation and exclude sensitive fields that the requesting role cannot view

Suggested endpoints are:

- `GET /api/assets/import-template`
- `POST /api/assets/import/validate`
- `POST /api/assets/import/commit`
- `GET /api/assets/export?format=xls`
- `GET /api/loans/export?format=xls`
- `GET /api/ownership-history/export?format=xls`

For the standalone offline MVP, the browser implementation uses an Excel-compatible `.xls` HTML table and CSV/TSV import so it has no CDN, internet, or package download dependency. A later server deployment may replace this adapter with a native `.xlsx` library without changing the import contract.

The import validation result should include an import token or equivalent server-side reference so that the commit step applies the exact validated workbook and cannot silently validate one file and commit another.

## 5. Implementation Plan

### Phase 1: Requirements and Data Design

- confirm all asset fields
- define employee, department, and location models
- finalize status values and ownership rules
- finalize the internal loan process

### Phase 2: Database Setup

- create tables for Asset, AssetCategory, Employee, Department, Location, OwnershipHistory, and InternalLoan
- create indexes and constraints described in this specification

### Phase 3: Core API Development

- implement asset creation, update, listing, and detail retrieval
- implement assignment, internal loan, return, and ownership history operations
- implement role-based authorization

### Phase 4: User Interface

Develop screens for:

- asset dashboard
- asset list
- asset detail page
- assignment form
- loan form
- return form
- employee and department management

### Phase 5: Reporting and Monitoring

- asset summary dashboard
- overdue loan report
- asset status report
- lost or damaged asset report
- Excel export for authorized reports

### Phase 6: Excel Data Exchange

- define and version the Excel import template
- implement workbook validation and dry-run feedback
- implement transactional import commit and import audit records
- implement filtered Excel exports for assets, loans, and ownership history

### Phase 7: Testing and Deployment

- unit tests for asset logic
- integration tests for assignment and return flows
- import tests for valid rows, invalid references, duplicate asset codes, partial failures, and unauthorized uploads
- export tests for filters, permissions, dates, and formula-safe cell values
- role-based access validation
- production deployment and training

## 6. Technical Acceptance Criteria

- Asset searches meet the SDD performance target under normal usage.
- Dashboard queries meet the SDD load-time target under normal usage.
- Assignment and return operations update the asset, active loan, and history consistently.
- Unauthorized users cannot edit asset records.
- Status changes and ownership changes are traceable.
- Authorized users can validate and import a compliant workbook without bypassing asset business rules.
- Invalid import rows are rejected with row-level errors and do not modify existing records.
- Excel exports contain only authorized, filtered data and can be opened by standard spreadsheet software.
