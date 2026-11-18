
-- GORA 2.0 operational foundation
-- Additive migration: does not delete existing records.

create table if not exists public.gora_expense_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  category text not null,
  description text,
  payment_method text not null
    check (payment_method in ('CASH','MPESA','BANK','OTHER')),
  reference_number text,
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  requested_by uuid not null references auth.users(id),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.gora_expense_requests enable row level security;

create policy "gora_expense_requests_staff_read"
on public.gora_expense_requests
for select to authenticated
using (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.is_active = true
  )
);

create policy "gora_expense_requests_staff_insert"
on public.gora_expense_requests
for insert to authenticated
with check (
  requested_by = auth.uid()
  and status = 'PENDING'
  and decided_by is null
  and decided_at is null
  and organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.is_active = true
  )
);

grant select, insert on public.gora_expense_requests to authenticated;

create or replace view public.gora_ledger_account_balances
with (security_invoker = true)
as
select
  fa.organization_id,
  fa.id as account_id,
  fa.account_code,
  fa.account_name,
  fa.account_type,
  coalesce(sum(jl.debit),0) as total_debits,
  coalesce(sum(jl.credit),0) as total_credits,
  case
    when fa.normal_balance = 'DEBIT'
      then coalesce(sum(jl.debit - jl.credit),0)
    else coalesce(sum(jl.credit - jl.debit),0)
  end as account_balance
from public.financial_accounts fa
left join public.journal_lines jl
  on jl.account_id = fa.id
left join public.journal_entries je
  on je.id = jl.journal_entry_id
  and je.status = 'POSTED'
group by
  fa.organization_id,
  fa.id,
  fa.account_code,
  fa.account_name,
  fa.account_type,
  fa.normal_balance;

grant select on public.gora_ledger_account_balances to authenticated;
