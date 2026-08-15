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

Deletion access is revoked immediately through `account_status` and Auth metadata. A trusted scheduled job or administrator invokes `finalizeDeletion` after `scheduled_for`.

## Release operations

1. Apply the compliance migration.
2. Deploy `compliance-operations` and the current `admin-operations` functions.
3. Host `legal/` on the academy HTTPS domain and replace `legal_documents.public_path` with absolute URLs.
4. Enter the hosted `delete-account.html` URL in Play Console and App Store Connect.
5. Configure report notifications from new `content_reports` rows to the safeguarding mailbox; the in-app queue remains authoritative.
6. Use a non-admin approved reviewer account and give reviewers the approval/access code in console review notes.

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

