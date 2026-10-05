import crypto from 'crypto';
import { isDbConnected, query } from './database';
import { hashPassword } from '../auth/password';
import { UserRepository } from '../repositories/userRepository';

/**
 * Sprint 20 — first administrator for a fresh data store.
 *
 * Runs at every startup. In PostgreSQL, and in the embedded store in
 * production (where the demo accounts are not seeded), no administrator
 * exists at first; in development the demo administrators already exist and
 * this does nothing. When no active administrator exists,
 * BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD create one (password
 * hashed with the existing scrypt helper); without them startup
 * fails with instructions. When an administrator exists nothing happens: an
 * existing account is never changed, reset or overwritten. Credentials are
 * never logged or stored in plain text. There is no HTTP endpoint for this.
 */

export class BootstrapError extends Error {}

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

/** Problems with the bootstrap credentials (empty when acceptable). Never echoes the password. */
export function bootstrapCredentialProblems(email: string, password: string): string[] {
  const problems: string[] = [];
  if (!EMAIL.test(email) || email.length > 254) problems.push('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  if (password.length < 12) problems.push('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    problems.push('BOOTSTRAP_ADMIN_PASSWORD must mix upper- and lower-case letters, digits and a symbol');
  }
  const local = email.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) problems.push('BOOTSTRAP_ADMIN_PASSWORD must not contain the email name');
  return problems;
}

export async function ensureFirstAdmin(env: NodeJS.ProcessEnv = process.env, log: (message: string) => void = console.log): Promise<'exists' | 'created'> {
  const admins = isDbConnected()
    ? Number((await query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active = true")).rows[0]?.n)
    : (await UserRepository.findAll()).filter((u) => u.role === 'admin' && u.isActive).length;
  if (admins > 0) return 'exists';

  const email = String(env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(env.BOOTSTRAP_ADMIN_PASSWORD || '');
  if (!email || !password) {
    throw new BootstrapError(
      'This data store has no active administrator (a new PostgreSQL database, or a new production embedded store). Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters, mixing upper- and lower-case letters, digits and a symbol) and start the server again to create the first administrator; remove them afterwards.'
    );
  }
  const problems = bootstrapCredentialProblems(email, password);
  if (problems.length) throw new BootstrapError(`The first administrator was not created: ${problems.join('; ')}.`);
  if (await UserRepository.findByEmail(email)) {
    throw new BootstrapError('The first administrator was not created: BOOTSTRAP_ADMIN_EMAIL belongs to an existing account, which is never changed by the bootstrap. Use a different email.');
  }

  const now = new Date().toISOString();
  await UserRepository.create({
    id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    email,
    passwordHash: await hashPassword(password),
    firstName: 'Administrator',
    lastName: '',
    role: 'admin',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  log('✅ First administrator created from BOOTSTRAP_ADMIN_EMAIL. Remove BOOTSTRAP_ADMIN_PASSWORD from the environment now that it has been used.');
  return 'created';
}
