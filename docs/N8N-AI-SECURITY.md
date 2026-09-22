# n8n and AI integration safety

This guide defines the recommended least-privilege setup for connecting n8n,
AI agents, or other automation platforms to wacrm's public API.

The core rule is simple: **use separate API keys for separate jobs**. Do not
give one long-lived automation key every available scope.

## Recommended key profiles

### 1. Read-only assistant / reporting workflow

Use only:

- `contacts:read`
- `conversations:read`
- `messages:read`
- optionally `broadcasts:read`

This profile can inspect CRM state but cannot contact customers, mutate
contacts, record consent, or launch broadcasts.

### 2. Conversational responder

Use:

- `messages:send`
- normally `messages:read`
- normally `conversations:read`
- optionally `contacts:read`

Do **not** add `broadcasts:send`, `contacts:write`, or
`contacts:consent` unless the workflow genuinely needs them.

The wacrm send core still enforces the 24-hour customer-service window for
free-form messages. Out-of-window templates require current recorded opt-in.

### 3. Contact synchronization

Use:

- `contacts:read`
- `contacts:write`

This key can create/update contact data but cannot record WhatsApp consent.
That separation is deliberate: importing a phone number is not proof of
permission to message it.

### 4. Consent capture workflow

Use a dedicated, tightly controlled key with:

- `contacts:read`
- `contacts:write`
- `contacts:consent`

Only a workflow that receives verifiable consent evidence should have
`contacts:consent`. General-purpose AI agents should not receive this scope.

Recommended evidence sources include a form submission id, checkout record,
signed form reference, or another auditable event. Do not infer opt-in from a
contact existing in the CRM or from a purchased/imported phone list.

### 5. Broadcast workflow

Use a dedicated key with:

- `broadcasts:send`
- optionally `broadcasts:read`

Do not reuse a general chatbot key for broadcasts.

Every broadcast recipient is checked against the contact's recorded WhatsApp
opt-in before Meta is called. Invalid numbers and contacts without current
consent are rejected.

## n8n workflow design

Keep credentials in n8n's credential store or secret mechanism, never in a
Code node, workflow export, Git repository, prompt, or chat transcript.

Recommended workflow layout:

1. Trigger receives or retrieves the event.
2. Normalize and validate the input.
3. Resolve the CRM/contact state with a read-only request where possible.
4. Apply explicit business rules.
5. Call the smallest-capability write endpoint required.
6. Record the outcome and API error code.
7. Stop on `403 forbidden`, `409 customer_service_window_closed`,
   `409 whatsapp_opt_in_required`, or any unexpected 5xx instead of trying
   to bypass the guard with another endpoint.

Do not automatically add a broader scope when an API call returns
`forbidden`. Treat that response as a configuration decision for a human
administrator.

## AI agent rules

An AI agent should normally start with read-only credentials. If message
sending is enabled, keep broadcast and consent credentials in separate
workflows that the agent cannot call directly.

For MCP, wacrm adds additional process-level gates:

- contact writes require `WACRM_ENABLE_WRITES=true`;
- single-message sending additionally requires
  `WACRM_ENABLE_MESSAGES=true`;
- broadcasts require `WACRM_ENABLE_BROADCASTS=true`;
- message and broadcast tools require `confirm=true`;
- MCP contact tools do not expose opt-in/opt-out mutation.

These gates supplement API scopes; they do not replace them.

## Transport security

Use `https://` for all remote wacrm API calls. Do not send a
`wacrm_live_...` API key over plaintext HTTP.

The MCP server enforces HTTPS for remote `WACRM_BASE_URL` values and permits
plain HTTP only for localhost/loopback development.

For n8n, configure the HTTP Request credential/header against the final HTTPS
wacrm URL rather than relying on redirects.

## Key lifecycle

Create a separate key for each production workflow and name it after that
workflow, for example:

- `n8n-inbox-readonly`
- `n8n-tourism-responder`
- `n8n-contact-sync`
- `n8n-consent-form`
- `n8n-broadcast-operator`

Revoke a key immediately if the workflow is retired, a credential is exposed,
or the integration changes ownership. Prefer creating a new narrowly scoped
key instead of expanding an existing broad key.

## Production recommendation

For an AI responder, the recommended starting permissions are:

```text
messages:read
messages:send
contacts:read
conversations:read
```

Do not add `contacts:write`, `contacts:consent`, or
`broadcasts:send` until the corresponding workflow has been designed,
tested, and separately approved.
