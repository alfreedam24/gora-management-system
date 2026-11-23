GORA V2 — Calculation and Calendar QA Matrix
This matrix is a release gate. Use test data only. Each test must record input, expected result, actual result, pass/fail and reviewer. Do not run test transactions against live member balances.
A. Loan quote and schedule tests
ID
Test
Required result
LQ-01
Minimum allowed principal
Quote accepted; principal equals input; all totals reconcile
LQ-02
Maximum allowed principal
Quote accepted within product limit; totals reconcile
LQ-03
Below minimum / above maximum
Rejected with clear validation; no record created
LQ-04
Minimum and maximum duration
Valid boundaries accepted; outside boundaries rejected
LQ-05
Flat interest
Interest follows configured rate period and approved duration; displayed formula matches product configuration
LQ-06
Reducing-balance interest
Interest calculated on outstanding principal for each period; schedule balance decreases correctly
LQ-07
Unsupported interest/rate-period combination
Rejected or explicitly disabled; no guessed conversion
LQ-08
Processing fee percentage
Fee calculated from configured fee base; rounding documented
LQ-09
Processing fee fixed amount
Fee equals configured fixed value
LQ-10
Fee deducted at disbursement
Net disbursement = approved gross amount minus applicable deducted fee; repayment total not incorrectly reduced
LQ-11
Fee added to repayment
Fee included exactly once in approved repayment total and schedule
LQ-12
Late penalty configuration
Penalty only applies under configured rules; never silently added to principal or interest
LQ-13
Odd amount / fractional installment
Currency rounding deterministic; final installment adjusts so schedule total equals approved total
LQ-14
Product edited after approval
Existing loan keeps its approved term snapshot; new quote uses updated product
LQ-15
Quote vs approval
Quote is clearly marked estimate; approved terms are stored and used for schedule
B. Repayment, balance and arrears tests
ID
Test
Required result
RP-01
Exact installment payment
Allocation and schedule status update correctly
RP-02
Partial installment payment
Paid amount reduces amount due; remaining amount stays due
RP-03
Payment covers multiple installments
Allocated according to secure FIFO rule; totals equal payment
RP-04
Payment smaller than due
No overstatement of installment completion
RP-05
Duplicate reference
Duplicate posted payment rejected or safely idempotent per database rule
RP-06
Payment date vs entry date
Reports use payment_date; audit retains entry timestamp
RP-07
Reversal
Original remains auditable; reversal offsets it; collection and balance recalculate
RP-08
Future-due installment
Not included in arrears before due date
RP-09
One day overdue
Correct overdue days and aging bucket
RP-10
Aging bucket boundary
Boundary days land in documented bucket with no gaps/overlap
RP-11
Fully repaid loan
Outstanding is zero within currency precision; account closes only under approved rule
RP-12
Overpayment
Rejected or routed to approved unapplied/advance handling; never silently lost
RP-13
Payment after reversal
Balance and allocations remain consistent
RP-14
Two simultaneous submissions
No double-posting; idempotency/transaction controls protect balance
C. Savings and cashbook tests
ID
Test
Required result
SV-01
Savings deposit
Member balance increases by posted amount only
SV-02
Savings withdrawal within available balance
Balance decreases and authorized transaction is recorded
SV-03
Withdrawal exceeds available balance
Secure database validation rejects it
SV-04
Pending/unposted savings transaction
Does not affect posted balance
SV-05
Savings reversal
Original is retained; balance is corrected exactly once
CB-01
Opening + receipts − payments
Closing balance matches equation
CB-02
Cash vs bank account
Transactions remain in correct account; no cross-account double count
CB-03
Unposted expense/payment
Excluded from posted cashbook and P&L until valid posting
CB-04
Loan principal received
Increases cash and reduces loan receivable; not recognized as profit
CB-05
Member savings received
Increases cash and member savings liability; not recognized as income
CB-06
Interest income
Recognized according to configured accounting policy and posted ledger entry
CB-07
Expense posting
Expense and cash/bank impact balance in journal
CB-08
Trial balance
Total debits equal total credits for posted journal entries
D. Dashboard and report reconciliation
ID
Test
Required result
DB-01
Dashboard collections vs posted repayments
Equal for same dates, branch scope and status rules
DB-02
Current vs previous period
Same length/comparable period; percentage change handles zero baseline
DB-03
Member growth
New registrations counted by approved definition; inactive/rejected members handled consistently
DB-04
Portfolio outstanding
Matches loan-account balance calculation at selected as-of date
DB-05
Arrears
Matches unpaid due schedule rows at selected as-of date
DB-06
Savings liability
Matches posted savings account balances
DB-07
Profit
Matches posted income and expense accounts; excludes principal and savings flows
DB-08
Branch/officer filters
Rows and totals restricted to authorized scope and selected filters
DB-09
Empty period
Displays zero/empty state; no fake chart points or divide-by-zero error
DB-10
Export
Export totals and filters match on-screen report
E. Calendar and date tests
ID
Test
Required result
CAL-01
Africa/Nairobi timezone
Event displays in Kenya local time consistently
CAL-02
Month with 28/29/30/31 days
Correct grid and event dates
CAL-03
Leap year Feb 29
Valid occurrence shown only in leap year
CAL-04
Monthly event scheduled on 29th/30th/31st
Uses documented month-end fallback when date is absent
CAL-05
Weekly recurrence
Correct weekday and recurrence interval
CAL-06
Monthly recurrence
Correct next date; no skipped or duplicate event
CAL-07
Recurring meeting edited
User can edit this occurrence or future series according to chosen action; history retained
CAL-08
Reschedule
Original and new dates, actor, timestamp and reason retained
CAL-09
Weekend/holiday
Configured business-day rule applied transparently; contractual due date not silently changed
CAL-10
Reminder
Reminder does not create/post a transaction or alter due date
CAL-11
Event overdue
Clearly marked based on local date and event status
CAL-12
Date-range report around midnight
No off-by-one date caused by UTC/local conversion
CAL-13
Calendar filter
Branch/officer/chama/type/status filters match event records
CAL-14
Completed follow-up
Completion actor/time and notes retained
F. Security and resilience tests
ID
Test
Required result
SEC-01
User accesses another organization
Denied by RLS/database policy
SEC-02
User accesses unassigned branch
Denied or excluded by enforced scope
SEC-03
Unauthorized approval/posting
Denied; no partial transaction
SEC-04
Member document URL
Access limited to authorized user and valid signed access
SEC-05
Service-role key scan
No service-role secret in source, bundle or public settings
SEC-06
Network failure during posting
No false success; retry cannot duplicate transaction
SEC-07
Concurrent update
Database detects conflict or safely serializes posting
SEC-08
Audit trail
Sensitive actions include actor and timestamp; reason captured when required
G. Release sign-off
For each test, record:
Test ID and build/commit
Product/account configuration used
Input values and expected output
Actual output and reconciliation evidence
Pass/fail and defect reference
Tester and date
Release is blocked by any failed financial calculation, unauthorized access, duplicate posting, unreconciled ledger, or calendar date error affecting a contractual due date.
