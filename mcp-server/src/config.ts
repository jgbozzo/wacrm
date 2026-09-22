// ============================================================
// Configuration — read once at startup from the environment.
//
// The server needs the URL of a wacrm instance and an API key.
// Two opt-in flags decide whether write / broadcast tools are
// registered at all: by default the server is READ-ONLY, so an
// MCP client can never see a tool that mutates data or sends a
// message unless the operator turns it on deliberately. The API
// key's own scopes are still enforced server-side on top of this —
// this is a second, client-side guard, not a replacement.
// ============================================================

export interface Config {
  baseUrl: string;
  apiKey: string;
  enableWrites: boolean;
  enableMessages: boolean;
  enableBroadcasts: boolean;
}

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function loadConfig(): Config {
  const baseUrlRaw = process.env.WACRM_BASE_URL?.trim();
  const apiKey = process.env.WACRM_API_KEY?.trim();

  const missing: string[] = [];
  if (!baseUrlRaw) missing.push('WACRM_BASE_URL');
  if (!apiKey) missing.push('WACRM_API_KEY');
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Set WACRM_BASE_URL to your instance URL (e.g. https://crm.example.com) ` +
        `and WACRM_API_KEY to a key from Settings → API keys.`,
    );
  }

  // Normalise: strip a trailing slash so path joins are predictable.
  const baseUrl = baseUrlRaw!.replace(/\/+$/, '');
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error(`WACRM_BASE_URL must be an absolute URL (got "${baseUrl}").`);
  }

  const isLoopback =
    parsedBaseUrl.hostname === 'localhost' ||
    parsedBaseUrl.hostname === '127.0.0.1' ||
    parsedBaseUrl.hostname === '[::1]';

  if (parsedBaseUrl.protocol !== 'https:' && !(parsedBaseUrl.protocol === 'http:' && isLoopback)) {
    throw new Error(
      'WACRM_BASE_URL must use https://. Plain http:// is allowed only for localhost/loopback development.',
    );
  }

  const enableWrites = truthy(process.env.WACRM_ENABLE_WRITES);
  const enableMessages = truthy(process.env.WACRM_ENABLE_MESSAGES);
  const enableBroadcasts = truthy(process.env.WACRM_ENABLE_BROADCASTS);

  return {
    baseUrl,
    apiKey: apiKey!,
    enableWrites,
    enableMessages,
    enableBroadcasts,
  };
}
