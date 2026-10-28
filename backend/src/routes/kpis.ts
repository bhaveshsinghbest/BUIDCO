import { Router } from 'express';
import { z } from 'zod';
import { sessionDivisionId } from '../lib/actor.js';
import { requireAuth } from '../middleware/auth.js';
import * as kpi from '../lib/kpi.js';

/**
 * Phase C2 — every KPI endpoint threads the PD's session divisionId into
 * the query layer. For MD/Admin/Viewer this is null → portfolio-wide
 * (unchanged behaviour). For PDs the query re-aggregates over their
 * division only. Enforced at the routing edge so a rogue caller cannot
 * bypass filtering by hitting the endpoint directly.
 */
export const kpisRouter = Router();

kpisRouter.use(requireAuth);

kpisRouter.get('/overview', async (req, res, next) => {
  try {
    res.json(await kpi.getOverviewKpis(sessionDivisionId(req)));
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/schedule-vs-actual', async (req, res, next) => {
  try {
    res.json(await kpi.getScheduleVsActual(sessionDivisionId(req)));
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/stage-buckets', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getStageBuckets(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/work-type-counts', async (req, res, next) => {
  try {
    res.json(await kpi.getWorkTypeCounts(sessionDivisionId(req)));
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/financial-securities', async (req, res, next) => {
  try {
    res.json(await kpi.getFinancialSecurities(sessionDivisionId(req)));
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/pbg-expiry-alerts', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getPbgExpiryAlerts(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/insurance-expiry-alerts', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getInsuranceExpiryAlerts(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/om-status', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getOmStatus(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/om-expiry-alerts', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getOmExpiryAlerts(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/scheme-chart', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getSchemeChart(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/status-donut', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getStatusDonut(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/scheme-summary', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getSchemeSummary(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/scheme-kpi-summary', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getSchemeKpiSummary(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/sector-summary', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getSectorSummary(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/district-summary', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getDistrictSummary(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/division-summary', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getDivisionSummary(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/region-summary', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getRegionSummary(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/delay-status', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getDelayStatus(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/outstanding-gaps', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getOutstandingGaps(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

kpisRouter.get('/management-action-summary', async (req, res, next) => {
  try {
    res.json({ items: await kpi.getManagementActionSummary(sessionDivisionId(req)) });
  } catch (err) {
    next(err);
  }
});

const cosEotQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

kpisRouter.get('/cos-eot-records', async (req, res, next) => {
  try {
    const { limit, offset } = cosEotQuery.parse(req.query);
    const items = await kpi.listCosEotRecords(limit + 1, offset, sessionDivisionId(req));
    const hasMore = items.length > limit;
    res.json({
      items: hasMore ? items.slice(0, limit) : items,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (err) {
    next(err);
  }
});
