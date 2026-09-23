# Asset Index Management System Software Design Document

This document defines the business requirements, scope, workflows, and product-level design for the Asset Index Management System. Implementation architecture, database schema, and delivery sequencing are defined in [Technical Specification.md](Technical%20Specification.md).

## 1. Document Purpose
This document defines the software requirements for an asset management system based on the sample workbook.

The system is designed around one core business rule:

- Each asset is treated as a master record.
- The asset is tracked over time as it changes ownership and location.
- There is no purchase, supplier, or cost tracking.
- Approval fields are not required for internal loan operations.

---

## 2. Business Objective
The objective is to manage a company asset inventory as a central asset index, with complete visibility into:

- which assets exist
- where each asset is located
- who currently owns or holds each asset
- which employee or department currently has it assigned
- loan history and return status
- asset condition and availability

This system replaces manual spreadsheet tracking and enables better control over company-owned assets.

---

## 3. Business Rules

### 3.1 Asset as Master Record
Each asset has a unique identity and remains in the system even when reassigned, returned, or repaired.

### 3.2 Internal Loan
An internal loan is created when:
- an employee or department borrows an asset inside the same company
- no charge is applied
- the asset remains company-owned

### 3.3 External Rental
External rental is not part of the initial scope unless required later. It is a separate use case and should not be mixed with internal loan tracking.

### 3.4 Ownership History
Every transfer or assignment of an asset must be recorded historically so the system can answer:
- who had the asset before
- who has it now
- when it was transferred

### 3.5 No Procurement Data
The initial system does not store:
- purchase date
- purchase cost
- supplier
- vendor
- procurement record

---

## 4. Scope

### In Scope
- Asset registration
- Asset category management
- Employee and department management
- Location tracking
- Asset assignment and ownership history
- Internal loan workflow
- Asset return workflow
- Asset status tracking
- Search and filtering
- Dashboard summary
- Basic audit/history tracking
- Excel import and export

---

## 5. User Roles

### 5.1 Admin
- manages all assets
- creates categories, departments, and locations
- creates and updates employee records
- manages asset assignment and status

### 5.2 Asset Manager
- adds and updates asset record
- assigns assets to employees or departments
- records loan and return events
- views asset history

---

## 6. Functional Requirements

### 6.1 Asset Management
The system shall allow users to:
- create a new asset
- update asset information
- mark asset as available, assigned, damaged, under repair, or retired
- search assets by asset number, category, location, or status
- view an asset detail page with current owner and history

### 6.2 Ownership Tracking
The system shall:
- store current owner information
- automatically create ownership history entries on each transfer
- allow viewing of complete asset history
- preserve the timeline of who held each asset and when

### 6.3 Internal Loan Management
The system shall allow users to:
- create a loan record for an employee or department
- select an asset and assign it to a borrower
- define loan date and optional return due date
- update loan status to active, returned, overdue, or cancelled
- record the return date when the asset is returned

### 6.4 Return Process
The system shall:
- update asset status after return
- release the asset from the employee or department assignment
- record the return in the history
- keep the asset available for reassignment

### 6.5 Status Tracking
Each asset must have a status such as:
- available
- assigned
- on loan
- damaged
- under repair
- retired

### 6.6 Dashboard
The dashboard shall show:
- total number of assets
- available assets
- assigned assets
- overdue loans
- damaged assets
- assets by category

### 6.7 Excel Import and Export
The system shall allow authorized users to:
- download an Excel import template containing the supported asset fields and required-field guidance
- upload an Excel workbook to create new asset records or update existing records by unique asset code
- validate the workbook before applying changes, including required fields, valid status values, referenced categories, locations, employees, and departments
- receive a row-level validation summary showing successful rows, rejected rows, and actionable error messages
- import valid rows only after the user confirms the validation results; rejected rows must not change existing data
- export filtered asset lists, asset details, loans, and ownership history to an Excel workbook
- export data using human-readable names while retaining asset codes and dates needed for reconciliation

Excel imports and exports must follow the same role permissions, business rules, audit requirements, and history rules as the web interface. Importing an asset update must not overwrite ownership or loan history without creating the corresponding business event through the normal workflow.

---

## 7. Non-Functional Requirements

### 7.1 Performance
- asset search should respond within 2 seconds for standard queries
- dashboard should load within 3 seconds under normal usage

### 7.2 Security
- user login with role-based access control
- unauthorized users cannot edit asset records
- every status change should be traceable

### 7.3 Reliability
- system must preserve asset history accurately
- no asset record should be deleted from the master list without a retention or archival process

### 7.4 Usability
- simple menu structure
- filters available on major pages
- clear asset status labels

---

## 8. Business Workflow

### 8.1 Add New Asset
1. User creates a new asset record.
2. System assigns a unique asset code.
3. Asset is marked as available.
4. Asset is linked to a category and location.

### 8.2 Assign Asset to Employee or Department
1. User selects the asset.
2. User chooses employee or department as the assignee.
3. System updates current owner field.
4. System creates a new record in OwnershipHistory.
5. Asset status becomes assigned or on loan.

### 8.3 Internal Loan
1. User creates an InternalLoan entry.
2. Asset is linked to employee/department.
3. Loan date is captured.
4. Due date may be set optionally.
5. The asset status becomes on loan or assigned.

### 8.4 Return Asset
1. User marks the loan as returned.
2. Returned date is captured.
3. Asset is set to available.
4. Current owner status is cleared or reassigned.
5. Ownership history is updated.

### 8.5 Import Assets from Excel
1. Authorized user downloads the current import template.
2. User uploads a completed workbook.
3. System validates the workbook structure and each row without changing data.
4. System displays valid and rejected row counts with row-level errors.
5. User confirms the import.
6. System creates or updates valid asset records in a transaction and records the import in the audit history.

---

## 9. Example User Flows

### 9.1 Asset Registration
- User enters asset code, category, model, serial number, and location.
- Asset is created in master record.
- Asset status is set to available.

### 9.2 Assigning a Laptop to an Employee
- User selects asset
- User selects employee
- System updates current owner
- System inserts ownership history record
- Asset status changes to assigned

### 9.3 Internal Loan by Employee
- User records internal loan
- Loan is created with employee id and asset id
- Asset is considered on loan internally
- When returned, system marks the asset as available again

---

## 10. Key Design Decision
The most important design decision is this:

The asset is the primary object. Everything else revolves around it.

That means:
- the system should not center on purchase records
- it should center on asset identity, assignment, and change history
- internal loan is a separate workflow from external rental

---

## 11. Recommended MVP
The first version should include only:
- asset master
- employee and department
- location
- internal loan tracking
- asset status
- ownership history
- dashboard and search
- Excel import and export

This gives a practical working system with the minimum complexity and directly supports the business case described by the workbook.

---

## 12. Deliverables
The project should deliver:
- working asset management web application
- asset dashboard
- employee/department assignment management
- internal loan workflow
- return and status tracking
- complete ownership history
- reporting pages
- Excel import template, validation, and export capability

---

## 13. Conclusion
This software should be built as an asset-centered inventory and assignment system, not a purchasing or supplier system. The core value is asset visibility, ownership tracking, and internal loan control.
