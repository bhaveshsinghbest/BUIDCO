import { Router } from 'express';
import { actorFromReq } from '../lib/actor.js';
import { requireProjectReader, requireRole } from '../middleware/auth.js';
import * as service from '../services/auditService.js';

/**
 * Audit trail viewer — MD and Admin only. The trail records every project
 * change field by field, so it also needs "Can view projects" (S-03).
 */
export const auditRouter = Router();

auditRouter.use(...requireProjectReader, requireRole('MD', 'Admin'));

auditRouter.get('/', async (req, res, next) => {
  try {
    const q = service.listAuditQuery.parse(req.query);
    res.json(await service.listAudit(q, actorFromReq(req)));
  } catch (err) {
    next(err);
  }
});
