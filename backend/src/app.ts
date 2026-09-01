import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { corsOptions } from './config/cors.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { auditRouter } from './routes/audit.js';
import { authRouter } from './routes/auth.js';
import { fundsUcRouter } from './routes/fundsUc.js';
import { healthRouter } from './routes/health.js';
import { kpisRouter } from './routes/kpis.js';
import { lookupsRouter } from './routes/lookups.js';
import { momRouter } from './routes/mom.js';
import { preMonsoonRouter } from './routes/preMonsoon.js';
import { projectsRouter } from './routes/projects.js';
import { uploadsRouter } from './routes/uploads.js';
import { usersRouter } from './routes/users.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/lookups', lookupsRouter);
  app.use('/api/kpis', kpisRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/mom', momRouter);
  app.use('/api/pre-monsoon', preMonsoonRouter);
  app.use('/api/funds-uc', fundsUcRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/uploads', uploadsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
