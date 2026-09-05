import { pino } from 'pino';
import { env } from '../config/env.js';

/**
 * Structured logger with sensitive-field redaction.
 * Password hashes, API secrets, KYC numbers and JWTs are never written to logs.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      '*.password',
      '*.passwordHash',
      '*.apiKey',
      '*.apiSecret',
      '*.apikey',
      '*.apisecret',
      '*.kycNumber',
      '*.kycID',
      '*.bvn',
      '*.nin',
      '*.token',
      '*.dob',
      '*.body.bvn',
      '*.body.nin',
      '*.body.password',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});