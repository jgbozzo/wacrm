import { describe, expect, it } from 'vitest';

import { hasValidWhatsAppOptIn } from './consent';

describe('hasValidWhatsAppOptIn', () => {
  it('fails closed for missing contact or missing explicit opt-in', () => {
    expect(hasValidWhatsAppOptIn(null)).toBe(false);
    expect(hasValidWhatsAppOptIn({})).toBe(false);
    expect(
      hasValidWhatsAppOptIn({
        whatsapp_opt_in: false,
        whatsapp_opt_in_at: '2026-09-21T12:00:00.000Z',
      })
    ).toBe(false);
  });

  it('requires a valid opt-in timestamp', () => {
    expect(
      hasValidWhatsAppOptIn({
        whatsapp_opt_in: true,
        whatsapp_opt_in_at: null,
      })
    ).toBe(false);
    expect(
      hasValidWhatsAppOptIn({
        whatsapp_opt_in: true,
        whatsapp_opt_in_at: 'not-a-date',
      })
    ).toBe(false);
  });

  it('accepts a valid opt-in with no later opt-out', () => {
    expect(
      hasValidWhatsAppOptIn({
        whatsapp_opt_in: true,
        whatsapp_opt_in_at: '2026-09-21T12:00:00.000Z',
        whatsapp_opt_out_at: null,
      })
    ).toBe(true);
  });

  it('rejects consent when the opt-out is equal to or later than opt-in', () => {
    expect(
      hasValidWhatsAppOptIn({
        whatsapp_opt_in: true,
        whatsapp_opt_in_at: '2026-09-21T12:00:00.000Z',
        whatsapp_opt_out_at: '2026-09-21T12:00:00.000Z',
      })
    ).toBe(false);
    expect(
      hasValidWhatsAppOptIn({
        whatsapp_opt_in: true,
        whatsapp_opt_in_at: '2026-09-21T12:00:00.000Z',
        whatsapp_opt_out_at: '2026-09-21T13:00:00.000Z',
      })
    ).toBe(false);
  });

  it('accepts a re-opt-in recorded after the previous opt-out', () => {
    expect(
      hasValidWhatsAppOptIn({
        whatsapp_opt_in: true,
        whatsapp_opt_in_at: '2026-09-21T14:00:00.000Z',
        whatsapp_opt_out_at: '2026-09-21T13:00:00.000Z',
      })
    ).toBe(true);
  });
});
