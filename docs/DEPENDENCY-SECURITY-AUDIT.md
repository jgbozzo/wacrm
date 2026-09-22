# Dependency security audit

Date: 2026-09-21

This audit reviews the dependency versions pinned or resolved by the root
application and the `mcp-server` package on the `security-hardening` branch.

The goal is not to chase every newest release. Security patches are preferred
while avoiding unrelated upgrades that increase regression risk.

## Findings

### Next.js

Declared and locked version: `next 16.3.5`.

Recent Next.js advisories relevant to the 16.x line include:

- GHSA-p9j2-gv94-2wf4 — SSRF in dynamic rewrite/redirect destinations,
  patched in 16.2.11.
- GHSA-m99w-x7hq-7vfj — App Router Server Action denial of service,
  patched in 16.2.11.
- GHSA-p293-qw3h-jr36 — unauthenticated RCE on Windows-hosted servers,
  patched in 16.3.3.
- GHSA-2xp9-vwfh-vxw4 — Image Optimization / AVIF RCE exposure,
  patched in 16.3.3.

The repository's `16.3.5` is above those patched versions, so no Next.js
version change is required for these advisories.

`eslint-config-next` remains pinned to the matching `16.3.5`.

### React

Declared and locked versions:

- `react 19.2.4`
- `react-dom 19.2.4`

Recent React Server Components advisories name the
`react-server-dom-webpack`, `react-server-dom-turbopack`, and
`react-server-dom-parcel` packages, not the base `react` package. The current
lockfile does not contain standalone `node_modules/react-server-dom-*` entries.

Because Next.js is already on a framework release newer than the relevant
Next.js security patches, this audit does not make an isolated React version
change without a lockfile-resolved compatibility reason. CI audit/build remains
the runtime verification gate.

### MCP TypeScript SDK

The manifest previously allowed `@modelcontextprotocol/sdk ^1.18.0`.

That range includes versions affected by:

- GHSA-w48q-cv73-mx4w — DNS rebinding protection issue, fixed in 1.24.0.
- GHSA-345p-7cg4-v4c7 — cross-client response-data leak when server/transport
  instances are reused, fixed in 1.26.0.

The existing lockfile already resolved the SDK to `1.30.0`, but the declared
minimum was too old. The manifest and lockfile root metadata now require
`^1.30.0`, preventing a future install from accepting those old vulnerable
versions.

The MCP server uses stdio transport, so the HTTP transport-specific advisories
were not directly exposed by its current architecture; raising the dependency
floor is still the correct defense-in-depth action.

### fast-uri

The root project uses an npm override for `fast-uri`. Recent 2026 advisories
included multiple URL host-confusion and SSRF issues.

The resolved lockfile version is `3.1.7`, which contains the fixes for the
high-severity advisories published through 2026-09-02. The override floor was
raised from `^3.1.6` to `^3.1.7`.

### sharp

Resolved version: `0.35.4`.

GHSA-rgj7-g3m4-5g8c identifies versions before 0.35.4 as affected by libheif
issues that can be relevant when processing untrusted AVIF input. The current
lockfile is on the patched `0.35.4` release.

### PostCSS

Resolved version: `8.5.24`.

The root override requires at least `8.5.10`, which is the patched baseline
for GHSA-qx2v-qp2m-jg93. The resolved version is newer than that baseline.

### Hono

Resolved version: `4.13.7`.

The project already carries a security-oriented Hono override. The resolved
version is newer than the 4.13.5 release that included several security fixes.
No forced major-version upgrade is introduced.

### Supabase

Declared `@supabase/supabase-js ^2.107.0`.

No security finding in this audit requires a Supabase upgrade. In addition,
Supabase's 2.110.0 changelog notes dropping Node.js 20 support, while wacrm
currently declares Node >=20 and CI runs Node 20. A routine upgrade to that
line would therefore change the runtime support contract and is deferred until
Node support is reviewed deliberately.

## CI hardening

The main CI workflow now adds:

- `npm audit --audit-level=high` for the root application;
- a separate MCP job using `mcp-server/package-lock.json`;
- MCP `npm audit --audit-level=high`;
- MCP TypeScript typecheck;
- MCP production build.

The workflow still runs on pull requests to `main` and pushes to `main`.
It has not yet been used to merge anything from `security-hardening`.

## Result

Manual dependency/advisory review is complete for the security-critical
framework and integration packages identified above.

Changes made in this phase:

- raised `@modelcontextprotocol/sdk` minimum to `^1.30.0`;
- raised the root `fast-uri` override minimum to `^3.1.7`;
- added high-severity npm audit gates for both the main application and MCP
  package;
- added MCP typecheck/build to CI.

No broad dependency refresh was performed. Remaining verification is the
runtime CI stage: install from lockfiles, audit, lint, typecheck, tests,
migration validation, and production builds before merge.
