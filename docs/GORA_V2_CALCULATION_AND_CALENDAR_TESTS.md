GORA V2 — Financial Calculation, Posting & Calendar Acceptance Specification
Version 2.0 | Branch: gora-v2-clean-build | Currency: KES (KSh) | Timezone: Africa/Nairobi
Purpose and release rule
Borrower balances, schedules, arrears, receipts and accounting must rely on server-validated transactions, not browser-only arithmetic. UI calculations are previews; approved database terms and secure posting workflows are authoritative.
Do not launch or process real borrower transactions until every P0 test passes and secure database workflows are verified. Use isolated staging/test accounts only. Never test against live borrower balances.
1. Canonical rules
Persist money as integer minor units or exact database numeric with explicit scale; never binary floating point for persisted money.
Validate finite values, supported precision, positive principal, product limits, duration and required terms. Reject unsupported combinations—no silent defaults.
Keep full precision during intermediate calculations. Round outputs to KSh 0.01 using one documented deterministic rule (recommended half-up); use the same fixtures in client and server. Apply any residual once to the final installment so schedule totals reconcile exactly.
A rate must include its basis: value, rate period, method, duration, repayment frequency and day/period convention. Explicitly define nominal/effective, calendar month/fixed days and annual basis. Never infer or silently convert.
Approved loan terms are an immutable snapshot. Product edits affect new quotes only.
Use Africa/Nairobi for business dates and display. Store timestamps safely and convert at boundaries; contractual due dates are date-only where appropriate.
Financial writes must be authorized, atomic, auditable and idempotent. Show success only after server confirmation.
2. Calculation layer contract
Implement reusable, deterministic, tested functions for:
Validate product/loan terms.
Quote principal, interest, fee, fee treatment, gross repayment, net disbursement, installment schedule and assumptions.
Generate schedule from approved snapshot.
Calculate outstanding principal, scheduled balance, amount due, arrears and aging as-of date.
Allocate posted payment using verified secure server workflow.
Calculate savings balance, cashbook and posted accounting totals.
Generate calendar recurrence without changing contractual dates.
Return structured values and explicit validation errors; never return NaN, infinity, negative zero, undefined, or guessed fallback method. Server/database revalidates every financial input.
3. Numeric reference fixtures
These are independent reference cases. Implement only where product configuration explicitly supports the stated convention. If live product rules differ, document and approve a matching fixture before coding.
F1 — Flat/simple interest
Principal KSh 12,000; annual rate 12%; 12 months; flat; no fee. Formula: interest = principal × annual rate × (months / 12). Expected interest KSh 1,440; total KSh 13,440; 12 installments KSh 1,120 each; principal sum KSh 12,000; interest sum KSh 1,440.
F2 — Flat/simple interest, six months
Principal KSh 60,000; annual rate 24%; 6 months; no fee. Expected interest KSh 7,200; total KSh 67,200; 6 installments KSh 11,200.
R1 — Reducing balance, equal principal
Principal KSh 12,000; annual nominal rate 12%; monthly rate 1%; 12 monthly periods; principal KSh 1,000 each; no fees. Monthly opening-balance interest: 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10 KSh. Expected interest KSh 780; total KSh 12,780; first installment KSh 1,120; final KSh 1,010; ending principal zero. This is equal-principal, not annuity.
R2 — Annuity/equal payment (only if separately supported)
Principal KSh 12,000; monthly rate 1%; 12 periods. Payment formula: P × r / (1 − (1+r)^−n). Interest = opening balance × rate; principal = payment − interest; final payment adjusted to zero balance. Do not label this equal-principal.
F3 — Fee treatment
Gross principal KSh 10,000; fee 5% of principal = KSh 500.
Deducted at disbursement: borrower net cash KSh 9,500; repayment terms remain based on approved loan terms; fee accounting follows approved policy.
Added to repayment: fee appears once in repayment/fee schedule; it is not also deducted from net disbursement. Fee base and treatment must be explicit.
F4 — Fixed fee
Principal KSh 10,000; fixed fee KSh 250. Expected fee KSh 250 exactly. Validate whether deducted or added; no implicit treatment.
F5 — Rounding
Choose inputs producing fractional cents. Keep precision internally; rounded installments sum exactly to approved total; final residual is applied once and is visible/auditable.
4. Product and schedule validation
Min/max principal and duration boundaries pass; values just outside fail.
Rate, rate period, method, duration unit and repayment frequency must be supported together.
Fee type/value/base/treatment and penalty type/value/trigger/cap/grace period must be complete if enabled.
Unsupported compounding, frequency or rate-period combination is rejected with clear reason.
Quote is labelled estimate. Approval stores principal, rate/method/period, duration, frequency, fee/penalty rules and approved totals.
Schedule count equals approved installment count; installment numbers sequential and unique.
Principal components sum to approved principal; interest and fee components sum to approved totals; schedule total equals approved repayment exactly.
Opening principal minus principal paid equals closing principal; never negative.
First due date comes from approved terms, not page render time.
Monthly dates 29–31 use documented month-end fallback, preserving anchor day (Jan 31 → Feb month-end → Mar 31), unless contract specifies otherwise.
Weekly/biweekly recurrence preserves weekday/interval without drift.
Business-day adjustment is configurable and transparent. Never silently move contractual due dates.
After disbursement, schedule changes require authorized, audited restructure/re-amortization.
5. Repayment posting and allocations — P0
Use verified secure RPC record_loan_repayment_fifo after rechecking its live signature and behavior. Never insert repayment/allocation rows directly from browser.
Test exact, partial, early, overdue and multi-installment payments. Allocation order and component priority (principal/interest/fees/penalties) must match documented server rule; do not assume component order.
Allocated total equals posted payment.
Duplicate reference rejected or idempotently returns original result per server rule.
Simultaneous duplicate submissions create at most one posting.
Timeout after commit can be safely retried and reconciled.
Overpayment is rejected or routed to an approved unapplied/advance balance; never lost or silently overallocated.
Reversal retains original, requires permission/reason, offsets exactly once and updates balances/reports.
Only POSTED, non-reversed repayments count as collections; report by payment_date.
6. Balance, settlement and arrears
Show separately:
Outstanding principal: principal not yet repaid.
Scheduled balance: unpaid contractual installments/components.
Amount due as-of date: unpaid amounts due on/before date under allocation policy.
Arrears: overdue unpaid amount; exclude future installments.
Early settlement: outstanding principal plus policy-defined accrued/contractual interest and charges minus payments/credits. Do not automatically charge all future interest without approved policy.
Days past due use installment due date and selected Nairobi business date, not created_at.
Aging buckets must be exact, non-overlapping and documented (e.g. 1–30, 31–60, 61–90, 91+).
Fully paid loan closes only after server-side balance/schedule settlement; zero is exact to currency precision.
Reversed payments do not remain in collections, balance or arrears.
7. Savings and cashbook
Savings balance includes only valid posted transactions and reversals under ledger rules.
Pending/unposted transactions do not affect posted balance.
Withdrawal beyond available balance rejected by database; test concurrent withdrawals.
Reversal retains original and offsets once.
Savings are member liability, not income.
Per account: opening + posted receipts − posted payments = closing.
Cash and bank remain distinct; transfers use paired entries and do not inflate total.
Unposted expense excluded from posted cashbook/P&L.
Loan principal received increases cash and reduces loan receivable; not profit.
Savings received increases cash and member liability; not profit.
Interest/fee income and expenses follow approved accounting policy and posted ledger.
Posted journal debits equal credits; trial balance balances for same organization/period/scope.
8. Disbursement and accounting integrity — P0
Keep live disbursement disabled until secure transactional server workflow exists. It must atomically validate approved application/terms, authorization, branch/org scope and funds; prevent duplicate via idempotency; create loan account and schedule; record reference/date/method/actor; post entries in the selected ledger; audit; and commit all or roll back all.
Test insufficient funds, unauthorized user, stale approval, double click, concurrent disbursement and failure mid-transaction. Result must be one complete transaction or none—never a partial account/schedule/ledger.
Choose one canonical ledger before finance integration. Existing database contains both general finance and GORA-prefixed structures; do not mix them.
9. Dashboard/report reconciliation
Same date range, timezone, organization, branch and status scope:
Collections = posted non-reversed repayments by payment_date.
Disbursements = successful posted disbursements, not approvals.
Portfolio outstanding = account balances as of date; define treatment of closed/restructured/write-off accounts.
Arrears = unpaid due schedule rows as of date; exclude future dues and avoid duplicate allocations.
Savings liability = posted savings balances.
Cashbook/bank = posted transactions and ledger balances.
Profit = recognized posted income minus posted expenses; exclude principal, savings, capital and disbursement flows.
Member growth uses clearly labelled definition (registered vs approved/active).
Compare equal-length periods; zero baseline shows “—” or “new”, never divide-by-zero.
Branch/officer/chama filters affect rows and totals and enforce authorized scope.
Empty period shows empty/zero state, not fabricated chart points.
Export row counts, totals, filters and date/timezone match on-screen report.
10. Calendar and reminders — P0 for due dates
Calendar is a projection, not financial source of truth.
Loan due dates come from persisted approved repayment schedule; calendar never recalculates or modifies them.
Chama meetings/tasks can recur; installment due events cannot be shifted by general event recurrence.
Test Africa/Nairobi, midnight boundaries, date-only due dates and device timezone differing from Kenya.
Test 28/29/30/31-day months and Feb 29 in leap years.
Monthly day 29/30/31 uses documented fallback and retains anchor day.
Weekly/biweekly/monthly series have no skipped/duplicate occurrence over 12 months.
Series edit distinguishes “this occurrence” and “this and future”; past events and loan due dates remain unchanged.
Reschedule/cancel retains old/new dates, actor, timestamp and reason as required.
Business-day/holiday adjustment is configurable and never silently changes loan due dates.
Reminder failure does not change due date/status; reminders cannot post transactions.
Completed follow-up records actor, timestamp and notes.
Branch/officer/chama/type/status filters match authorized source records.
11. Security, audit and resilience — P0
Cross-organization access denied by RLS/database.
Unassigned branch access denied/excluded server-side.
Unauthorized approval, disbursement, repayment, reversal, withdrawal or role change denied with no partial writes.
Member documents private; use authorized access/expiring signed URLs as appropriate.
No service-role secret in source, client bundle, repository or public settings.
Direct browser writes to protected financial tables denied.
High-impact actions capture actor, timestamp, source/reference and required reason.
Constraints protect unique identifiers, idempotency and relationships.
Failure/timeout never creates false success; retries cannot double-post.
Concurrent payments/withdrawals/disbursements cannot double-post or overdraw.
Backup/restore rehearsal preserves records, relationships, balances and audit.
12. Test evidence and release gate
For every test record ID, build/commit, isolated configuration, exact inputs, expected and actual outputs, pass/fail, evidence/transaction ID, defect, tester and date.
Release blocked by any P0 failure, unreconciled financial total, duplicate posting, unauthorized action, unapproved due-date change, or browser-only financial logic.
13. Minimum build sequence
Verify live schema, status values, RPC signatures and canonical ledger.
Implement pure calculation layer and fixtures.
Implement/verify secure transactional database functions and constraints.
Build UI against verified APIs/RPCs; no mock success.
Run staging calculation, transaction, RLS, calendar and reconciliation tests.
Sign off and backup before production deployment.
