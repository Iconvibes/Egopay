import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';
import { Errors } from '../lib/appError.js';

export function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/** Validates and replaces req.body with the parsed (trimmed/coerced) data. */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw Errors.badRequest('Invalid request body', 'VALIDATION_ERROR', formatZodError(result.error));
    }
    req.body = result.data;
    next();
  };
}

/** Validates req.params against a schema. */
export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      throw Errors.badRequest('Invalid request parameters', 'VALIDATION_ERROR', formatZodError(result.error));
    }
    req.params = result.data as Request['params'];
    next();
  };
}

/**
 * Validates req.query against a schema. Express 5 exposes req.query as a
 * getter-only property, so the parsed result is attached to res.locals
 * instead of being written back.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw Errors.badRequest('Invalid query parameters', 'VALIDATION_ERROR', formatZodError(result.error));
    }
    res.locals.validatedQuery = result.data;
    next();
  };
}