# Inventory-Management-Software

Starplusenergy IT equipment Asset Index Management Software.

## Offline MVP

Open `index.html` directly in a browser. The application is self-contained and does not communicate with the internet. Asset data is stored in the browser's local storage on the current workstation.

The MVP includes:

- Asset register with search, status filters, create, and update workflows
- Dashboard with availability, assignment, issue, and category summaries
- Internal loan and return workflow
- Employee, department, and location directory
- Reference-format `.xlsx` loan-list export
- Reference-format `.xlsx` import using the `Laptop` column as the asset number, such as `SPE-1234`
- Excel import replaces the current local database and creates a one-click restore point

For a shared multi-user deployment, replace the browser storage adapter with the API and PostgreSQL architecture described in `Technical Specification.md`.
