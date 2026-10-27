import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { db } from './db/index.js';
import { asyncHandler } from './utils/httpError.js';
import { errorHandler, notFound } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import roleRoutes from './routes/roles.js';
import skillRoutes from './routes/skills.js';
import surveyRoutes from './routes/surveys.js';
import adminRoutes from './routes/admin.js';
import { publicGapRouter, studentRouter } from './routes/student.js';
import { getResearchStatus } from './services/researchStatus.js';
import { DEFAULT_WEIGHTS, latestRun } from './services/scoring.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    credentials: false,
  }));
  // Imports send file contents as JSON, so allow larger bodies (validated per route).
  app.use(express.json({ limit: '8mb' }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 50, standardHeaders: 'draft-7', legacyHeaders: false });

  app.get('/api/health', asyncHandler(async (req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true, database: db.driverName });
  }));

  app.get('/api/research-status', asyncHandler(async (req, res) => {
    res.json(await getResearchStatus());
  }));

  app.get('/api/meta', asyncHandler(async (req, res) => {
    const run = await latestRun();
    res.json({
      algorithm: {
        formula: 'Score = 100 x (wD*D + wP*P + wB*B) / (sum of weights for signals with data)',
        defaultWeights: DEFAULT_WEIGHTS,
        weightsInUse: run?.params?.weights ?? DEFAULT_WEIGHTS,
        tiers: { 'Very High': '>= 80', High: '60-79', Moderate: '40-59', Low: '20-39', Minimal: '< 20' },
      },
      latestRun: run,
    });
  }));

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/roles', roleRoutes);
  app.use('/api/skills', skillRoutes);
  app.use('/api/skill-gap', publicGapRouter);
  app.use('/api/student', studentRouter);
  app.use('/api', surveyRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
