/**
 * WhatsApp consent helpers shared by every proactive/broadcast send path.
 *
 * Contact existence, a phone number, a prior conversation, or an approved
 * template are never treated as proof of consent. A contact is eligible for
 * proactive messaging only when the explicit consent state added by
 * migration 041 is internally valid.
 */

export interface WhatsAppConsentState {
  whatsapp_opt_in?: unknown;
  whatsapp_opt_in_at?: unknown;
  whatsapp_opt_out_at?: unknown;
}

/**
 * Return true only for a currently-valid explicit opt-in.
 *
 * Defense in depth: migration 041 enforces the same timestamp ordering at
 * the database layer, but send paths re-check it so malformed legacy/imported
 * rows fail closed instead of reaching Meta.
 */
export function hasValidWhatsAppOptIn(
  contact: WhatsAppConsentState | null | undefined
): boolean {
  if (!contact || contact.whatsapp_opt_in !== true) return false;

  const optInAt =
    typeof contact.whatsapp_opt_in_at === 'string'
      ? Date.parse(contact.whatsapp_opt_in_at)
      : Number.NaN;
  if (!Number.isFinite(optInAt)) return false;

  if (contact.whatsapp_opt_out_at == null) return true;
  if (typeof contact.whatsapp_opt_out_at !== 'string') return false;

  const optOutAt = Date.parse(contact.whatsapp_opt_out_at);
  if (!Number.isFinite(optOutAt)) return false;

  return optInAt > optOutAt;
}
