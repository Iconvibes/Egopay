import { KycType } from '@prisma/client';
import { Errors } from '../../lib/appError.js';
import { customerDto } from '../../lib/dto.js';
import { prisma } from '../../lib/prisma.js';
import { NibssError, nibssClient } from '../../services/nibss/index.js';

async function loadCustomerOrThrow(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw Errors.notFound('Customer not found');
  return customer;
}

/** Cross-checks the identity record returned by Nibss against what the
 * customer provided/registered. Returns an error message or null. */
function identityMismatch(opts: {
  recordDob: string;
  providedDob: string;
  recordFirstName: string;
  recordLastName: string;
  registeredFirstName: string;
  registeredLastName: string;
}): string | null {
  if (opts.recordDob && opts.recordDob !== opts.providedDob) {
    return 'The date of birth provided does not match the identity record';
  }
  const norm = (s: string) => s.trim().toLowerCase();
  if (
    opts.recordFirstName &&
    opts.recordLastName &&
    (norm(opts.recordFirstName) !== norm(opts.registeredFirstName) ||
      norm(opts.recordLastName) !== norm(opts.registeredLastName))
  ) {
    return 'The registered name does not match the identity record';
  }
  return null;
}

export async function verifyBvn(customerId: string, input: { bvn: string; dob: string }) {
  const customer = await loadCustomerOrThrow(customerId);
  if (customer.kycVerified) {
    throw Errors.conflict('KYC verification has already been completed', 'KYC_ALREADY_VERIFIED');
  }

  let record;
  try {
    record = await nibssClient.validateBvn(input.bvn);
  } catch (err) {
    throw mapNibssValidationError(err);
  }

  const mismatch = identityMismatch({
    recordDob: record.dob,
    providedDob: input.dob,
    recordFirstName: record.firstName,
    recordLastName: record.lastName,
    registeredFirstName: customer.firstName,
    registeredLastName: customer.lastName,
  });
  if (mismatch) {
    throw Errors.unprocessable(mismatch, 'KYC_MISMATCH');
  }

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      kycType: KycType.BVN,
      kycNumber: record.number,
      kycFirstName: record.firstName,
      kycLastName: record.lastName,
      kycDob: new Date(`${record.dob}T00:00:00.000Z`),
      kycVerified: true,
      kycVerifiedAt: new Date(),
    },
  });

  return { message: 'BVN verified successfully', customer: customerDto(updated) };
}

export async function verifyNin(customerId: string, input: { nin: string; dob: string }) {
  const customer = await loadCustomerOrThrow(customerId);
  if (customer.kycVerified) {
    throw Errors.conflict('KYC verification has already been completed', 'KYC_ALREADY_VERIFIED');
  }

  let record;
  try {
    record = await nibssClient.validateNin(input.nin);
  } catch (err) {
    throw mapNibssValidationError(err);
  }

  const mismatch = identityMismatch({
    recordDob: record.dob,
    providedDob: input.dob,
    recordFirstName: record.firstName,
    recordLastName: record.lastName,
    registeredFirstName: customer.firstName,
    registeredLastName: customer.lastName,
  });
  if (mismatch) {
    throw Errors.unprocessable(mismatch, 'KYC_MISMATCH');
  }

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      kycType: KycType.NIN,
      kycNumber: record.number,
      kycFirstName: record.firstName,
      kycLastName: record.lastName,
      kycDob: new Date(`${record.dob}T00:00:00.000Z`),
      kycVerified: true,
      kycVerifiedAt: new Date(),
    },
  });

  return { message: 'NIN verified successfully', customer: customerDto(updated) };
}

export async function getStatus(customerId: string) {
  const customer = await loadCustomerOrThrow(customerId);
  return customerDto(customer);
}

function mapNibssValidationError(err: unknown): never {
  if (err instanceof NibssError) {
    if (err.statusCode === 400 || err.statusCode === 404) {
      throw Errors.badRequest(err.message, 'KYC_VALIDATION_FAILED');
    }
    if (err.statusCode === 401) {
      throw Errors.badGateway('Identity service authentication failed');
    }
    throw Errors.badGateway('Identity service error');
  }
  throw err;
}
