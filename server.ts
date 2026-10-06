import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { assertProductionSecrets, config, resolveListenHost } from './server/config/env';
import { initDatabase } from './server/config/database';
import { dataFilePath, dataMode, durableResponses, flushNow } from './server/config/persistence';
import { corsPolicy } from './server/middleware/corsPolicy';
import { securityHeaders } from './server/middleware/securityHeaders';
import { errorHandler } from './server/middleware/errorHandler';

async function startServer() {
  const app = express();
  const PORT = config.port;

  // 1. Sprint 20: configuration that must be safe before anything runs.
  assertProductionSecrets();
  // Sprint 22A: without a private JWT_SECRET the server is reachable from this computer only.
  const { host: HOST, loopbackOnly } = resolveListenHost();
  const cors = corsPolicy();
  const mode = dataMode();

  // 2. Data layer: PostgreSQL (reachable, schema applied, an administrator present) or the embedded store.
  await initDatabase();
  // An administrator must exist: from the bootstrap variables, or (development only) the demo accounts.
  const { ensureFirstAdmin } = await import('./server/config/bootstrapAdmin');
  await ensureFirstAdmin();
  // Routes load the repositories, which restore the embedded data file before any seed runs.
  const { v1ApiRouter } = await import('./server/routes');
  // First-run seeds and a bootstrapped administrator are on disk before any request is served;
  // a data location that cannot be written stops startup here.
  if (mode === 'persistent-embedded' && !flushNow()) {
    throw new Error(`The data file could not be written (${dataFilePath()}). Check that the folder is writable, or set PM_PORTAL_DATA_FILE.`);
  }
  const modeNote = mode === 'persistent-embedded'
    ? `persistent-embedded (data file: ${dataFilePath()})`
    : mode === 'temporary-memory' ? 'temporary-memory — nothing is saved; data is lost when the server stops' : 'postgresql';
  console.log(`🗄️ Data mode: ${modeNote}`);

  // 3. Global Security & Body Parsers
  app.use(securityHeaders);
  app.use(cors);
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 4. Mount V2 API Routes (/api/v1/* and /api/v2/*)
  // Sprint 20: in the embedded store, a change succeeds only once it is saved to the data file.
  app.use('/api', durableResponses);
  app.use('/api/v1', v1ApiRouter);
  app.use('/api/v2', v1ApiRouter);

  // Backward compatibility alias for /api/health
  app.get('/api/health', (req, res) => {
    res.redirect(307, '/api/v1/health');
  });

  // PM-Portal direct static directory serving for VB launcher & local file links
  app.use('/PM-Portal', express.static(path.join(process.cwd(), 'PM-Portal')));

  // 5. Vite Middleware for Development / Static serving for Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: HOST },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 6. Global Error Handler
  app.use(errorHandler);

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Surya PM OS V2.0 Server running on http://${HOST}:${PORT}`);
    console.log(`📡 V2 REST API endpoint active at http://${HOST}:${PORT}/api/v1/health`);
    console.log(`🖥️ PM Portal Application accessible at http://${HOST}:${PORT}/PM-Portal/index.html`);
    if (loopbackOnly) {
      console.log('🔒 Listening on this computer only: JWT_SECRET is not set to a private value. Set a random JWT_SECRET of at least 32 characters (and optionally PM_PORTAL_HOST) to allow access from the network.');
    }
  });
}

startServer().catch((err) => {
  console.error(`❌ The server did not start: ${err?.message || err}`);
  process.exit(1);
});
