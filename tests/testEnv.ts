/**
 * Sprint 20 — imported first by every test entry point. Tests run in the
 * explicit temporary-memory mode, so they never read or write a real embedded
 * data file (§50 uses its own temporary files). A configured DATABASE_URL keeps
 * PostgreSQL mode, as before.
 */
import dotenv from 'dotenv';

dotenv.config();
if (!process.env.DATABASE_URL && !process.env.PM_PORTAL_DATA_MODE) process.env.PM_PORTAL_DATA_MODE = 'memory';
