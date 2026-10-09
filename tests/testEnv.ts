/**
 * Sprint 20 — imported first by every test entry point. Tests run in the
 * explicit temporary-memory mode, so they never read or write a real embedded
 * data file (§50 uses its own temporary files). A configured DATABASE_URL keeps
 * PostgreSQL mode, as before.
 *
 * Sprint 25 — but only for a database that is unmistakably a disposable test
 * database: its name must end in "_test" (for example pm_portal_test) AND it must
 * be on this computer (localhost, 127.0.0.1, ::1 or a local socket), unless
 * PM_PORTAL_TEST_DATABASE names that exact database to confirm a remote one is
 * disposable. Any other DATABASE_URL (a production or shared database, possibly
 * picked up from .env) stops the run before anything is written. The URL itself is
 * never printed. Without DATABASE_URL the run is always temporary-memory, even if
 * PM_PORTAL_DATA_MODE asks for the embedded data file.
 */
import dotenv from 'dotenv';

const LOCAL_DB_HOSTS = new Set(['', 'localhost', '127.0.0.1', '[::1]', '::1']);

/** The reason a DATABASE_URL may not be used by the test suites, or null when it may. */
export function unsafeTestDatabase(url: string | undefined, confirmed = process.env.PM_PORTAL_TEST_DATABASE): string | null {
  const value = String(url || '').trim();
  if (!value) return null;
  let name = '';
  let host = '';
  try {
    const parsed = new URL(value);
    name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    host = (new URLSearchParams(parsed.search).get('host') || parsed.hostname).toLowerCase();
  } catch {
    return 'DATABASE_URL is not a valid URL';
  }
  if (!/_test$/i.test(name)) {
    return `the database name ${name ? `'${name}'` : '(none)'} does not end in "_test"`;
  }
  // A socket directory (?host=/var/run/postgresql) is this computer too.
  if (!LOCAL_DB_HOSTS.has(host) && !host.startsWith('/') && String(confirmed || '').trim() !== name) {
    return `'${name}' is not on this computer; set PM_PORTAL_TEST_DATABASE=${name} to confirm it is a disposable test database`;
  }
  return null;
}

dotenv.config();
const unsafe = unsafeTestDatabase(process.env.DATABASE_URL);
if (unsafe) {
  console.error(`Refusing to run tests against DATABASE_URL: ${unsafe}. The test suites create and delete records; point DATABASE_URL at a disposable database whose name ends in "_test", or unset it to use the temporary in-memory store.`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) process.env.PM_PORTAL_DATA_MODE = 'memory';
