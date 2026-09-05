export type DemoIdentityMode = 'BVN' | 'NIN';

type CustomerName = { firstName: string; lastName: string };

type DemoBvnInput = CustomerName & {
  bvn: string;
  dob: string;
  phone: string;
};

type DemoNinInput = CustomerName & {
  nin: string;
  dob: string;
};

const TEST_DOB: Record<DemoIdentityMode, string> = {
  BVN: '1992-06-15',
  NIN: '1990-01-20',
};

function randomTestNumber(): string {
  const digits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
  return `999${digits}`;
}

export function createDemoIdentityInput(mode: 'BVN', customer: CustomerName): DemoBvnInput;
export function createDemoIdentityInput(mode: 'NIN', customer: CustomerName): DemoNinInput;
export function createDemoIdentityInput(mode: DemoIdentityMode, customer: CustomerName): DemoBvnInput | DemoNinInput;
export function createDemoIdentityInput(mode: DemoIdentityMode, customer: CustomerName): DemoBvnInput | DemoNinInput {
  const number = randomTestNumber();
  if (mode === 'BVN') {
    return { bvn: number, firstName: customer.firstName, lastName: customer.lastName, dob: TEST_DOB.BVN, phone: '08011112222' };
  }
  return { nin: number, firstName: customer.firstName, lastName: customer.lastName, dob: TEST_DOB.NIN };
}
