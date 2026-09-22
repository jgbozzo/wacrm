# MCP server

wacrm ships a [Model Context Protocol](https://modelcontextprotocol.io)
server so you can drive your CRM from AI assistants — Claude Desktop,
Claude Code, Cursor, and any other MCP client — in natural language:

> "How many conversations are still open today?"
> "Show the last five messages with +1 415 555 0123."
> "Send the `order_update` template to that contact."

It lives in [`mcp-server/`](../mcp-server) and is published to npm as
[`wacrm-mcp`](https://www.npmjs.com/package/wacrm-mcp). Under the hood
it's a thin wrapper over the [public API](./public-api.md), so every
request is authenticated and scoped by your instance exactly like any
other API call.

## Quick start

1. Create an API key in the dashboard: **Settings → API keys**. Grant
   only the scopes your assistant needs (a read-only assistant only
   needs the `*:read` scopes).
2. Add the server to your MCP client config:

   ```jsonc
   {
     "mcpServers": {
       "wacrm": {
         "command": "npx",
         "args": ["-y", "wacrm-mcp"],
         "env": {
           "WACRM_BASE_URL": "https://crm.example.com",
           "WACRM_API_KEY": "wacrm_live_xxxxxxxxxxxxxxxxxxxxxxxx"
         }
       }
     }
   }
   ```

That's **read-only** — the safe default. Side effects are split into
separate gates:

- `WACRM_ENABLE_WRITES=true` exposes contact create/update tools.
- `WACRM_ENABLE_MESSAGES=true` additionally exposes single-message
  sending and requires `WACRM_ENABLE_WRITES=true`.
- `WACRM_ENABLE_BROADCASTS=true` exposes mass broadcasts and also
  requires `WACRM_ENABLE_WRITES=true`.

## What it exposes

- **Reads (always on):** `whoami`, contacts (list/get), conversations
  (list/get), messages (list), broadcast status.
- **Contact writes (opt-in):** create/update a contact.
- **Single-message sending (separate opt-in):** send text/template/media;
  requires an explicit `confirm=true`.
- **Broadcasts (separate opt-in):** launch a template broadcast; requires
  `confirm=true` and is marked destructive.

## Safety

Because sending WhatsApp messages is a real side effect, the server is
**read-only until you opt in**, layered on top of the API key's own
scopes. Contact mutation, single-message sending, and broadcasts have
separate gates.

The MCP contact tools intentionally do **not** expose WhatsApp consent
fields. If an external workflow must record opt-in/opt-out, use a
separate API key with the dedicated `contacts:consent` scope and keep
that key out of general-purpose AI agents.

Remote MCP connections must use an `https://` wacrm base URL; plain
HTTP is allowed only for localhost/loopback development. See the
[server README](../mcp-server/README.md) for the full tool list and
safety model.
