# Content Security Policy hardening

Date: 2026-09-21

This review covers the browser-facing security headers in `next.config.ts`
and the client features that would be affected by CSP enforcement.

## Result

Production now emits an enforced `Content-Security-Policy` header.

Development keeps `Content-Security-Policy-Report-Only` so the Next.js
development overlay and HMR can report policy conflicts without making local
development unusable.

## Production policy

The production policy is intentionally compatible with the features currently
implemented by wacrm:

- scripts: same-origin plus inline scripts required by Next.js hydration;
- `unsafe-eval`: **not allowed in production**;
- styles: same-origin plus inline styles used by Tailwind/UI components;
- images: same-origin, `data:`, `blob:`, and HTTPS contact/media URLs;
- media: same-origin, `blob:`, and HTTPS URLs;
- fonts: same-origin and `data:`;
- network connections: same-origin, HTTPS, and Supabase realtime WSS;
- workers: same-origin and `blob:` for browser audio encoding;
- objects and frames: blocked;
- framing by other sites: blocked;
- base URL rewriting: limited to self;
- form submissions: limited to self.

## Why some directives remain broad

### `script-src 'unsafe-inline'`

The root layout contains a small inline theme bootstrap script and Next.js
itself emits inline bootstrap/hydration code. Removing `unsafe-inline` safely
requires request-level CSP nonces propagated through the App Router. That is a
separate architectural change and is not being mixed into this hardening pass.

### `style-src 'unsafe-inline'`

The UI uses inline style attributes for dynamic colors and component state.
Removing this would require refactoring those render paths or adopting a nonce/
hash strategy for styles.

### `img-src https:` and `media-src https:`

Contact avatars and message media can reference external HTTPS URLs by design.
Restricting these directives to Supabase would break valid existing data.

### `connect-src https:`

The browser-side media download helper can fetch an arbitrary HTTPS
`media_url` stored on a message. Limiting connect-src to Supabase alone would
break those downloads. Server-side Meta API calls are still not exposed by this
directive because they do not run in the browser.

## Voice-note compatibility

The inbox voice recorder lazy-loads `opus-recorder` and uses the vendored
same-origin worker at `/opus/encoderWorker.min.js`. The policy therefore
includes:

```text
worker-src 'self' blob:
```

The existing Permissions Policy continues to allow microphone access only to
same-origin content:

```text
microphone=(self)
```

Camera, geolocation, payment, and USB remain denied.

## Additional browser protections

The enforced header set also retains:

- HSTS for HTTPS deployments;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- restrictive Permissions Policy.

The CSP additionally adds:

- `object-src 'none'`;
- `frame-src 'none'`.

## Remaining CSP improvement

The next CSP maturity step would be nonce-based scripts so
`'unsafe-inline'` can be removed. That should be treated as a dedicated change
because it requires request middleware/header nonce generation and propagation
through the root layout.

For this hardening phase, production enforcement with `unsafe-eval` removed
provides materially stronger protection without intentionally breaking the
current application architecture.

## Verification requirement

CSP is configuration-sensitive and must still be exercised by the final CI and
manual smoke test. Before merging, verify at minimum:

- login/auth flows;
- dashboard navigation;
- Supabase reads/writes and realtime;
- external contact avatars;
- image/video/audio/document messages;
- media downloads;
- voice recording and upload;
- theme switching;
- template composer and normal message sending.

Any production CSP violation should be treated as a bug to understand rather
than immediately weakening the policy globally.
