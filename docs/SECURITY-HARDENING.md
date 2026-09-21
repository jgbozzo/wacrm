# Security Hardening Plan

This document records the security and WhatsApp/Meta compliance hardening work for the `security-hardening` branch.

## Scope

The goal is to reduce the risk of accidental policy violations, credential exposure, unsafe automation, and unintended messaging while preserving the existing official WhatsApp Cloud API integration.

## Baseline verified

The current codebase already includes several strong controls:

- Official WhatsApp Cloud API integration through Meta Graph API.
- HMAC-SHA256 verification of inbound Meta webhook signatures.
- Fail-closed behavior when `META_APP_SECRET` is missing.
- AES-256-GCM encryption for stored WhatsApp access tokens and other sensitive secrets.
- API keys stored as hashes and protected by explicit scopes.
- MCP write operations disabled by default unless explicitly enabled.
- Separate broadcast guard for MCP.
- Account-scoped queries in the critical public API paths reviewed so far.
- Per-key and per-user in-memory rate limiting.
- Security headers including HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy and CSP report-only mode.

## Main gaps identified

### 1. WhatsApp consent / opt-in

Broadcast creation currently validates recipient phone numbers, templates and deduplication, but does not require a stored opt-in record for each recipient.

Planned additions:

- `whatsapp_opt_in`
- `whatsapp_opt_in_at`
- `whatsapp_opt_in_source`
- `whatsapp_opt_in_evidence`
- `whatsapp_opt_out_at`

A new migration will add these fields without modifying historical migrations.

### 2. Broadcast enforcement

`src/lib/whatsapp/broadcast-core.ts` must reject or exclude recipients that do not have valid recorded WhatsApp consent.

The compliance check must live in shared broadcast logic so it also protects API, dashboard, n8n and AI-driven workflows.

### 3. Customer service window enforcement

`src/lib/whatsapp/send-message.ts` currently relies on Meta to reject free-form messages sent outside the customer service window.

A local guard should be added so non-template sends are blocked before reaching Meta when the most recent qualifying inbound customer interaction is outside the allowed service window.

The guard should be implemented in the shared send core so it applies consistently to:

- Dashboard sends
- Public API sends
- n8n
- MCP
- AI automation

### 4. Opt-out handling

A recorded opt-out must prevent future marketing/broadcast messaging until a valid new opt-in is recorded.

### 5. Public API tenancy review

The public API uses a Supabase service-role client and therefore bypasses RLS. Every endpoint must explicitly constrain queries by `accountId`.

Critical paths reviewed so far do this correctly. A complete endpoint-by-endpoint audit is still pending.

### 6. Content Security Policy

The current CSP is configured as `Content-Security-Policy-Report-Only`.

After validating all routes and legitimate resources, it should be evaluated for enforcement as `Content-Security-Policy`.

### 7. Rate limiting

The current limiter is in-memory and per process.

This is acceptable for a single-instance deployment. Multi-instance or horizontally scaled deployments should replace it with a shared store such as Redis/Upstash.

### 8. Meta Graph API version

`src/lib/whatsapp/meta-api.ts` currently pins a Graph API version.

This version must be reviewed against Meta's current supported versions before changing it. No version bump should be made without checking breaking changes.

## Files reviewed

- `.env.local.example`
- `package.json`
- `next.config.ts`
- `docs/public-api.md`
- `mcp-server/README.md`
- `src/app/api/v1/messages/route.ts`
- `src/app/api/v1/broadcasts/route.ts`
- `src/app/api/whatsapp/send/route.ts`
- `src/app/api/whatsapp/webhook/route.ts`
- `src/lib/auth/api-context.ts`
- `src/lib/rate-limit.ts`
- `src/lib/whatsapp/send-message.ts`
- `src/lib/whatsapp/broadcast-core.ts`
- `src/lib/whatsapp/encryption.ts`
- `src/lib/whatsapp/webhook-signature.ts`
- `src/lib/whatsapp/meta-api.ts`
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/028_webhook_endpoints.sql`

## Planned implementation order

1. ✅ Add consent fields in a new Supabase migration.
2. ✅ Add contact-level opt-in/opt-out read/write support.
3. ✅ Enforce consent in broadcast creation and resume paths.
4. Add service-window enforcement in the shared send core.
5. Review all `/api/v1` endpoints for explicit account scoping.
6. Review MCP/n8n permissions and least-privilege defaults.
7. Review and update dependencies.
8. Evaluate CSP enforcement.
9. Run typecheck, tests and production build.
10. Open a pull request from `security-hardening` to `main` only after review.

## Change log

### 2026-09-21

- Created this hardening plan.
- Added `supabase/migrations/041_whatsapp_consent.sql`.
- Existing contacts default to `whatsapp_opt_in = false`; contact existence/import never implies consent.
- Added public API read/write support for opt-in/opt-out.
- Opt-in requires an explicit source and receives a server-side timestamp.
- Opt-out receives a server-side timestamp while prior opt-in metadata is retained as audit history.
- Added consent fields to the shared `Contact` type and public API documentation.
- Broadcast enforcement is now active in both the public API and dashboard send paths.
- Broadcast recipients must resolve to an existing same-account contact with a current explicit opt-in.
- Raw broadcast phone lists no longer auto-create contacts.
- Resume/retry re-checks consent so a later opt-out cannot be bypassed.
- Public API responses now distinguish invalid-number rejections from missing/withdrawn-consent rejections.
- Added unit coverage for consent validation.
- Service-window enforcement for non-template sends is still pending.
