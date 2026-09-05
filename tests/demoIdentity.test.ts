import { describe, expect, it } from 'vitest';
import { createDemoIdentityInput } from '../src/modules/onboarding/demoIdentity.js';

describe('createDemoIdentityInput', () => {
  it('creates an 11-digit identity matching the customer name and selected mode', () => {
    const identity = createDemoIdentityInput('BVN', {
      firstName: 'Ada',
      lastName: 'Okafor',
    });

    expect(identity).toMatchObject({
      firstName: 'Ada',
      lastName: 'Okafor',
      dob: '1992-06-15',
      phone: '08011112222',
    });
    expect(identity.bvn).toMatch(/^999\d{8}$/);
  });
});
