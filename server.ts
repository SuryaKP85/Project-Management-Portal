import express from 'express';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { config } from './server/config/env';
import { initDatabase } from './server/config/database';
import { v1ApiRouter } from './server/routes';
import { securityHeaders } from './server/middleware/securityHeaders';
import { errorHandler } from './server/middleware/errorHandler';

async function startServer() {
  const app = express();
  const PORT = config.port;

  // 1. Initialize Database Layer
  await initDatabase();

  // 2. Global Security & Body Parsers
  app.use(securityHeaders);
  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 3. Mount V2 API Routes (/api/v1/* and /api/v2/*)
  app.use('/api/v1', v1ApiRouter);
  app.use('/api/v2', v1ApiRouter);

  // Backward compatibility alias for /api/health
  app.get('/api/health', (req, res) => {
    res.redirect(307, '/api/v1/health');
  });

  // PM-Portal direct static directory serving for VB launcher & local file links
  app.use('/PM-Portal', express.static(path.join(process.cwd(), 'PM-Portal')));

  // 4. Vite Middleware for Development / Static serving for Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
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

  // 5. Global Error Handler
  app.use(errorHandler);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Surya PM OS V2.0 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📡 V2 REST API endpoint active at http://0.0.0.0:${PORT}/api/v1/health`);
    console.log(`🖥️ PM Portal Application accessible at http://0.0.0.0:${PORT}/PM-Portal/index.html`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error during server startup:', err);
  process.exit(1);
});
