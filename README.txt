GORA ONLINE MANAGEMENT SYSTEM — STARTER PACKAGE

This is a starter website, not a production-ready lending platform.
Do not enter real member or financial data until security policies, secure
loan approval, installment generation, repayment allocation and backups are
configured and tested.

Included:
- Mobile-responsive web interface
- Supabase email/password login
- Dashboard totals
- Read-only lists for members, chamas, loan applications, savings,
  repayments and cashbook

Setup:
1. Obtain Project URL and anon/public key from Supabase > Project Settings > API.
2. Upload these files to a static host that permits commercial use.
3. Open the site, expand Connection setup, enter URL and anon/public key.
4. Create the administrator login in Supabase Authentication.
5. Provision an active public.profiles record for that user's auth UUID.
6. Configure and test RLS policies before enabling live records.

Never put a Supabase service_role or secret key in browser code.
The site is not yet deployed and has no public GORA URL.
Not yet included: data-entry forms, secure approval RPC, automatic installment
schedules, partial-payment allocation, staff invitation, M-Pesa, SMS, backups,
or full accounting/reconciliation.
