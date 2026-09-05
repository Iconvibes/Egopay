import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { Errors } from '../../lib/appError.js';
import { customerDto } from '../../lib/dto.js';
import { prisma } from '../../lib/prisma.js';

const BCRYPT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export async function registerCustomer(input: RegisterInput) {
  const email = input.email.toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  try {
    const customer = await prisma.customer.create({
      data: {
        email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone,
      },
    });
    return customerDto(customer);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw Errors.conflict('An account with this email already exists');
    }
    throw err;
  }
}

export async function loginCustomer(input: { email: string; password: string }) {
  const email = input.email.toLowerCase();
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer) {
    // Same message for unknown email and wrong password (no user enumeration).
    throw Errors.unauthorized('Invalid email or password');
  }

  const valid = await bcrypt.compare(input.password, customer.passwordHash);
  if (!valid) {
    throw Errors.unauthorized('Invalid email or password');
  }

  const token = jwt.sign(
    { sub: customer.id, email: customer.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions,
  );

  return { token, customer: customerDto(customer) };
}

export async function getCustomerProfile(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw Errors.notFound('Customer not found');
  return customerDto(customer);
}