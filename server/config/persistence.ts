import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from './env';

/**
 * Sprint 20 — durable embedded data.
 *
 * Three mutually exclusive modes, decided once at startup:
 * - postgresql          DATABASE_URL is set. PostgreSQL is the store; nothing here is active.
 * - persistent-embedded the default without DATABASE_URL. Repository Maps are restored from a
 *                       JSON snapshot before seeding and saved back after successful changes.
 * - temporary-memory    PM_PORTAL_DATA_MODE=memory (tests, demos). Nothing is read or written.
 *
 * Repositories create their stores with persistentMap()/persistentArray(); a restored
 * snapshot fills them before the repository's seed runs, and snapshotRestored() tells
 * the seed to stay out. Saves are atomic (temporary file, then rename), never happen
 * while a transaction is open (withTransaction holds them), and failures are reported,
 * never hidden. A snapshot that cannot be read stops the server; it is never replaced.
 */

export type DataMode = 'postgresql' | 'persistent-embedded' | 'temporary-memory';

const FORMAT = 'pm-portal-embedded-store';
const VERSION = 1;
const SAVE_DELAY_MS = 200;

export class PersistenceConfigError extends Error {}
export class PersistenceLoadError extends Error {}

/** The data mode for an environment; conflicting settings are an error, never a guess. */
export function resolveDataMode(env: NodeJS.ProcessEnv = process.env, databaseUrl = config.databaseUrl): DataMode {
  const requested = String(env.PM_PORTAL_DATA_MODE || '').trim().toLowerCase();
  if (requested && !['embedded', 'memory'].includes(requested)) {
    throw new PersistenceConfigError(`PM_PORTAL_DATA_MODE must be 'embedded' or 'memory' (got '${requested}').`);
  }
  if (databaseUrl) {
    if (requested) {
      throw new PersistenceConfigError('DATABASE_URL and PM_PORTAL_DATA_MODE are both set. Use one: PostgreSQL (DATABASE_URL) or the embedded store (PM_PORTAL_DATA_MODE).');
    }
    return 'postgresql';
  }
  return requested === 'memory' ? 'temporary-memory' : 'persistent-embedded';
}

/** Default: a per-user application-data folder, never inside the project (Vite serves it in development). */
export function defaultDataFile(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.LOCALAPPDATA || env.APPDATA || path.join(os.homedir(), '.pm-portal');
  return path.join(base, ...(env.LOCALAPPDATA || env.APPDATA ? ['PM-Portal'] : []), 'pm-portal-data.json');
}

/** The snapshot file: PM_PORTAL_DATA_FILE or the default, which must lie outside the project folder. */
export function resolveDataFile(env: NodeJS.ProcessEnv = process.env, projectRoot = process.cwd()): string {
  const file = path.resolve(env.PM_PORTAL_DATA_FILE ? env.PM_PORTAL_DATA_FILE.trim() : defaultDataFile(env));
  const root = path.resolve(projectRoot);
  const rel = path.relative(root, file);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new PersistenceConfigError(`PM_PORTAL_DATA_FILE must be outside the application folder (${root}); files there can be served to browsers.`);
  }
  return file;
}

// --------------------------------------------------------------------
// Serialisation: Map keys, Dates, nested Maps/Sets preserved exactly.
// --------------------------------------------------------------------

export function encode(value: unknown): string {
  return JSON.stringify(value, function replacer(this: any, key: string, v: unknown) {
    const original = this[key];
    if (original instanceof Date) return { $date: original.toISOString() };
    if (original instanceof Map) return { $map: Array.from(original.entries()) };
    if (original instanceof Set) return { $set: Array.from(original.values()) };
    return v;
  });
}

export function decode(text: string): unknown {
  return JSON.parse(text, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v);
      if (keys.length === 1 && keys[0] === '$date' && typeof v.$date === 'string') return new Date(v.$date);
      if (keys.length === 1 && keys[0] === '$map' && Array.isArray(v.$map)) return new Map(v.$map);
      if (keys.length === 1 && keys[0] === '$set' && Array.isArray(v.$set)) return new Set(v.$set);
    }
    return v;
  });
}

type StoreEntry = { kind: 'map'; entries: Array<[unknown, unknown]> } | { kind: 'array'; items: unknown[] };
export interface Snapshot { format: string; version: number; savedAt: string; stores: Record<string, StoreEntry> }

/** Parses and checks a snapshot's structure; throws PersistenceLoadError with the reason. */
export function parseSnapshot(text: string, file = 'snapshot'): Snapshot {
  let data: any;
  try {
    data = decode(text);
  } catch (err: any) {
    throw new PersistenceLoadError(`${file} is not valid JSON (${err.message}).`);
  }
  if (!data || typeof data !== 'object' || data.format !== FORMAT) throw new PersistenceLoadError(`${file} is not a PM Portal data file.`);
  if (data.version !== VERSION) throw new PersistenceLoadError(`${file} has unsupported version ${data.version}.`);
  if (!data.stores || typeof data.stores !== 'object' || Array.isArray(data.stores)) throw new PersistenceLoadError(`${file} has no stores.`);
  for (const [name, store] of Object.entries<any>(data.stores)) {
    const okMap = store?.kind === 'map' && Array.isArray(store.entries) && store.entries.every((e: unknown) => Array.isArray(e) && e.length === 2);
    const okArray = store?.kind === 'array' && Array.isArray(store.items);
    if (!okMap && !okArray) throw new PersistenceLoadError(`${file}: store '${name}' is damaged.`);
  }
  return data as Snapshot;
}

/** Atomic write: a complete temporary file, flushed, then renamed over the old one. */
export function writeSnapshotAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    const fd = fs.openSync(temp, 'w', 0o600);
    try {
      fs.writeSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
  } catch (err) {
    try { fs.unlinkSync(temp); } catch { /* nothing to clean up */ }
    throw err;
  }
}

/** Reads a snapshot file, or null when there is none yet; anything unreadable is an error. */
export function readSnapshotFile(file: string): Snapshot | null {
  if (!fs.existsSync(file)) return null;
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err: any) {
    throw new PersistenceLoadError(`${file} could not be read (${err.message}).`);
  }
  return parseSnapshot(text, file);
}

// --------------------------------------------------------------------
// Registry and lifecycle
// --------------------------------------------------------------------

type Store = { kind: 'map'; ref: Map<any, any> } | { kind: 'array'; ref: any[] };

const registry = new Map<string, Store>();
// Resolved on first use (not at import), so a configuration error reaches the startup handler as a clear message.
let resolved: { mode: DataMode; file: string | null } | null = null;
function settings(): { mode: DataMode; file: string | null } {
  if (!resolved) {
    const m = resolveDataMode();
    resolved = { mode: m, file: m === 'persistent-embedded' ? resolveDataFile() : null };
    if (m === 'persistent-embedded') {
      // Save what is pending when the process stops normally.
      process.once('exit', () => { flushNow(); });
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          flushNow();
          process.exit(0);
        });
      }
    }
  }
  return resolved;
}
const isPersistent = () => settings().mode === 'persistent-embedded';
let snapshot: Snapshot | null = null;
let loaded = false;
let dirty = false;
let holds = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastSavedAt: string | null = null;
let lastError: string | null = null;

function ensureLoaded(): void {
  if (loaded || !isPersistent()) return;
  loaded = true;
  try {
    snapshot = readSnapshotFile(settings().file!);
  } catch (err: any) {
    throw new PersistenceLoadError(
      `The PM Portal data file could not be restored: ${err.message} The server will not start with an empty store over existing data. ` +
      'Restore the file from a backup, or move it aside to start fresh (PM_PORTAL_DATA_FILE sets its location).'
    );
  }
}

export function dataMode(): DataMode {
  return settings().mode;
}

/** True when this run restored a snapshot: seeds must not run, even for stores that are now empty. */
export function snapshotRestored(): boolean {
  ensureLoaded();
  return snapshot !== null;
}

/** The data file in persistent-embedded mode (not secret; shown at startup), otherwise null. */
export function dataFilePath(): string | null {
  return settings().file;
}

export function persistenceStatus() {
  const { mode } = settings();
  return { mode, active: mode === 'persistent-embedded', restored: snapshot !== null, lastSavedAt, lastError, stores: registry.size };
}

function register(name: string, store: Store): void {
  // Two live copies of one store would save conflicting data; outside persistent mode (tests that
  // load a fresh module copy) the newer registration simply replaces the older one.
  if (registry.has(name) && isPersistent()) throw new Error(`Persistent store '${name}' is registered twice.`);
  registry.set(name, store);
}

class TrackedMap<K, V> extends Map<K, V> {
  set(key: K, value: V): this {
    super.set(key, value);
    markDirty();
    return this;
  }
  delete(key: K): boolean {
    const removed = super.delete(key);
    if (removed) markDirty();
    return removed;
  }
  clear(): void {
    super.clear();
    markDirty();
  }
}

/** A repository store: restored from the snapshot in persistent mode, saved after changes. */
export function persistentMap<V, K = string>(name: string): Map<K, V> {
  ensureLoaded();
  const map = new TrackedMap<K, V>();
  const saved = snapshot?.stores[name];
  if (saved?.kind === 'map') for (const [k, v] of saved.entries) Map.prototype.set.call(map, k, v);
  if (snapshot) delete snapshot.stores[name]; // the live store is now the source; keep no second copy
  register(name, { kind: 'map', ref: map });
  return map;
}

/** For the array-backed stores (activity, notifications); callers mark changes with markDirty(). */
export function persistentArray<T>(name: string, initial: T[] = []): T[] {
  ensureLoaded();
  const saved = snapshot?.stores[name];
  const items: T[] = saved?.kind === 'array' ? (saved.items as T[]) : initial;
  if (snapshot) delete snapshot.stores[name];
  register(name, { kind: 'array', ref: items });
  return items;
}

/** Stores currently registered, plus any snapshot stores not (yet) registered, so nothing is dropped. */
export function snapshotText(): string {
  const stores: Record<string, StoreEntry> = { ...(snapshot?.stores || {}) };
  for (const [name, store] of registry) {
    stores[name] = store.kind === 'map' ? { kind: 'map', entries: Array.from(store.ref.entries()) } : { kind: 'array', items: store.ref };
  }
  return encode({ format: FORMAT, version: VERSION, savedAt: new Date().toISOString(), stores });
}

export function markDirty(): void {
  if (!isPersistent()) return;
  dirty = true;
  schedule();
}

function schedule(): void {
  if (holds > 0 || timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushNow();
  }, SAVE_DELAY_MS);
  timer.unref?.();
}

/** Saves now if there are unsaved changes and no transaction is open. Returns false on failure. */
export function flushNow(): boolean {
  if (!isPersistent() || !dirty || holds > 0) return true;
  try {
    writeSnapshotAtomic(settings().file!, snapshotText());
    dirty = false;
    lastSavedAt = new Date().toISOString();
    lastError = null;
    return true;
  } catch (err: any) {
    lastError = `Saving the data file failed: ${err.message}`;
    console.error(`❌ ${lastError} The previous saved data is unchanged; the server will retry.`);
    setTimeout(schedule, 1000).unref?.();
    return false;
  }
}

/** Called by withTransaction: nothing is saved while any transaction may still roll back. */
export function holdSaves(): void {
  holds += 1;
}

export function releaseSaves(): void {
  holds = Math.max(0, holds - 1);
  if (holds === 0) {
    for (const resolve of released.splice(0)) resolve();
    if (dirty) schedule();
  }
}

const released: Array<() => void> = [];

/** Resolves once no transaction holds saves (immediately when none does). */
export function whenSavesReleased(): Promise<void> {
  return holds === 0 ? Promise.resolve() : new Promise((resolve) => released.push(resolve));
}

/**
 * Sprint 20 — durable before success. For a state-changing API request in
 * persistent-embedded mode, a successful (2xx) JSON response is sent only
 * after the store has been written to the data file. If the write fails, the
 * caller gets 503 PERSISTENCE_FAILED instead of a success: the change stays
 * in memory (it is not lost and is saved by the next successful write), the
 * previous data file is unchanged, and every further change is refused the
 * same way until saving works again. Error responses and reads are sent as
 * they are. Other modes are unaffected.
 */
export function durableResponses(req: { method: string }, res: any, next: () => void): void {
  if (!isPersistent() || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method).toUpperCase())) return next();
  const send = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode >= 400) return send(body);
    // A save must not capture another request's uncommitted transaction, so wait for those to finish.
    whenSavesReleased().then(() => {
      if (flushNow()) {
        send(body);
      } else {
        res.status(503);
        send({
          success: false,
          error: {
            code: 'PERSISTENCE_FAILED',
            message: 'The change could not be saved to the data file, so it is not yet durable. It is kept in memory and will be saved once saving works again; try again shortly or contact your administrator.',
          },
        });
      }
    });
    return res;
  };
  next();
}

/** Test support: the registered stores (read-only use). */
export function registeredStores(): ReadonlyMap<string, Store> {
  return registry;
}
