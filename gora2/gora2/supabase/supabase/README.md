
# GORA 2.0 — Supabase

This folder contains database setup and migration files for GORA 2.0.

## Migration

`migrations/202611180001_gora20_operational_foundation.sql`

This migration adds the expense request table and ledger account balance view.

## Before applying

1. Open the Supabase SQL Editor.
2. Review the migration.
3. Confirm that the required existing tables and columns are present.
4. Back up the database before applying changes.

## Security

- Keep Row Level Security enabled.
- Never expose the service-role key in frontend code.
- Use the public publishable/anon key in the application.
