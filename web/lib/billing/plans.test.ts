import { describe, expect, it } from 'vitest';

import { PLANS, planById, planForPriceId } from './plans';

describe('plan catalogue', () => {
  it('offers exactly the three plans the product sells', () => {
    expect(PLANS.map((plan) => plan.id)).toEqual(['free', 'team', 'enterprise']);
  });

  it('gives only Team a self-serve checkout', () => {
    expect(planById('free').signup).toBe('current');
    expect(planById('team').signup).toBe('checkout');
    expect(planById('enterprise').signup).toBe('contact');
  });

  it('describes what each plan allows', () => {
    expect(planById('free').spaceKinds).toEqual(['personal']);
    expect(planById('team').spaceKinds).toEqual(['personal', 'team', 'org']);
    expect(planById('free').allowsConnections).toBe(false);
    expect(planById('team').allowsConnections).toBe(true);
  });

  it('maps the configured Team price back to the Team plan', () => {
    expect(planForPriceId('price_team_123', { teamPriceId: 'price_team_123' })).toBe('team');
  });

  it('refuses to guess at an unknown price', () => {
    expect(planForPriceId('price_something_else', { teamPriceId: 'price_team_123' })).toBeNull();
  });
});
