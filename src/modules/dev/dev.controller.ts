import type { Response } from 'express';
import type { Request } from 'express';
import { Errors } from '../../lib/appError.js';
import { NibssError, nibssClient } from '../../services/nibss/index.js';

/**
 * Testing utilities: register test identity records in the NibssByPhoenix
 * identity store (the "BANK Admin registers BVN & NIN" step of the
 * documented flow). These only ever use synthetic test data.
 */
export async function seedBvn(req: Request, res: Response): Promise<void> {
  try {
    const record = await nibssClient.insertBvn(req.body);
    res.status(201).json({ message: 'BVN record created', identity: record });
  } catch (err) {
    if (err instanceof NibssError) {
      if (err.statusCode === 409) throw Errors.conflict(err.message, 'IDENTITY_ALREADY_REGISTERED');
      if (err.statusCode === 400) throw Errors.badRequest(err.message, 'SEED_FAILED');
      throw Errors.badGateway('Identity service error');
    }
    throw err;
  }
}

export async function seedNin(req: Request, res: Response): Promise<void> {
  try {
    const record = await nibssClient.insertNin(req.body);
    res.status(201).json({ message: 'NIN record created', identity: record });
  } catch (err) {
    if (err instanceof NibssError) {
      if (err.statusCode === 409) throw Errors.conflict(err.message, 'IDENTITY_ALREADY_REGISTERED');
      if (err.statusCode === 400) throw Errors.badRequest(err.message, 'SEED_FAILED');
      throw Errors.badGateway('Identity service error');
    }
    throw err;
  }
}