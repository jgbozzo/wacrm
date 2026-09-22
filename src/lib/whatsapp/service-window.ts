import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Meta's customer service window is 24 hours from the customer's most
 * recent inbound message. Free-form text, media and interactive messages
 * are allowed only while that window is open; approved templates are the
 * mechanism for messaging outside it.
 */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CustomerServiceWindowStatus {
  open: boolean;
  lastInboundAt: string | null;
  closesAt: string | null;
}

/**
 * Pure boundary check, exported for unit tests.
 *
 * The window is closed at exactly 24 hours. Invalid/missing timestamps
 * fail closed.
 */
export function isWithinCustomerServiceWindow(
  lastInboundAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastInboundAt) return false;
  const inboundMs = Date.parse(lastInboundAt);
  if (!Number.isFinite(inboundMs)) return false;
  const age = now.getTime() - inboundMs;
  return age >= 0 && age < CUSTOMER_SERVICE_WINDOW_MS;
}

/**
 * Resolve the current service-window state for one conversation.
 *
 * Because some callers use Supabase's service-role client (which bypasses
 * RLS), the conversation is explicitly verified against accountId before
 * the message query. Only messages with sender_type='customer' open/renew
 * the window; outbound agent/bot messages never extend it.
 *
 * Database errors throw. Callers should fail closed rather than sending
 * free-form content when window state cannot be established.
 */
export async function getCustomerServiceWindowStatus(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  now: Date = new Date()
): Promise<CustomerServiceWindowStatus> {
  const { data: conversation, error: conversationError } = await db
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (conversationError) {
    throw new Error(
      `Failed to verify conversation for service-window check: ${conversationError.message}`
    );
  }
  if (!conversation) {
    throw new Error('Conversation not found for service-window check');
  }

  const { data: inbound, error: inboundError } = await db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inboundError) {
    throw new Error(
      `Failed to read inbound history for service-window check: ${inboundError.message}`
    );
  }

  const lastInboundAt =
    typeof inbound?.created_at === 'string' ? inbound.created_at : null;

  if (!lastInboundAt || !isWithinCustomerServiceWindow(lastInboundAt, now)) {
    const parsed = lastInboundAt ? Date.parse(lastInboundAt) : Number.NaN;
    return {
      open: false,
      lastInboundAt,
      closesAt: Number.isFinite(parsed)
        ? new Date(parsed + CUSTOMER_SERVICE_WINDOW_MS).toISOString()
        : null,
    };
  }

  const inboundMs = Date.parse(lastInboundAt);
  return {
    open: true,
    lastInboundAt,
    closesAt: new Date(inboundMs + CUSTOMER_SERVICE_WINDOW_MS).toISOString(),
  };
}
