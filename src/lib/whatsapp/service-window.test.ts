import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_SERVICE_WINDOW_MS,
  isWithinCustomerServiceWindow,
} from './service-window';

describe('isWithinCustomerServiceWindow', () => {
  const now = new Date('2026-09-21T21:00:00.000Z');

  it('fails closed without a usable inbound timestamp', () => {
    expect(isWithinCustomerServiceWindow(null, now)).toBe(false);
    expect(isWithinCustomerServiceWindow('not-a-date', now)).toBe(false);
  });

  it('is open for an inbound message less than 24 hours old', () => {
    const inbound = new Date(
      now.getTime() - CUSTOMER_SERVICE_WINDOW_MS + 1
    ).toISOString();
    expect(isWithinCustomerServiceWindow(inbound, now)).toBe(true);
  });

  it('closes at exactly 24 hours', () => {
    const inbound = new Date(
      now.getTime() - CUSTOMER_SERVICE_WINDOW_MS
    ).toISOString();
    expect(isWithinCustomerServiceWindow(inbound, now)).toBe(false);
  });

  it('rejects a timestamp in the future', () => {
    const inbound = new Date(now.getTime() + 1000).toISOString();
    expect(isWithinCustomerServiceWindow(inbound, now)).toBe(false);
  });
});
