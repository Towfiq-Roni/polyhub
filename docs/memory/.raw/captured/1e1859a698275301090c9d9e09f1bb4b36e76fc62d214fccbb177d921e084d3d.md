# Small Company Management System — Project Overview

## 1. Purpose

Build a small-scale internal company management system that connects:

- Clients and sales opportunities
- Projects
- Milestones and deliverables
- Internal teams and team members
- External Business Development & Sales (BDS) partners
- Company finances
- Project income and costs
- Team-member and BDS payments
- Receivables and payables
- User access and detailed permissions

The system should provide one consistent operational and financial view of the company without becoming a full ERP.

---

## 2. Core Principles

### 2.1 Finance is ledger-driven

Do not manually maintain a company balance in multiple places.

Every actual money movement is entered as a financial transaction. The current balance is calculated from the ledger.

```text
Opening Balance
+ Money Received
- Money Disbursed
+/- Adjustments / Transfers
= Current Balance
```

### 2.2 Work status and payment status are separate

A milestone can be completed while its client payment is pending.

```text
Work Status
Pending -> In Progress -> Completed

Payment Status
Not Due -> Pending -> Partially Paid -> Paid
```

Payment status must never control whether internal team members can start the next milestone.

### 2.3 Every milestone can be started independently of payment

A milestone becomes available according to its project sequence/workflow, but **payment completion never blocks the next milestone**.

Example:

```text
Milestone 1
    ↓
Completed
    ↓
Payment Pending
    ↓
Milestone 2 can start
```

This allows the internal team to continue working even when a client has not yet paid a previous milestone.

### 2.4 Projects are milestone-driven

A project does not need a primary completion percentage for the first version.

Project progress is represented through ordered milestones and their work/payment states.

### 2.5 Team management is organizational, not project-role based

The system tracks:

- Teams
- Team members
- Team membership
- Project assignment

A team member does **not** need a separate `Role on Project` field.

Their organization-level role is controlled centrally by the Super Admin.

### 2.6 BDS partners are external

BDS partners are people outside the organization who help bring business.

They are not internal team members and do not belong to internal teams.

The system primarily tracks:

- Their leads/projects
- Their agreed compensation
- Total paid
- Outstanding amount
- Payment history

### 2.7 All payments are manual

There is no automatic payment gateway, bank integration, or automated disbursement in the initial system.

Every payment is entered manually by an authorized user.

For every payment, capture at minimum:

- Amount
- Date
- Transaction ID / TRX ID
- Payment method/account
- Note
- Related party/project/milestone where applicable

---

# 3. High-Level Modules

```text
Company Management System
│
├── Dashboard
├── CRM / Sales
│   ├── Clients
│   ├── Leads
│   ├── Opportunities
│   └── Follow-ups
│
├── Projects
│   ├── Projects
│   ├── Milestones
│   └── Deliverables
│
├── Organization
│   ├── Teams
│   ├── Team Members
│   └── Project Assignments
│
├── BDS Partners
│   ├── Partners
│   ├── Lead / Project Attribution
│   └── Partner Payments
│
├── Finance
│   ├── Accounts
│   ├── Transactions
│   ├── Receivables
│   ├── Payables
│   ├── Project Costs
│   ├── Team Payments
│   └── Reports
│
└── Administration
    ├── Users
    ├── Roles
    ├── Permissions
    └── Audit Logs
```

---

# 4. Dashboard

The dashboard is the company's operational and financial overview.

## 4.1 Financial summary

Display:

- Current available balance
- Total income received
- Total expenses/disbursements
- Total receivable
- Total payable
- Total paid to team members
- Total paid to BDS partners
- Total project costs
- Current-period net cash flow

Example:

```text
Available Balance       ৳850,000
Receivable              ৳420,000
Payable                 ৳180,000
Income This Month       ৳650,000
Disbursement This Month ৳420,000
Net Cash Flow            ৳230,000
```

## 4.2 Operational summary

Display:

- Active projects
- Current milestones
- Completed milestones awaiting payment
- Payment-overdue milestones
- Upcoming milestone deadlines
- Open leads/opportunities
- Team members currently assigned to projects

## 4.3 Attention items

Show items such as:

- Completed milestone with payment pending
- Overdue client payment
- Milestone due soon
- Deliverable awaiting approval
- Team member with outstanding payable
- BDS partner with outstanding payable

---

# 5. CRM / Sales

The CRM remains intentionally small and focused on generating business that can become projects.

## 5.1 Clients

```text
Client
├── ID
├── Name
├── Company Name (optional)
├── Phone
├── Email
├── Address
├── Notes
├── Status
├── Created By
├── Created At
├── Updated By
└── Updated At
```

Statuses:

```text
Active
Inactive
Archived
```

## 5.2 Leads

```text
Lead
├── ID
├── Name
├── Company
├── Contact Information
├── Source
├── Assigned User
├── BDS Partner (optional)
├── Status
├── Notes
├── Created By
└── Created / Updated At
```

Suggested statuses:

```text
New -> Contacted -> Qualified -> Converted / Lost
```

## 5.3 Opportunities

```text
Opportunity
├── ID
├── Client / Prospect
├── Title
├── Estimated Value
├── Expected Close Date
├── Assigned User
├── BDS Partner (optional)
├── Stage
├── Notes
└── Created / Updated At
```

Suggested stages:

```text
Qualified
-> Proposal Sent
-> Negotiation
-> Won
-> Lost
```

## 5.4 Conversion to project

When an opportunity is won:

```text
Opportunity Won
      ↓
Create / Select Client
      ↓
Create Project
      ↓
Carry forward commercial information
```

The relationship between the opportunity and resulting project should be preserved.

---

# 6. Projects

Projects are the primary operational unit.

## 6.1 Project fields

```text
Project
├── ID
├── Project Code
├── Name
├── Client
├── Description
├── Project Owner / Manager (optional)
├── Start Date
├── Expected End Date
├── Actual End Date
├── Status
├── Contract Value
├── Created By
├── Created At
├── Updated By
└── Updated At
```

Suggested statuses:

```text
Draft
Planning
Active
On Hold
Completed
Cancelled
```

## 6.2 Project overview

A project page should show:

- Client
- Project status
- Contract value
- Amount received
- Amount currently due
- Amount not yet due
- Total project costs
- BDS payable, when applicable
- Milestones
- Team members assigned
- Deliverables
- Recent financial activity

---

# 7. Milestones

Milestones are the main mechanism for project progression and client billing.

## 7.1 Milestone fields

```text
Milestone
├── ID
├── Project
├── Name
├── Description
├── Sequence
├── Start Date
├── Due Date
├── Completion Date
├── Amount
├── Payment Due Date
├── Work Status
├── Payment Status
├── Created By
├── Created At
├── Updated By
└── Updated At
```

## 7.2 Work status

Minimum:

```text
Pending
In Progress
Completed
```

Optional:

```text
On Hold
Cancelled
```

## 7.3 Payment status

Minimum:

```text
Not Due
Pending
Partially Paid
Paid
```

`Overdue` should normally be derived rather than stored:

```text
Payment Status = Pending or Partially Paid
AND Payment Due Date < Today
=> Display Overdue
```

## 7.4 Milestone progression rule

The next milestone **must not be blocked by client payment**.

Default workflow:

```text
Milestone 1
  ↓
In Progress
  ↓
Completed
  ↓
Payment Pending
  ↓
Milestone 2 can start
```

Payment status continues independently:

```text
Milestone 1
Work: Completed
Payment: Pending

Milestone 2
Work: In Progress
Payment: Not Due
```

If a company policy later requires a hard payment gate, it can be introduced as an optional configuration, but the initial product must not enforce it.

---

# 8. Deliverables

Deliverables are concrete outputs associated with milestones.

Tasks are intentionally **out of scope for the current version**.

## 8.1 Deliverable fields

```text
Deliverable
├── ID
├── Project
├── Milestone
├── Name
├── Description
├── Due Date
├── Status
├── Submitted At
├── Approved At
├── Approved By
├── Required / Optional
├── Attachments
├── Created By
└── Created / Updated At
```

Suggested statuses:

```text
Pending
In Progress
Submitted
Under Review
Approved
Rejected
```

## 8.2 Milestone completion rule

A milestone can be marked completed when its required deliverables satisfy the configured completion requirement.

Example:

```text
Milestone 1
├── Wireframes           Approved
├── High Fidelity UI     Approved
└── Prototype            Approved

=> Milestone can be completed
```

An authorized user may override this with a required reason if the business needs manual completion.

---

# 9. Organization / Team Management

Internal team management is controlled by the **Super Admin**.

## 9.1 Teams

Teams are organizational groups.

Examples:

```text
Development
Design
Operations
Management
```

Teams should be created and managed by Super Admins only.

### Team fields

```text
Team
├── ID
├── Name
├── Description
├── Team Lead (optional)
├── Status
├── Created By
├── Created At
├── Updated By
└── Updated At
```

## 9.2 Team members

A team member is an internal person.

```text
Team Member
├── ID
├── Name
├── Contact
├── Primary Team
├── Status
├── Joined At
├── Notes
├── Created By
└── Created / Updated At
```

Suggested statuses:

```text
Active
Inactive
Archived
```

## 9.3 Organization roles

A team member can have an organization-level role such as:

```text
Developer
Designer
Project Manager
Sales
Operations
Management
```

Roles are centrally managed by the Super Admin and are **not project-specific**.

The role is primarily an organizational label. System access is controlled by RBAC permissions, not by a hard-coded project role.

## 9.4 Project assignments

A team member can work on multiple projects.

```text
Project Assignment
├── Team Member
├── Project
├── Start Date
├── End Date
├── Status
└── Notes
```

There is **no `Role on Project` field**.

Example:

```text
Rahim
Primary Team: Development

Assigned Projects:
├── Project A
└── Project B
```

The system should answer:

- Who is currently assigned to a project?
- Which projects is a team member working on?
- When did the assignment start/end?
- How much has been paid to the team member?
- How much is still payable?

---

# 10. BDS Partners

BDS means Business Development & Sales in this system.

BDS partners are external people outside the organization.

They are not internal team members and do not belong to internal teams.

## 10.1 BDS partner fields

```text
BDS Partner
├── ID
├── Name
├── Phone
├── Email
├── Notes
├── Payment Terms
├── Status
├── Created By
└── Created / Updated At
```

Statuses:

```text
Active
Inactive
Archived
```

## 10.2 BDS attribution

A lead or opportunity can optionally be attributed to a BDS partner.

```text
BDS Partner
   ↓
Lead
   ↓
Opportunity
   ↓
Won
   ↓
Project
```

When the opportunity becomes a project, the BDS relationship should carry forward.

## 10.3 BDS compensation

A project may define a BDS payable amount.

First version should support a fixed agreed amount.

```text
BDS Compensation
├── BDS Partner
├── Project
├── Agreed Amount
├── Payment Due Date
├── Total Paid
├── Outstanding
└── Status
```

Percentage-based commission can be added later if required.

---

# 11. Finance

Finance is the central financial layer.

## 11.1 Accounts

The system can support multiple company money accounts.

Examples:

```text
Cash
Bank Account
Mobile Financial Account
```

### Account fields

```text
Account
├── ID
├── Name
├── Type
├── Opening Balance
├── Currency
├── Status
└── Created At
```

## 11.2 Transactions

Every actual money movement is represented by a transaction.

```text
Transaction
├── ID
├── Date
├── Account
├── Direction (IN / OUT)
├── Amount
├── Category
├── Payment Method
├── TRX ID
├── Note
├── Project (optional)
├── Client (optional)
├── Team Member (optional)
├── BDS Partner (optional)
├── Milestone (optional)
├── Reference Type
├── Reference ID
├── Created By
└── Created At
```

### Direction

```text
IN   = money received by company
OUT  = money disbursed by company
```

### Categories

Income:

```text
Client Milestone Payment
Other Income
```

Disbursement:

```text
Team Member Payment
BDS Payment
Project Cost
Office Expense
Software
Travel
Equipment
Other Expense
```

Categories should be configurable by authorized administrators where practical.

---

# 12. Manual Client / Milestone Payments

There is **no automatic payment receiving**.

An authorized user manually records every client payment.

## 12.1 Payment entry

Required fields:

```text
Client / Project
Milestone (optional where not milestone-based)
Amount
Received Date
Account
Payment Method
TRX ID
Note
```

Example:

```text
Receive Payment
────────────────────────────
Project: Project A
Milestone: M1
Amount: ৳100,000
Date: 22 Aug 2026
Account: Bank Account
Method: Bank Transfer
TRX ID: TXN-938472
Note: First milestone payment
```

Saving the entry should:

1. Create the client/milestone payment record.
2. Create exactly one `IN` financial transaction.
3. Increase the relevant account balance through the ledger.
4. Increase total received for the milestone.
5. Recalculate milestone payment status.
6. Recalculate project received/due/not-yet-due amounts.

## 12.2 Partial payment

Partial payments are supported.

Example:

```text
Milestone Amount      ৳150,000
Payment 1              ৳50,000
Payment 2              ৳50,000
Remaining              ৳50,000
```

Result:

```text
Payment Status = Partially Paid
```

When total allocated payments reach the milestone amount:

```text
Payment Status = Paid
```

---

# 13. Manual Team Member Payments

There is **no automatic payroll or automatic disbursement**.

An authorized user manually records every payment made to a team member.

## 13.1 Payment entry

```text
Team Member Payment
├── Team Member
├── Project (optional)
├── Amount
├── Paid Date
├── Account
├── Payment Method
├── TRX ID
├── Note
└── Created By
```

Saving the entry should:

1. Create exactly one `OUT` transaction.
2. Reduce the relevant account balance through the ledger.
3. Increase the team member's total paid amount.
4. Reduce the team's/team-member's payable where applicable.
5. Add project cost when the payment is linked to a project.

Example:

```text
Team Member: Rahim
Project: Project A
Amount: ৳20,000
TRX ID: TXN-12345
Note: August project payment
```

---

# 14. Manual BDS Payments

There is **no automatic BDS disbursement**.

An authorized user manually records each payment.

## 14.1 Payment entry

```text
BDS Payment
├── BDS Partner
├── Project (optional)
├── Amount
├── Paid Date
├── Account
├── Payment Method
├── TRX ID
├── Note
└── Created By
```

Saving the entry should:

1. Create exactly one `OUT` transaction.
2. Reduce the account balance.
3. Increase total BDS paid amount.
4. Reduce BDS outstanding payable.
5. Add project cost where the payment is project-related.

---

# 15. Project Costs

A project can have additional costs beyond team/BDS payments.

```text
Project Cost
├── Project
├── Category
├── Description
├── Amount
├── Date
├── Paid / Unpaid Status
├── Vendor / Party (optional)
├── Account (if paid)
├── TRX ID (if paid)
├── Note
└── Created By
```

If the cost is already paid:

```text
Project Cost
      ↓
OUT Transaction
```

If the cost is recorded as unpaid:

```text
Project Cost
      ↓
Payable
```

The cash balance is reduced only when the actual payment is manually entered.

---

# 16. Company Balance

The company balance is derived from the transaction ledger.

For one account:

```text
Current Balance
= Opening Balance
+ Sum(IN)
- Sum(OUT)
```

For multiple accounts:

```text
Total Company Balance
= Sum(Current Balance of all active company accounts)
```

Never directly edit a calculated balance.

Manual opening-balance or adjustment entries must themselves be recorded as transactions with a clear note and audit trail.

---

# 17. Receivables

Receivable is money expected from clients but not yet received.

For milestone-based projects:

```text
Received
= Sum of recorded payments allocated to milestones

Currently Due
= Sum of milestone amounts that are due
  - payments already allocated to those milestones

Not Yet Due
= Sum of future milestone amounts
```

Example:

```text
Contract Value          ৳500,000
Received                ৳100,000
Currently Due           ৳150,000
Not Yet Due             ৳250,000
```

If a client pays only part of a due milestone:

```text
Milestone Amount        ৳150,000
Received                 ৳50,000
Remaining Due           ৳100,000
```

Overdue display:

```text
Payment Due Date < Today
AND Remaining Amount > 0
=> Overdue
```

---

# 18. Payables

Payable is money the company owes but has not yet disbursed.

Track at minimum:

```text
Team Member Payable
BDS Payable
Other Payable
```

Example:

```text
Total Payable            ৳180,000
  Team Members             ৳80,000
  BDS Partners             ৳50,000
  Other                     ৳50,000
```

A payable decreases only when an actual payment is manually recorded.

---

# 19. Project Financial Summary

Each project should show:

```text
Project Financials

Contract Value              ৳500,000

Client Payments
  Received                  ৳100,000
  Currently Due             ৳150,000
  Not Yet Due               ৳250,000

Project Costs
  Paid                      ৳100,000
  Unpaid                    ৳50,000
  Total                     ৳150,000

Expected Gross Profit       ৳350,000
```

Base calculation:

```text
Expected Gross Profit
= Contract Value - Total Project Costs
```

The first version does not need advanced accounting profit recognition.

---

# 20. Project Milestone Example

```text
Project A
Contract Value: ৳500,000
```

Milestones:

```text
M1 — Planning          ৳100,000
M2 — Design            ৳150,000
M3 — Development       ৳150,000
M4 — Launch             ৳100,000
```

After completing M1 without payment:

```text
M1
Work: Completed
Payment: Pending

M2
Work: In Progress
Payment: Not Due
```

The team can continue M2 even if M1 has not been paid.

Financially:

```text
Received                ৳0
Currently Due           ৳100,000
Not Yet Due             ৳400,000
```

After manually recording a ৳100,000 M1 payment:

```text
Received                ৳100,000
Currently Due           ৳0
Not Yet Due             ৳400,000
```

After completing M2 and receiving nothing yet:

```text
Received                ৳100,000
Currently Due           ৳150,000
Not Yet Due             ৳250,000
```

---

# 21. Fully Detailed RBAC

Access is controlled by a **Super Admin**.

There is only one built-in system role:

```text
SUPER_ADMIN
```

The Super Admin creates users, creates roles, assigns permissions, activates/deactivates access, and controls what each user can do.

## 21.1 Super Admin responsibilities

Super Admin can:

- Create users
- Edit users
- Activate/deactivate users
- Reset user access
- Create roles
- Edit roles
- Delete roles when safe
- Assign roles to users
- Grant/revoke individual permissions where supported
- Create teams
- Edit teams
- Assign team members to teams
- Create and manage organization roles
- Manage all projects
- Manage all financial records
- View audit logs
- Configure system settings

The application must always retain at least one active Super Admin.

## 21.2 Users

A user is an authenticated person who can access the system.

Suggested fields:

```text
User
├── ID
├── Name
├── Email / Username
├── Password Hash / Auth Identity
├── Team Member (optional)
├── Status
├── Last Login
├── Created By
├── Created At
└── Updated At
```

Not every user must be a team member. For example, an external/limited operational user can exist without internal team membership if the business needs it later.

## 21.3 Roles

Roles are permission bundles created by the Super Admin.

Examples:

```text
Finance Manager
Project Manager
Sales Manager
Operations User
Viewer
```

These are examples only. The Super Admin decides which roles actually exist.

## 21.4 Permissions

Permissions should be granular and action-based.

Recommended permission pattern:

```text
RESOURCE.ACTION
```

Examples:

```text
users.view
users.create
users.update
users.deactivate

roles.view
roles.create
roles.update
roles.delete

teams.view
teams.create
teams.update
teams.delete

team_members.view
team_members.create
team_members.update
team_members.archive
team_members.assign

clients.view
clients.create
clients.update
clients.archive

leads.view
leads.create
leads.update
leads.delete

opportunities.view
opportunities.create
opportunities.update
opportunities.delete
opportunities.convert

projects.view
projects.create
projects.update
projects.archive
projects.assign_team

milestones.view
milestones.create
milestones.update
milestones.complete
milestones.cancel

milestone_payments.view
milestone_payments.create
milestone_payments.update
milestone_payments.delete

 deliverables.view
 deliverables.create
 deliverables.update
 deliverables.submit
 deliverables.approve
 deliverables.reject

accounts.view
accounts.create
accounts.update
accounts.archive

transactions.view
transactions.create
transactions.update
transactions.reverse
transactions.delete

project_costs.view
project_costs.create
project_costs.update
project_costs.delete

team_payments.view
team_payments.create
team_payments.update
team_payments.reverse

bds_partners.view
bds_partners.create
bds_partners.update
bds_partners.archive

bds_payments.view
bds_payments.create
bds_payments.update
bds_payments.reverse

reports.view
reports.export

audit_logs.view
settings.view
settings.update
```

The accidental whitespace in the examples above should not be copied into permission keys; use normalized keys such as `deliverables.view` and `accounts.view`.

## 21.5 Role permission matrix

A role contains many permissions:

```text
Role
├── ID
├── Name
├── Description
├── Status
└── Permissions[]
```

A user can have one or more roles:

```text
User
  └── UserRoles
         └── Roles
                └── Permissions
```

Effective permissions are the union of permissions granted by all active roles, subject to any explicit deny/override mechanism adopted by the implementation.

For the first version, prefer **allow-only permissions** and avoid explicit deny rules unless the business specifically requires them. This makes RBAC much easier to reason about.

## 21.6 Sensitive finance permissions

Financial actions should be separately permissioned.

For example:

```text
milestone_payments.create
milestone_payments.update
milestone_payments.reverse

team_payments.create
team_payments.update
team_payments.reverse

bds_payments.create
bds_payments.update
bds_payments.reverse

transactions.create
transactions.reverse
```

A user who can view finance does not automatically get permission to create or reverse payments.

## 21.7 Reversal instead of destructive deletion

Posted financial transactions should not normally be hard-deleted.

Prefer:

```text
Original Transaction
      ↓
Reversal / Adjustment Transaction
```

This preserves the financial audit trail.

---

# 22. Audit Logs

Record important actions including:

- User created
- Role/permission changed
- Team created/updated
- Project created/updated
- Milestone status changed
- Deliverable approved/rejected
- Payment received
- Team-member payment made
- BDS payment made
- Transaction reversed
- Financial records edited

Audit event fields:

```text
Audit Log
├── ID
├── User
├── Action
├── Entity Type
├── Entity ID
├── Before Data (where appropriate)
├── After Data (where appropriate)
├── Timestamp
└── IP / Session Metadata (optional)
```

---

# 23. Search and Filtering

Major lists should support:

- Search
- Filtering
- Sorting
- Pagination

Especially:

- Clients
- Projects
- Team members
- BDS partners
- Transactions
- Milestones
- Payments

Financial filters:

```text
Date Range
Account
Category
Project
Client
Team Member
BDS Partner
Transaction Direction
Payment Status
```

---

# 24. Reports

Keep reporting simple in version 1.

## Company

- Current balance
- Income by period
- Disbursement by period
- Receivables
- Payables
- Team-member payments
- BDS payments

## Projects

- Contract value
- Received amount
- Due amount
- Not-yet-due amount
- Project costs
- Outstanding costs
- Expected gross profit
- Milestone payment status

## People

- Team-member project assignments
- Team-member payment history
- BDS partner payment history
- BDS outstanding amounts

---

# 25. Minimum Screens

A practical first release can use:

```text
1. Login
2. Dashboard

CRM
3. Clients
4. Client Details
5. Leads
6. Opportunities
7. Opportunity Details

Projects
8. Projects
9. Project Details
10. Milestone Details
11. Deliverable Details

Organization
12. Teams
13. Team Members
14. Team Member Details
15. Project Assignments

BDS
16. BDS Partners
17. BDS Partner Details

Finance
18. Finance Dashboard
19. Accounts
20. Transactions
21. Receivables
22. Payables
23. Payment Entry
24. Project Costs

Administration
25. Users
26. Roles
27. Permissions
28. Audit Logs
29. Settings
30. Reports
```

Some of these can be implemented as tabs within parent detail pages instead of separate routes.

---

# 26. Recommended Project Detail Layout

```text
Project A
────────────────────────────────────
Client: ABC Ltd
Status: Active
Contract: ৳500,000

FINANCIAL SUMMARY
Received:       ৳100,000
Due:            ৳150,000
Not Yet Due:    ৳250,000
Project Cost:   ৳120,000

MILESTONES
✓ M1 Planning          Completed · Paid
● M2 Design            In Progress · Pending
○ M3 Development       Pending · Not Due
○ M4 Launch            Pending · Not Due

TEAM
Rahim
Sara

DELIVERABLES
...

RECENT FINANCIAL ACTIVITY
...
```

There is no project-role label for each team member.

---

# 27. Recommended Team Member Detail Layout

```text
Rahim
Role: Developer
Team: Development
Status: Active

CURRENT PROJECTS
├── Project A
└── Project B

PAYMENTS
Total Paid:              ৳320,000
Outstanding:              ৳40,000

RECENT PAYMENTS
...
```

---

# 28. Recommended BDS Partner Detail Layout

```text
John
BDS Partner
Status: Active

BUSINESS
Projects Attributed: 4
Total Project Value:  ৳2,000,000

PAYMENTS
Total Owed:            ৳120,000
Total Paid:             ৳70,000
Outstanding:            ৳50,000

PROJECTS
...
```

---

# 29. Recommended Finance Dashboard Layout

```text
FINANCE
────────────────────────────────────
Available Balance      ৳850,000
Receivable             ৳420,000
Payable                ৳180,000

THIS MONTH
Money Received         ৳650,000
Money Disbursed        ৳420,000
Net Cash Flow          ৳230,000

BREAKDOWN
Client Payments        ৳650,000
Team Payments          ৳180,000
BDS Payments            ৳50,000
Project Costs          ৳120,000
Other Expenses          ৳70,000
```

---

# 30. What NOT to Build Initially

Avoid scope creep.

Do not make version 1 dependent on:

- Automatic payment gateways
- Automatic bank reconciliation
- Automatic disbursement
- Payroll engine
- Full accounting / double-entry bookkeeping
- Tax engine
- HR management
- Attendance
- Recruitment
- Procurement
- Inventory
- Marketing automation
- Complex resource planning
- Gantt charts
- Task management
- Time tracking unless immediately needed
- AI features
- Complex workflow builders
- Multi-company accounting
- Multi-currency complexity unless required

The goal is a reliable small-company operational system with strong financial traceability.

---

# 31. Suggested Development Phases

## Phase 1 — Foundation and Access

Build:

- Authentication
- Users
- Super Admin
- Roles
- Permissions
- RBAC enforcement
- Audit logs
- Teams
- Team members

## Phase 2 — CRM

Build:

- Clients
- Leads
- Opportunities
- BDS attribution
- Conversion to project

## Phase 3 — Projects

Build:

- Projects
- Project assignments
- Milestones
- Deliverables
- Milestone sequence
- Independent milestone progression

## Phase 4 — Finance Foundation

Build:

- Accounts
- Transaction ledger
- Transaction categories
- Company balance
- Manual transaction entry

## Phase 5 — Project Finance

Build:

- Milestone amounts
- Manual client/milestone payments
- TRX ID and notes
- Receivables
- Partial payments
- Project costs
- Project financial summary

## Phase 6 — People / BDS Finance

Build:

- Team-member payments
- Team-member payable tracking
- BDS partners
- BDS compensation
- Manual BDS payments
- BDS outstanding tracking

## Phase 7 — Dashboard and Reports

Build:

- Company dashboard
- Financial dashboard
- Project summaries
- Receivable/payable reports
- Payment history
- Audit views

---

# 32. Final MVP Definition

The first production-ready version should allow the Super Admin to:

1. Create users and control their access with granular RBAC.
2. Create teams and assign internal team members to them.
3. Create clients and sales opportunities.
4. Create BDS partners and associate them with leads/opportunities/projects.
5. Create projects for clients.
6. Add ordered milestones to projects.
7. Add deliverables to milestones.
8. Start the next milestone even when the previous milestone's payment is still pending.
9. Manually record client milestone payments with amount, TRX ID, account/method, date, and note.
10. Automatically calculate received, due, not-yet-due, and overdue amounts from those records.
11. Record project costs and distinguish paid from unpaid costs.
12. Manually record payments to team members with TRX ID and note.
13. Manually record payments to BDS partners with TRX ID and note.
14. Calculate total paid and outstanding amounts for team members and BDS partners.
15. Calculate company balance from the financial transaction ledger.
16. View project-level financials and company-wide financials.
17. Maintain audit history for important operational and financial actions.

The system should be small enough to build and operate easily, but the financial ledger, RBAC model, and entity relationships should be designed correctly from the beginning so the system can grow later without a major rewrite.
