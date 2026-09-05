import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Errors } from '../lib/appError.js';
import { prisma } from '../lib/prisma.js';

export interface AuthedRequest extends Request {
  customer: {
    id: string;
    email: string;
  };
}

interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * Verifies the customer JWT and attaches the authenticated customer to the
 * request. All downstream authorization derives from this server-side
 * identity — client-supplied ids are never trusted for ownership.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw Errors.unauthorized('Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw Errors.unauthorized('Invalid or expired token');
  }

  if (!payload.sub) {
    throw Errors.unauthorized('Invalid or expired token');
  }

  const customer = await prisma.customer.findUnique({ where: { id: payload.sub } });
  if (!customer) {
    throw Errors.unauthorized('Customer no longer exists');
  }

  (req as AuthedRequest).customer = { id: customer.id, email: customer.email };
  next();
}