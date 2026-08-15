# PTA compliance release runbook

## Moderation ownership

- Primary reviewer: the designated PTA administrator/safeguarding lead.
- Standard reports: acknowledge and review within 48 hours.
- Child-safety, exploitation, credible threats, or imminent harm: preserve access-limited evidence and escalate immediately to the safeguarding lead and appropriate authorities. Do not wait for the standard queue.
- Only administrators may hide/remove messages, warn/suspend users, or finalize deletion.
- Reports are visible only to their reporter and administrators. Reported users are never shown reports against them.
- Moderation evidence and consent logs are retained only as necessary, with a target maximum of 24 months unless a safeguarding or legal hold applies.

## Deletion inventory

| Data | Treatment |
|---|---|
| Supabase Auth, name, email | Deleted after 14-day recovery window |
| Group chat | Sender anonymized as “Deleted member” |
| Solely owned uploads | Deleted |
| Reports/consent | Minimized; retain up to 24 months when required |
| Provider logs/backups | Disclose target expiry within 90 days |

Deletion access is revoked immediately through `account_status` and Auth metadata. `pg_cron` dispatches the compliance function every ten minutes; due requests use resumable checkpoints and exponential retry, with terminal failures recorded after ten attempts.

## Release operations

1. Apply all compliance migrations, including `202608150004_compliance_reliability_private_storage.sql`.
2. Confirm the migration created Vault secrets named `project_url` and `compliance_cron_secret`; the random scheduler secret never leaves Vault.
3. Deploy `compliance-operations` with gateway JWT verification disabled; the function verifies `x-cron-secret` against Vault for `processDueDeletions` and verifies user JWTs itself for every user/admin action.
4. Confirm `pta_uploads` is private and the `approved members read PTA media` SELECT policy exists.
5. Host `legal/` on the academy HTTPS domain and replace `legal_documents.public_path` with absolute URLs.
6. Enter the hosted `delete-account.html` URL in Play Console and App Store Connect.
7. Configure report and terminal deletion-failure notifications to the safeguarding mailbox; the database queues remain authoritative.
8. Use a non-admin approved reviewer account and give reviewers the approval/access code in console review notes.

## Play/App Store data declaration worksheet

| Data | Collected | Shared/processor | Required | Purpose | Retention |
|---|---|---|---|---|---|
| Name | Yes | Supabase service provider | Yes | Account/community identity | Account life + 14 days |
| Email | Yes | Supabase service provider | Yes | Authentication/admin contact | Account life + 14 days |
| Messages | Optional | Approved PTA members; Supabase | No | Community communication | Account life; sender anonymized on deletion |
| Photos/videos/documents | Optional | Approved PTA members; Supabase | No | Noticeboard | Until owner/content deletion |
| Reports | Optional | PTA admins; Supabase | No | Safety/moderation | Up to 24 months unless legal hold |
| Consent records | Yes before posting | Supabase | Yes for UGC | Compliance evidence | Up to 24 months where necessary |
| Biometrics | No | Device OS only | Device security required | Local authentication | PTA stores no templates |
| Diagnostics | Verify before submission | Platform/SDK dependent | N/A | Stability/security | Provider-specific |

Supabase service-provider processing must still be disclosed accurately even where a store’s “shared” exception applies.
