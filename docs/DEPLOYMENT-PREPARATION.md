# Deployment Preparation

This checklist is for deploying the hardened WACRM fork without connecting a production WhatsApp number too early.

## Safety rule

Do not connect the agency's long-used WhatsApp number until the test environment has passed the full messaging checklist below. Use a test/new number first.

## 1. Supabase

Create a dedicated Supabase project for this WACRM instance.

Required values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Keep the service-role key server-side only.

Before applying migrations, check the hosted project's PostgreSQL major version and keep `supabase/config.toml` aligned with it.

Apply all migrations in filename order. The hardened consent schema is in `supabase/migrations/043_whatsapp_consent.sql`.

After migration, verify that `contacts` contains:

- `whatsapp_opt_in`
- `whatsapp_opt_in_at`
- `whatsapp_opt_in_source`
- `whatsapp_opt_in_evidence`
- `whatsapp_opt_out_at`

## 2. Application secrets

Required:

- `ENCRYPTION_KEY`: 64 hexadecimal characters / 32 random bytes.
- `META_APP_SECRET`: Meta App Secret used to verify inbound webhook signatures.

Recommended:

- `NEXT_PUBLIC_SITE_URL=https://your-hostname`
- `NEXT_PUBLIC_APP_LOCALE=es`
- `AUTOMATION_CRON_SECRET`: long random secret if Wait/cron automation features are used.

Never commit a real `.env.local`.

Run:

```bash
npm run preflight
```

The check validates presence and basic formatting without printing secret values.

## 3. Test deployment

Deploy over HTTPS before configuring Meta webhooks.

Smoke-test:

- login/logout
- contact CRUD
- tags
- conversations
- media rendering/download
- voice recording/upload
- theme switching
- template composer
- Supabase realtime
- browser console for CSP violations

## 4. WhatsApp test number

Use a test/new number first.

Verify, in this order:

1. inbound customer message reaches WACRM;
2. reply inside 24 hours succeeds;
3. free-form reply outside 24 hours is blocked locally;
4. template outside 24 hours is blocked without current opt-in;
5. approved template outside 24 hours succeeds only with current opt-in;
6. opt-out prevents proactive/template sending where consent is required;
7. broadcast rejects contacts without current opt-in;
8. broadcast resume/retry rechecks opt-in;
9. malformed or unverifiable service-window state fails closed.

## 5. n8n / AI

Start with a dedicated API key containing only:

- `messages:read`
- `messages:send`
- `contacts:read`
- `conversations:read`

Do not grant `contacts:write`, `contacts:consent`, or `broadcasts:send` until the workflow specifically requires and tests them.

Store the API key in n8n credentials, never inside workflow JSON, prompts, code, or Git.

## 6. Production-number gate

Before moving the agency's production number, require all of these:

- CI green on the deployed commit;
- hosted migration verification completed;
- HTTPS valid;
- webhook signature verification working;
- 24-hour tests passed;
- consent/opt-out tests passed;
- broadcast tests passed;
- n8n key is least-privilege;
- no production secrets committed to Git;
- backups/export plan documented.

Only after those checks should the production number be considered.
