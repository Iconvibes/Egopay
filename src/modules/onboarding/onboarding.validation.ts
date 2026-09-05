import { z } from 'zod';

function isValidDob(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const year = Number(m[1] ?? 0);
  const month = Number(m[2] ?? 0);
  const day = Number(m[3] ?? 0);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  if (year < 1900) return false;
  return date.getTime() <= Date.now();
}

export const dobSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
  .refine(isValidDob, 'Date of birth is invalid (must be a real date, not in the future)');

export const verifyBvnSchema = z.object({
  bvn: z.string().regex(/^\d{11}$/, 'BVN must be exactly 11 digits'),
  dob: dobSchema,
});

export const verifyNinSchema = z.object({
  nin: z.string().regex(/^\d{11}$/, 'NIN must be exactly 11 digits'),
  dob: dobSchema,
});