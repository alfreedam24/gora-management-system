GORA V2 — Build Contract
Branch: gora-v2-clean-build
Timezone: Africa/Nairobi
Currency: KES (KSh)
This is the acceptance contract for GORA V2. Financial correctness, security and data integrity take precedence over appearance or speed.
1. Build principles
Preserve existing branches and all production financial records. No destructive schema changes, broad reset or record deletion during frontend rebuild.
Replace legacy frontend files as a coordinated set; do not mix old and new logic.
Use the live Supabase schema and verified secure RPCs. Never invent table names, columns or RPC signatures.
Keep calculations in a reusable, tested layer; database constraints and secure posting functions remain authoritative.
Never expose a Supabase service-role key in browser code. Use authenticated sessions, the public/anon key and RLS.
Every module needs loading, empty, error, success and permission-denied states. No fake financial data in production.
2. App shell
Professional GORA identity, navy/blue palette with restrained teal accent, consistent spacing and readable typography.
Desktop sidebar and mobile navigation drawer; navigation must not unexpectedly sign the user out.
Global search where authorized, notification center, branch context, profile and sign-out.
Responsive on Android/mobile and desktop. Preserve useful filters and active module during navigation.
3. Authentication, organization and access
Supabase Auth sign-in, session restoration, sign-out and expired-session handling.
Load profile, active organization, roles and authorized branch scope after login.
Enforce organization/branch scope through RLS and database validation, not UI-only filters.
Respect configured roles: SUPER_ADMIN, MANAGER, LOAN_OFFICER, CASHIER, ACCOUNTANT, AUDITOR, GROUP_OFFICIAL and MEMBER, as actually defined.
Honor staff branch assignments. Restrict identity documents, financial records, approvals and exports.
Audit sensitive actions with actor, timestamp and reason where applicable.
4. Dashboard
Use live authorized data and date filters (today, week, month, quarter, year, custom). KPIs: total/active members, new members, member growth, active chamas, individual borrowers, active loan accounts, outstanding portfolio, pending applications, approved loans awaiting action (only when supported), collections, target progress, arrears and savings liability. Charts: member growth, collection trend, previous-period comparison, disbursement trend, portfolio/arrears movement, product mix, branch/officer/chama performance and target progress.
Show positive/negative movement with a defined comparison period and denominator.
Profit must come from posted accounting entries; never count principal collection, member savings or total cash received as profit.
If accounting is incomplete, show profit as unavailable, not an estimate.
Attention panel may show overdue follow-ups, pending approvals, payments awaiting posting/reconciliation and approved disbursement actions only when source statuses are reliable.
5. Members
Registration with validation and duplicate checks; profile, contact/next-of-kin, branch/group, registration fee and consent status.
Approve/reject/deactivate only through authorized workflow; record reviewer, timestamp and rejection reason.
Search/filter by status, branch and chama; paginate and export subject to permissions.
Store member photos and ID documents securely; no public document URLs.
6. Chamas and group membership
Create/review/approve/manage groups using actual chama_groups schema and workflow.
Membership uses chama_memberships, not an assumed chama_members table.
Support branch, meeting frequency/day/time/venue, savings target, capacity and officials where columns exist.
Meeting calendar supports recurrence and audited rescheduling.
Group view summarizes members, savings/contributions, loans and collections from source records.
7. Individual borrowers
Register and maintain records using the actual individual_borrowers schema.
Validate identity/contact and duplicate details; link applications/accounts using the existing borrower-type model.
8. Loan products and calculations
Product settings must reflect actual columns: min/max principal, rate, interest method/period, duration range/unit, repayment frequency, processing fee type/value, late penalty type/value, status, branch and application type.
No silent defaults that change economics. Reject unsupported combinations rather than guessing.
Implement and test each supported method: flat/simple interest and reducing balance, using configured rate period and approved duration.
Distinguish fees deducted from disbursement from fees added to repayment; never mix them.
Installment totals must reconcile exactly to approved repayment; deterministic rounding and final-installment adjustment required.
Display principal, interest, fees, total repayment, net disbursement and installment estimate.
Quote is an estimate until approval. Approved terms are an immutable snapshot for that loan.
9. Loan applications and approvals
Capture borrower, product, requested amount/duration, purpose and required assessment.
Follow database workflow: verified application fee where required, affordability assessment, guarantor consent and independent approval.
Show monthly income, expenses, existing debt and reviewer notes.
Store approved principal, rate/method/period, duration, frequency, fees and penalty snapshot plus approved totals where fields exist.
Prevent self-approval where required; maintain status history and timestamps.
10. Disbursement
Disbursement is a financial posting, not a UI-only status change.
Before enabling live disbursement, implement/review a secure transactional database workflow that atomically validates approval, creates loan account and schedule, and posts accounting entries as applicable.
Never create account and schedule in separate browser inserts.
Prevent duplicate disbursement with idempotency/uniqueness; capture date, method, reference, amount and authorized staff.
If secure transaction workflow is absent, keep action disabled/pending configuration; never simulate success.
11. Repayments and arrears
Use verified secure RPC record_loan_repayment_fifo; do not insert repayment/allocation rows directly from browser.
Verify exact RPC signature before integration. Posted repayments count as collections; reversed transactions do not.
Use payment_date for reporting in Africa/Nairobi. Prevent duplicate posted references where supported.
Show allocations and remaining scheduled balance. Test partial payments, overpayments, early settlement, reversal and closure.
Arrears = unpaid amount due as of the selected date; define included components and prevent double-counting future allocations.
Aging buckets must be explicit and based on installment due date, not record creation date.
12. Savings
Use savings_accounts and savings_transactions.
Only valid posted/approved transactions affect balances under the actual status model.
Show opening balance, deposits, withdrawals, adjustments/reversals and closing balance.
Withdrawal balance checks must be enforced securely in database logic, not only in UI.
Savings are member liabilities, not company income.
13. Finance and accounting
Resolve intended ledger design before integration: existing finance schema includes both general and GORA-prefixed accounting structures. Do not mix ledgers without an explicit decision.
Use posted, balanced journal entries for financial reports.
Cashbook equation: opening balance + posted receipts − posted payments = closing balance.
Track cash/bank, capital, expenses, petty cash and reconciliation using supported schema.
Profit/loss uses recognized income and expenses, not principal movement, savings or loan principal repayment.
Financial actions require authorization, references, posting status and audit trail.
14. Calendar
Use Africa/Nairobi; display dates consistently and store timestamps safely.
Views: month, week, day/agenda and upcoming list. Filters: branch, officer, chama, event type and status.
Event types: installment due, chama meeting, task/follow-up, application deadline, approved disbursement action, financial close and user event.
Support recurring events with explicit recurrence rules; preserve original occurrence and audit rescheduling.
Handle leap years, month lengths and timezone conversion.
For monthly dates 29–31, use a documented deterministic month-end fallback (last calendar day) unless product terms specify otherwise.
Weekend/holiday business-day adjustment must be configurable and transparent. Never silently alter agreed due dates.
Reminders are informational and cannot post transactions or change due dates. Track completion/follow-up with actor and timestamp.
15. Reports and exports
Reports: member/chama registers, loan book, collections, arrears aging, savings, disbursement, cashbook, expenses, income statement and branch/officer performance.
Show date range, timezone, branch scope, generation time and filters.
Respect permissions and sensitive-data restrictions.
Report totals must match displayed rows and source records; support pagination and large datasets.
16. Reliability and UX
Audit loan-term changes, approvals/rejections, disbursement, repayment reversal, savings withdrawal, role changes, calendar rescheduling and financial posting.
Confirm high-impact actions; protect against double-submit; use idempotent posting.
Never show success until the server confirms. No dead buttons, fake charts, hard-coded balances or placeholders presented as functional.
Accessible labels, keyboard navigation, mobile touch targets and consistent KSh formatting.
17. Launch acceptance tests
Login/session restoration/sign-out and role/branch scope.
Member registration, duplicate validation, approval/rejection and audit.
Chama approval, membership and recurring calendar.
Every configured interest method, rate period, duration and fee type.
Approved terms remain unchanged after product edits.
Disbursement is atomic and cannot duplicate.
Repayment RPC allocation, duplicate references and reversals.
Outstanding, schedule, arrears and aging reconcile.
Savings transactions reconcile and prevent unauthorized negative balances.
Cashbook/journals balance; profit excludes principal and savings.
Dashboard/reports agree with source data and date filters.
Calendar month-end, leap-year, recurrence, timezone and rescheduling tests.
Empty/error/loading states, mobile layout, exports and permissions.
No service-role key or unrestricted browser data access.
Backup/restore and deployment checks.
A feature is complete only when its UI, database workflow, permissions, audit behavior and tests all pass.
