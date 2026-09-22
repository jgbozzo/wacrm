# Public API tenancy audit

This document records the account-isolation review of every route under
`src/app/api/v1` on the `security-hardening` branch.

## Threat model

Public API requests authenticate with an API key and then use the Supabase
service-role client. Service role bypasses row-level security, so the API key's
resolved `accountId` must be treated as a mandatory tenancy boundary in every
read and write path.

A foreign resource id must never expose, update, delete, or send through another
account.

## Routes reviewed

| Route | Methods | Scope | Tenancy result |
| --- | --- | --- | --- |
| `/api/v1/me` | GET | valid key | Account id comes only from the resolved API key; account-name lookup is by that id. |
| `/api/v1/messages` | POST | `messages:send` | Contact/conversation resolution is account-scoped; shared send core re-verifies the conversation account. |
| `/api/v1/contacts` | GET, POST | `contacts:read/write` | Lists/find-or-create operations are scoped by `account_id`. |
| `/api/v1/contacts/{id}` | GET, PATCH | `contacts:read/write` | Foreign ids return 404; scalar, consent and tag mutations are account-gated. |
| `/api/v1/conversations` | GET | `conversations:read` | Base query is filtered by `account_id`. |
| `/api/v1/conversations/{id}` | GET | `conversations:read` | Lookup requires both id and `account_id`. |
| `/api/v1/conversations/{id}/messages` | GET | `messages:read` | Parent conversation is first verified against `account_id`; messages have no independent account column and are then constrained by that verified conversation id. |
| `/api/v1/broadcasts` | POST | `broadcasts:send` | Config, contacts and broadcast creation are account-scoped; delivery plans now carry account context. |
| `/api/v1/broadcasts/{id}` | GET | `broadcasts:send` | Lookup requires both id and `account_id`. |
| `/api/v1/webhooks` | GET, POST | `webhooks:manage` | List and insert are bound to the key's account. |
| `/api/v1/webhooks/{id}` | GET, PATCH, DELETE | `webhooks:manage` | Every operation requires both id and `account_id`; foreign ids return 404. |

Total reviewed: **11 route files / 16 HTTP method handlers**.

## Defense-in-depth changes made during the audit

The review did not find a route that directly returned another account's data,
but it did identify several child/helper writes that relied on an id previously
obtained from an account-scoped parent query. Those were tightened so accidental
future call-site changes cannot silently weaken tenancy:

- `setContactTags` now verifies that the parent contact belongs to the account
  before reading/deleting/inserting rows in `contact_tags`, which has no
  `account_id` column of its own.
- Existing-contact name updates in `resolve-conversation.ts` now include
  `account_id`.
- Contact phone correction and conversation summary updates in
  `send-message.ts` now include `account_id`.
- `BroadcastPlan` now carries `accountId`.
- Broadcast-recipient delivery updates are constrained by both recipient id and
  broadcast id.
- Broadcast finalization now constrains the parent update by both broadcast id
  and `account_id`.

## Parent-gated child tables

Some tables intentionally do not carry `account_id` themselves. For those
tables, isolation is enforced by resolving a parent resource under the API key's
account before querying the children.

Current examples:

- `messages` → gated through an account-scoped `conversations` row.
- `contact_tags` → gated through an account-scoped `contacts` row.
- `broadcast_recipients` → operated on only through a broadcast plan created
  or resumed from an account-scoped `broadcasts` row.

This pattern is acceptable only while the parent gate remains mandatory. New
public API endpoints should prefer tables with an explicit `account_id` where
practical, and otherwise follow the same parent-verification pattern.

## Additional compliance issue found while tracing the message endpoint

The tenancy audit also exposed a separate compliance bypass: an approved
template sent through the generic message path could previously bypass the
broadcast opt-in guard when the 24-hour service window was closed.

That path is now guarded as follows:

- free-form text/media/interactive messages require an open 24-hour customer
  service window;
- a template outside that window requires a current explicit WhatsApp opt-in;
- automation template sends apply the same rule;
- broadcast templates already require explicit opt-in for every recipient.

This is intentionally stricter than relying on Meta to reject a request after it
has already left wacrm.

## Result

No known cross-account read/write path remains in the reviewed `/api/v1`
surface after the hardening above.

This is a source-code audit, not a substitute for the pending runtime test suite.
The next verification stage must run lint, TypeScript typecheck, unit tests,
migration replay, and production build before merging `security-hardening`.
