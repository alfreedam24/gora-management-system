GORA MANAGEMENT SYSTEM — BUILD 2
This package redesigns the existing GORA starter interface in a responsive, blue/teal administration layout inspired by the reference screenshots.

Included:
- Existing Supabase email/password authentication and profile role check.
- Responsive navigation for the planned GORA modules.
- Live read-only dashboard metrics from the existing Supabase schema.
- Read-only record lists for existing tables/views.
- No sample financial records are inserted.

IMPORTANT:
This is a connected interface build, not a production-ready lending platform.
Several database policies/views still need security review. Some menu sections are read-only placeholders until secure forms and server-side transaction functions are built.
Do not use for real loan approvals, disbursements, repayments, or identity-document uploads yet.
Keep using the existing Supabase project and the public anon/publishable key only.
Do not enter or publish a service-role key.
Deployment is manual through the existing Cloudflare Pages/Workers project; this package does not deploy itself.

BUILD 3 ADDITION — CHAMA MANAGEMENT
- Add new chama form (name, location, meeting day, weekly/biweekly/monthly frequency, status).
- Add existing active member to selected chama with join date.
- Chama forms use existing chamas and chama_members tables.
- Apply GORA_Chama_Policies.sql in Supabase SQL Editor before using these write actions.
- The current schema has no meeting-frequency column; frequency is displayed in the form but is not saved yet. Add a column before relying on it.
