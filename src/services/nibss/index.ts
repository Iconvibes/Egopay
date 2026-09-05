import { NibssClient } from './client.js';
import { NibssError } from './nibssError.js';

/**
 * Shared singleton. Services import from here so the token cache is shared
 * process-wide and tests can swap this module for a mock.
 */
export const nibssClient = new NibssClient();

export { NibssError };
export * from './types.js';