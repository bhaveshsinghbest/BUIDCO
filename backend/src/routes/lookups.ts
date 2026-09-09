import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireMd, requireWriter } from '../middleware/auth.js';
import {
  createScheme,
  createSector,
  deleteScheme,
  deleteSector,
  getLookups,
} from '../services/lookupsService.js';
import { dbId } from '../lib/ids.js';

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

const idParam = z.object({ id: dbId });

/**
 * Permanent deletion of a Sector / Scheme and its projects (Task 3).
 *
 * Gated to MD only. Every other write here is Admin+MD, but this one
 * removes whole projects and cannot be undone, so it sits a rung higher
 * than the Admin-level edits it otherwise resembles. Widening it to
 * `requireWriter` is a one-word change if that is the intent.
 */
lookupsRouter.delete('/sectors/:id', requireAuth, requireMd, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await deleteSector(id));
  } catch (err) {
    next(err);
  }
});

lookupsRouter.delete('/schemes/:id', requireAuth, requireMd, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json(await deleteScheme(id));
  } catch (err) {
    next(err);
  }
});
