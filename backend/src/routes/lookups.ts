import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireWriter } from '../middleware/auth.js';
import { createScheme, createSector, getLookups } from '../services/lookupsService.js';

export const lookupsRouter = Router();

lookupsRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    res.json(await getLookups());
  } catch (err) {
    next(err);
  }
});

const createNameSchema = z.object({ name: z.string().trim().min(1).max(60) });

/**
 * Task: Add New Sector — from both the Sectors page and the Input Sheet's
 * Sector dropdown. Sector is a Fixed Input field, so this is gated the same
 * as Basic Info edits (Admin/MD only).
 */
lookupsRouter.post('/sectors', requireAuth, requireWriter, async (req, res, next) => {
  try {
    const { name } = createNameSchema.parse(req.body);
    res.status(201).json(await createSector(name));
  } catch (err) {
    next(err);
  }
});

/** Task: Add New Scheme — same reasoning as Add Sector above. */
lookupsRouter.post('/schemes', requireAuth, requireWriter, async (req, res, next) => {
  try {
    const { name } = createNameSchema.parse(req.body);
    res.status(201).json(await createScheme(name));
  } catch (err) {
    next(err);
  }
});
