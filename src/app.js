import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import config from './config/env.js';
import logger from './utils/logger.js';
import routes from './routes/index.js';
import notFound from './middlewares/notFound.js';
import errorHandler from './middlewares/errorHandler.js';
import { uploadsRoot } from './middlewares/upload.js';

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    // Allow Android / admin web to load uploaded images from this origin.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: config.cors.origins.includes('*') ? true : config.cors.origins,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP request logging piped into our structured logger.
app.use(
  morgan('tiny', {
    stream: { write: (line) => logger.info(line.trim()) },
    skip: () => config.isTest,
  })
);

// Liveness/readiness probe — no auth, no DB dependency.
app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

app.use('/uploads', express.static(uploadsRoot()));

// Route protection is applied per-route:
//  - Pre-login endpoints use requireAppToken (device handshake token)
//  - Authenticated endpoints use authenticate (Bearer access token)
app.use(config.apiPrefix, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
