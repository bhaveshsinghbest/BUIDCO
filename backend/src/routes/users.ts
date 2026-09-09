import { Router } from 'express';
import { z } from 'zod';
import { actorFromReq } from '../lib/actor.js';
import { requireAuth, requireRole, requireWriter } from '../middleware/auth.js';
import * as service from '../services/usersService.js';
import { dbId } from '../lib/ids.js';

/**
 * User management endpoints.
 *
 * Access model (Phase 6.6 + Task 2 deletion hierarchy):
 *   - MD: full CRUD, any role, any flag combination; may delete Admin/PD/Viewer.
 *   - Admin: sees + edits Viewer users only (enforced inside the service); may delete PD/Viewer.
 *   - PD: list-only visibility of Viewer users (enforced inside the service); may delete Viewer only.
 *   - Viewer: 403 everywhere.
 *
 * List/delete allow PD in addition to `requireWriter` (Admin+MD); create/
 * update stay Admin+MD only. Role-specific scoping (e.g. Admin can only
 * touch Viewers, PD can only delete Viewers) lives in the service so the
 * audit layer sees the correct actor context.
 */
export const usersRouter = Router();

usersRouter.use(requireAuth);

const idParam = z.object({ userId: dbId });

usersRouter.get('/', requireRole('MD', 'Admin', 'PD'), async (req, res, next) => {
  try {
    res.json({ items: await service.listUsers(actorFromReq(req)) });
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/', requireWriter, async (req, res, next) => {
  try {
    const body = service.createUserSchema.parse(req.body);
    const out = await service.createUser(body, actorFromReq(req));
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:userId', requireWriter, async (req, res, next) => {
  try {
    const { userId } = idParam.parse(req.params);
    const body = service.updateUserSchema.parse(req.body);
    const out = await service.updateUser(userId, body, actorFromReq(req));
    res.json(out);
  } catch (err) {
    next(err);
  }
});

usersRouter.delete('/:userId', requireRole('MD', 'Admin', 'PD'), async (req, res, next) => {
  try {
    const { userId } = idParam.parse(req.params);
    await service.deleteUser(userId, actorFromReq(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
