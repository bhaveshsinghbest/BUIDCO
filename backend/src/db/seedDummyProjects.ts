/**
 * One-shot dummy-data seeder for local development / demoing.
 *
 * Inserts 10 sample projects with every Input Sheet field populated (Basic
 * Info, Contract & Security, Phase & Dates, Progress & Financial, CoS/EoT,
 * GeoTagging, Action & Remarks, O&M) plus their child records (schemes,
 * CoS/EoT items, management actions, geo photos), so every page that reads
 * project data has something to show.
 *
 * Goes through the same service functions the API routes use (createProject,
 * createCosEot, createMgmtAction, createGeoPhotoUrl) so seeded rows get real
 * audit trail entries and pass the same validation as user-created ones —
 * same pattern as seedProjects.ts / seedAdmin.ts.
 *
 * Idempotent: skips any project whose projectName already exists.
 *
 * Usage:
 *   npm run db:seed-dummy-projects
 */

import { eq } from 'drizzle-orm';
import { db, pool } from './client.js';
import { assertDemoSeedingAllowed } from './seedGuard.js';
import { project } from './schema.js';
import { FINAL_TENDER_SUB_STAGE } from './enums.js';
import type { AuditActor } from '../lib/audit.js';
import { createCosEot, cosEotCreateSchema } from '../services/cosEotService.js';
import { createGeoPhotoUrl, type GeoPhotoUrlCreateInput } from '../services/geoPhotosService.js';
import { createMgmtAction, type MgmtActionCreateInput } from '../services/managementActionService.js';
import { createProject, updateProject } from '../services/projectsService.js';
import { createProjectSchema } from '../lib/projectFields.js';

/** Raw (pre-zod-transform) CoS/EoT item — numeric fields are plain `number`. */
type RawCosEotInput = import('zod').input<typeof cosEotCreateSchema>;

const SEED_ACTOR: AuditActor = {
  userId: null,
  username: 'system:seed',
  role: 'MD',
};

/** Raw (pre-zod-transform) shape — numeric fields are plain `number`, same as what the Input Sheet form sends over the wire. */
type RawProjectInput = Omit<
  import('zod').input<typeof createProjectSchema>,
  'sectorId' | 'divisionId'
> & {
  sectorName: string;
  divisionName: string;
  schemeNames: string[];
};

interface DummyProject {
  input: RawProjectInput;
  cosEotItems: RawCosEotInput[];
  mgmtActions: MgmtActionCreateInput[];
  geoPhotos: GeoPhotoUrlCreateInput[];
  /**
   * Construction/O&M can't be set on create (Tendor_Dashboard.md §9) — the
   * project is created in Tender, then walked through the sub-stage
   * workflow to this stage via follow-up updateProject calls.
   */
  advanceToStage?: 'Construction' | 'O&M';
}

const DUMMY_PROJECTS: DummyProject[] = [
  {
    input: {
      projectName: 'Patna Sewerage Network Augmentation — Phase II',
      sectorName: 'Sewerage',
      city: 'Patna',
      divisionName: 'Patna Bankipur',
      contractor: 'M/s Ganga Infra Builders Pvt. Ltd.',
      pd: 'Er. Ramesh Kumar',
      mainWork: 'Laying of 45 km trunk sewer line and construction of 2 pumping stations.',
      physicalWorkProgressNote: 'Trunk line laying 62% complete; pumping station 1 civil work finished.',
      contractType: 'Work Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: '2023-04-10',
      projectBrief: 'Augments the existing sewerage network to serve newly developed wards on the eastern periphery of Patna.',
      schemeNames: ['AMRUT 2.0'],

      agreementNumber: 'BUIDCO/AGR/2023/0142',
      agreementDate: '2023-05-02',
      appointedDate: '2023-05-15',
      contractValueCr: 84.5,
      mobAdvanceIssuedCr: 8.45,
      mobAdvanceRecoveredCr: 3.2,
      advanceOutstandingCr: 5.25,
      retentionMoneyHeldCr: 2.1,
      pbgNumber: 'PBG/SBI/2023/7781',
      pbgAmountCr: 4.2,
      pbgExpiryDate: '2026-05-14',
      pbgIssuingBank: 'State Bank of India',
      emdAmountCr: 1.69,
      emdRefNumber: 'EMD/2023/0142',
      emdDate: '2023-03-20',
      totalPaymentsCr: 41.6,
      lastPaymentDate: '2026-07-15',
      lastRaBillNo: 'RA-14',

      // Created in Tender and advanced to Construction post-create (see
      // `advanceToStage` below) — the API rejects creating a project
      // directly in Construction/O&M (Tendor_Dashboard.md §9).
      projectStageV2: 'Tender',
      // Legacy stage column — v_stage_buckets (Overview's "Active Projects
      // — Current Stage" widget) reads this instead of projectStageV2. Not
      // gated by the tender-workflow rule, so it's fine to set the final
      // target value straight away.
      projectStage: 'Construction',
      status: 'In Progress',
      plannedEndDate: '2026-11-30',
      revisedEndDate: null,
      expectedCompletionDate: '2027-01-31',
      delayReason: 'Monsoon-related work stoppage for 6 weeks; utility shifting delays from BSNL/electricity dept.',
      deptStuckAt: 'Electricity Department — pole shifting NOC pending',

      priority: 'High',
      sanctionedCostCr: 92,
      aaAmountCr: 90,
      revisedAaAmountCr: 92,
      agreementAmountCr: 84.5,
      physicalProgressPct: 62,
      financialProgressCr: 41.6,
      financialProgressPct: 49.2,
      scheduledProgressPct: 68,

      geoTaggingUrl: 'https://maps.google.com/?q=Patna+Sewerage+Phase+II',

      remark: null,

      omApplicable: true,
      omStartDate: '2027-02-01',
      omPeriodMonths: 60,
      omEndDate: '2032-01-31',
      omAgency: 'M/s Ganga Infra Builders Pvt. Ltd.',
      omStatusOverride: 'Not Started',
      omRemarks: 'O&M scope covers pumping station electro-mechanical maintenance.',

      mprMonth: '2026-07',
      fundReceivedCr: 45,
      expenditureCentralRaw: '18.2',
      expenditureStateRaw: '23.4',
      manpowerEngagedRaw: '210',
      mainComponentScope: 'Trunk sewer, pumping stations, rising main',
      progressPrevMonthRaw: '58',
      progressThisMonthRaw: '62',
      mprRemark: 'On track; minor slippage due to monsoon.',
    },
    cosEotItems: [
      {
        cosNumber: 'COS-01',
        cosDate: '2024-08-12',
        category: 'QUANTITY VARIATION',
        cosAmountCr: 3.5,
        variationPct: 4.1,
        eotNumber: 'EOT-01',
        eotDaysGranted: 45,
        timeLinked: true,
        originalEndDate: '2026-10-16',
        newEndDate: '2026-11-30',
      },
    ],
    mgmtActions: [
      { topic: 'Follow up with Electricity Dept. for pole-shifting NOC', status: 'Open', deadlineDate: '2026-09-15' },
      { topic: 'Conduct third-party quality audit of pumping station 1', status: 'Closed', deadlineDate: '2026-06-30' },
    ],
    geoPhotos: [
      { url: 'https://picsum.photos/seed/patna-sewerage-1/640/480', caption: 'Trunk sewer trench — Ward 42', photoDate: '2026-07-10' },
      { url: 'https://picsum.photos/seed/patna-sewerage-2/640/480', caption: 'Pumping station 1 — civil work', photoDate: '2026-07-18' },
    ],
    advanceToStage: 'Construction',
  },

  {
    input: {
      projectName: 'Gaya Water Supply Augmentation Scheme',
      sectorName: 'Water Supply',
      city: 'Gaya',
      divisionName: 'Gaya',
      contractor: 'M/s Magadh Water Infra Ltd.',
      pd: 'Er. Sunita Devi',
      mainWork: 'New intake well, WTP of 40 MLD capacity, and 60 km distribution network.',
      physicalWorkProgressNote: 'Tender process concluded; site handover scheduled.',
      contractType: 'Work Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: '2025-01-20',
      projectBrief: 'Augments Gaya’s piped water supply to meet projected 2035 demand, including a new WTP on the Falgu riverbank.',
      schemeNames: ['AMRUT 1.0'],

      agreementNumber: 'BUIDCO/AGR/2025/0031',
      agreementDate: '2025-03-01',
      appointedDate: '2025-03-10',
      contractValueCr: 128,
      mobAdvanceIssuedCr: 12.8,
      mobAdvanceRecoveredCr: 0,
      advanceOutstandingCr: 12.8,
      retentionMoneyHeldCr: 0.5,
      pbgNumber: 'PBG/PNB/2025/1123',
      pbgAmountCr: 6.4,
      pbgExpiryDate: '2028-03-09',
      pbgIssuingBank: 'Punjab National Bank',
      emdAmountCr: 2.56,
      emdRefNumber: 'EMD/2025/0031',
      emdDate: '2025-01-05',
      totalPaymentsCr: 12.8,
      lastPaymentDate: '2025-03-15',
      lastRaBillNo: 'RA-1',

      projectStageV2: 'Tender',
      // Legacy stage column — see note on the Patna Sewerage project above.
      projectStage: 'Tender',
      workType: 'Tender Work',
      status: 'Not Started',
      plannedEndDate: '2028-03-31',
      revisedEndDate: null,
      expectedCompletionDate: '2028-03-31',
      delayReason: null,
      deptStuckAt: null,

      priority: 'Medium',
      sanctionedCostCr: 135,
      aaAmountCr: 130,
      revisedAaAmountCr: null,
      agreementAmountCr: 128,
      physicalProgressPct: 0,
      financialProgressCr: 12.8,
      financialProgressPct: 10,
      scheduledProgressPct: 2,

      geoTaggingUrl: 'https://maps.google.com/?q=Gaya+Water+Supply+Scheme',

      remark: null,

      omApplicable: false,
      omStartDate: null,
      omPeriodMonths: null,
      omEndDate: null,
      omAgency: null,
      omStatusOverride: null,
      omRemarks: null,

      mprMonth: '2026-07',
      fundReceivedCr: 12.8,
      expenditureCentralRaw: '0',
      expenditureStateRaw: '12.8',
      manpowerEngagedRaw: '15',
      mainComponentScope: 'Intake well, WTP, distribution network',
      progressPrevMonthRaw: '0',
      progressThisMonthRaw: '0',
      mprRemark: 'Site handover in progress; mobilisation pending.',
    },
    cosEotItems: [],
    mgmtActions: [
      { topic: 'Complete site handover to contractor', status: 'Open', deadlineDate: '2026-09-01' },
    ],
    geoPhotos: [
      { url: 'https://picsum.photos/seed/gaya-water-1/640/480', caption: 'Proposed WTP site — Falgu riverbank', photoDate: '2026-06-20' },
    ],
  },

  {
    input: {
      projectName: 'Bhagalpur Storm Water Drainage Rehabilitation',
      sectorName: 'SWD',
      city: 'Bhagalpur',
      divisionName: 'Bhagalpur',
      contractor: 'M/s Anga Construction Co.',
      pd: 'Er. Vikram Singh',
      mainWork: 'Rehabilitation of 18 km of choked storm water drains and 4 outfall structures.',
      physicalWorkProgressNote: 'Work suspended pending revised drawings from design consultant.',
      contractType: 'Work Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: '2022-11-05',
      projectBrief: 'Rehabilitates the core-city storm water drainage network to reduce waterlogging during monsoon.',
      schemeNames: ['STATE FUNDED'],

      agreementNumber: 'BUIDCO/AGR/2023/0009',
      agreementDate: '2023-01-10',
      appointedDate: '2023-01-20',
      contractValueCr: 34.2,
      mobAdvanceIssuedCr: 3.42,
      mobAdvanceRecoveredCr: 3.42,
      advanceOutstandingCr: 0,
      retentionMoneyHeldCr: 1.1,
      pbgNumber: 'PBG/BOB/2023/0456',
      pbgAmountCr: 1.71,
      pbgExpiryDate: '2026-01-19',
      pbgIssuingBank: 'Bank of Baroda',
      emdAmountCr: 0.68,
      emdRefNumber: 'EMD/2022/0009',
      emdDate: '2022-10-15',
      totalPaymentsCr: 19.8,
      lastPaymentDate: '2025-12-05',
      lastRaBillNo: 'RA-9',

      projectStageV2: 'Design',
      // No legacy `project_stage` value maps to "Design" (that enum only
      // has Conceptualization/Pre-Tender/Tender/Construction/O&M) — left
      // unset, so this project doesn't appear in the legacy stage-buckets
      // widget. Matches how it would have looked before Phase A.
      status: 'On Hold',
      plannedEndDate: '2025-06-30',
      revisedEndDate: '2026-12-31',
      expectedCompletionDate: '2026-12-31',
      delayReason: 'Design consultant revising drawings after utility clash survey; work suspended since March 2026.',
      deptStuckAt: 'Design Consultant — revised drawings pending',

      priority: 'High',
      sanctionedCostCr: 36,
      aaAmountCr: 35,
      revisedAaAmountCr: 36,
      agreementAmountCr: 34.2,
      physicalProgressPct: 58,
      financialProgressCr: 19.8,
      financialProgressPct: 57.9,
      scheduledProgressPct: 95,

      geoTaggingUrl: 'https://maps.google.com/?q=Bhagalpur+SWD+Rehabilitation',

      remark: 'Design consultant has not submitted revised drawings for 3 months despite reminders — blocking resumption of work.',

      omApplicable: false,
      omStartDate: null,
      omPeriodMonths: null,
      omEndDate: null,
      omAgency: null,
      omStatusOverride: null,
      omRemarks: null,

      mprMonth: '2026-07',
      fundReceivedCr: 21,
      expenditureCentralRaw: '0',
      expenditureStateRaw: '19.8',
      manpowerEngagedRaw: '0',
      mainComponentScope: 'Drain rehabilitation, outfall structures',
      progressPrevMonthRaw: '58',
      progressThisMonthRaw: '58',
      mprRemark: 'No progress this month — work suspended.',
    },
    cosEotItems: [
      {
        cosNumber: 'COS-01',
        cosDate: '2025-07-01',
        category: 'DESIGN CHANGE',
        cosAmountCr: 1.8,
        variationPct: 5.3,
        eotNumber: 'EOT-01',
        eotDaysGranted: 180,
        timeLinked: true,
        originalEndDate: '2025-06-30',
        newEndDate: '2025-12-27',
      },
      {
        cosNumber: 'COS-02',
        cosDate: '2026-03-10',
        category: 'OTHERS',
        cosAmountCr: null,
        variationPct: null,
        eotNumber: 'EOT-02',
        eotDaysGranted: 369,
        timeLinked: true,
        originalEndDate: '2025-12-27',
        newEndDate: '2026-12-31',
      },
    ],
    mgmtActions: [
      { topic: 'Escalate to design consultant for revised drawings', status: 'Open', deadlineDate: '2026-08-20' },
      { topic: 'Review utility-clash survey report with electricity dept.', status: 'Open', deadlineDate: '2026-08-31' },
    ],
    geoPhotos: [
      { url: 'https://picsum.photos/seed/bhagalpur-swd-1/640/480', caption: 'Choked drain — Station Road outfall', photoDate: '2026-02-28' },
    ],
  },

  {
    input: {
      projectName: 'Muzaffarpur Electric Crematorium Modernisation',
      sectorName: 'Crematorium',
      city: 'Muzaffarpur',
      divisionName: 'Muzaffarpur',
      contractor: 'M/s Vaishali Green Builders',
      pd: 'Er. Anjali Kumari',
      mainWork: 'Construction of 2 electric cremation units, waiting hall, and landscaping.',
      physicalWorkProgressNote: 'Construction complete; O&M handover documentation in progress.',
      contractType: 'O&M Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: '2021-09-12',
      projectBrief: 'Modernises the existing crematorium with electric cremation units to reduce wood consumption and emissions.',
      schemeNames: ['STATE FUNDED'],

      agreementNumber: 'BUIDCO/AGR/2021/0087',
      agreementDate: '2021-10-05',
      appointedDate: '2021-10-15',
      contractValueCr: 6.8,
      mobAdvanceIssuedCr: 0.68,
      mobAdvanceRecoveredCr: 0.68,
      advanceOutstandingCr: 0,
      retentionMoneyHeldCr: 0.2,
      pbgNumber: 'PBG/CBI/2021/0321',
      pbgAmountCr: 0.34,
      pbgExpiryDate: '2026-10-14',
      pbgIssuingBank: 'Central Bank of India',
      emdAmountCr: 0.14,
      emdRefNumber: 'EMD/2021/0087',
      emdDate: '2021-08-20',
      totalPaymentsCr: 6.8,
      lastPaymentDate: '2026-05-10',
      lastRaBillNo: 'RA-6 (Final)',

      // Created in Tender and advanced to Construction then O&M post-create
      // (see `advanceToStage` below) — the API rejects creating a project
      // directly in Construction/O&M (Tendor_Dashboard.md §9).
      projectStageV2: 'Tender',
      // Legacy stage column — see note on the Patna Sewerage project above.
      projectStage: 'O&M',
      status: 'Completed',
      plannedEndDate: '2023-03-31',
      revisedEndDate: '2023-06-30',
      expectedCompletionDate: '2023-06-30',
      delayReason: 'Equipment import delayed by 3 months due to customs clearance.',
      deptStuckAt: null,

      priority: 'Low',
      sanctionedCostCr: 7,
      aaAmountCr: 6.9,
      revisedAaAmountCr: 7,
      agreementAmountCr: 6.8,
      physicalProgressPct: 100,
      financialProgressCr: 6.8,
      financialProgressPct: 100,
      scheduledProgressPct: 100,

      geoTaggingUrl: 'https://maps.google.com/?q=Muzaffarpur+Electric+Crematorium',

      remark: null,

      omApplicable: true,
      omStartDate: '2023-07-01',
      omPeriodMonths: 36,
      omEndDate: '2026-06-30',
      omAgency: 'M/s Vaishali Green Builders',
      omStatusOverride: 'Expiring Soon',
      omRemarks: 'O&M contract nearing expiry — re-tender process to be initiated.',

      mprMonth: '2026-07',
      fundReceivedCr: 6.8,
      expenditureCentralRaw: '0',
      expenditureStateRaw: '6.8',
      manpowerEngagedRaw: '4',
      mainComponentScope: 'Electric cremation units, waiting hall',
      progressPrevMonthRaw: '100',
      progressThisMonthRaw: '100',
      mprRemark: 'Complete; monitoring O&M performance.',
    },
    cosEotItems: [
      {
        cosNumber: 'COS-01',
        cosDate: '2023-01-15',
        category: 'SCOPE ADDITION',
        cosAmountCr: 0.3,
        variationPct: 4.6,
        eotNumber: 'EOT-01',
        eotDaysGranted: 91,
        timeLinked: true,
        originalEndDate: '2023-03-31',
        newEndDate: '2023-06-30',
      },
    ],
    mgmtActions: [
      { topic: 'Initiate re-tender for next O&M cycle', status: 'Open', deadlineDate: '2026-09-30' },
    ],
    geoPhotos: [
      { url: 'https://picsum.photos/seed/muzaffarpur-crem-1/640/480', caption: 'Completed cremation units', photoDate: '2023-06-25' },
    ],
    advanceToStage: 'O&M',
  },

  {
    input: {
      projectName: 'Patna Smart City Public Convenience Blocks',
      sectorName: 'Others',
      city: 'Patna',
      divisionName: 'Patna City',
      contractor: 'M/s Metro Civil Works',
      pd: 'Er. Deepak Prasad',
      mainWork: 'Construction of 12 modular public convenience blocks across the old city area.',
      physicalWorkProgressNote: 'Foundation and structural work started at 5 of 12 sites.',
      contractType: 'Work Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: '2025-08-01',
      projectBrief: 'Provides modular public convenience blocks in high-footfall areas of Patna’s old city as part of the Smart City sanitation push.',
      schemeNames: ['Patna Smart City', 'Pragati Yatra'],

      agreementNumber: 'BUIDCO/AGR/2025/0210',
      agreementDate: '2025-09-01',
      appointedDate: '2025-09-10',
      contractValueCr: 9.6,
      mobAdvanceIssuedCr: 0.96,
      mobAdvanceRecoveredCr: 0.3,
      advanceOutstandingCr: 0.66,
      retentionMoneyHeldCr: 0.15,
      pbgNumber: 'PBG/UBI/2025/0876',
      pbgAmountCr: 0.48,
      pbgExpiryDate: '2027-09-09',
      pbgIssuingBank: 'Union Bank of India',
      emdAmountCr: 0.19,
      emdRefNumber: 'EMD/2025/0210',
      emdDate: '2025-07-15',
      totalPaymentsCr: 2.4,
      lastPaymentDate: '2026-06-30',
      lastRaBillNo: 'RA-3',

      projectStageV2: 'Pre-Tender',
      // Legacy stage column — see note on the Patna Sewerage project above.
      projectStage: 'Pre-Tender',
      status: 'Delayed',
      plannedEndDate: '2026-06-30',
      revisedEndDate: null,
      expectedCompletionDate: '2026-12-31',
      delayReason: 'Land encroachment disputes at 3 of 12 sites delaying handover to contractor.',
      deptStuckAt: 'District Administration — encroachment removal pending',

      priority: 'Medium',
      sanctionedCostCr: 10,
      aaAmountCr: 9.8,
      revisedAaAmountCr: null,
      agreementAmountCr: 9.6,
      physicalProgressPct: 25,
      financialProgressCr: 2.4,
      financialProgressPct: 25,
      scheduledProgressPct: 55,

      geoTaggingUrl: 'https://maps.google.com/?q=Patna+Smart+City+Convenience+Blocks',

      remark: 'Land encroachment at 3 sites blocking handover — needs district administration intervention.',

      omApplicable: false,
      omStartDate: null,
      omPeriodMonths: null,
      omEndDate: null,
      omAgency: null,
      omStatusOverride: null,
      omRemarks: null,

      mprMonth: '2026-07',
      fundReceivedCr: 3,
      expenditureCentralRaw: '0',
      expenditureStateRaw: '2.4',
      manpowerEngagedRaw: '35',
      mainComponentScope: 'Modular public convenience blocks (12 sites)',
      progressPrevMonthRaw: '22',
      progressThisMonthRaw: '25',
      mprRemark: 'Slow progress — encroachment disputes at 3 sites.',
    },
    cosEotItems: [
      {
        cosNumber: 'COS-01',
        cosDate: '2026-05-05',
        category: 'QUANTITY VARIATION',
        cosAmountCr: 0.2,
        variationPct: 2.1,
        eotNumber: null,
        eotDaysGranted: 0,
        timeLinked: false,
        originalEndDate: null,
        newEndDate: null,
      },
    ],
    mgmtActions: [
      { topic: 'Coordinate with district administration on encroachment removal', status: 'Open', deadlineDate: '2026-08-15' },
      { topic: 'Site handover for remaining 7 blocks', status: 'Closed', deadlineDate: '2025-10-01' },
    ],
    geoPhotos: [
      { url: 'https://picsum.photos/seed/patna-convenience-1/640/480', caption: 'Site 4 — foundation work', photoDate: '2026-07-05' },
      { url: 'https://picsum.photos/seed/patna-convenience-2/640/480', caption: 'Site 2 — encroachment dispute area', photoDate: '2026-06-15' },
    ],
  },

  // Earliest-lifecycle project — covers the Conceptualization bucket on the
  // Overview page's "Active Projects — Current Stage" widget (the other 5
  // dummy projects span Tender/Construction/O&M/Pre-Tender/Design, so
  // without this one that bucket would stay empty). Contract & Security is
  // intentionally sparse — no agreement has been signed yet at this stage.
  {
    input: {
      projectName: 'Purnea Integrated Sewerage & Drainage Master Plan',
      sectorName: 'Sewerage',
      city: 'Purnea',
      divisionName: 'Purnea',
      pd: 'Er. Manoj Kumar',
      mainWork: 'Proposed integrated sewerage and storm water drainage network for Purnea town — DPR under preparation.',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      projectBrief: 'Conceptual master plan for Purnea’s first integrated sewerage and drainage network. DPR preparation underway; no contract awarded yet.',
      schemeNames: [],

      projectStageV2: 'Conceptualisation',
      // Legacy stage column — see note on the Patna Sewerage project above.
      projectStage: 'Conceptualization',
      status: 'Not Started',
      plannedEndDate: null,
      expectedCompletionDate: '2029-03-31',

      priority: 'Medium',
      sanctionedCostCr: 145,
      physicalProgressPct: 0,
      financialProgressPct: 0,
      scheduledProgressPct: 0,

      geoTaggingUrl: 'https://maps.google.com/?q=Purnea+Sewerage+Master+Plan',

      remark: null,
      omApplicable: false,

      mprMonth: '2026-07',
      mainComponentScope: 'Trunk sewers, STP, storm water drains (DPR stage — scope indicative)',
      mprRemark: 'DPR under preparation; consultant appointed.',
    },
    cosEotItems: [],
    mgmtActions: [
      { topic: 'Complete DPR and submit for technical sanction', status: 'Open', deadlineDate: '2026-11-30' },
    ],
    geoPhotos: [],
  },

  {
    input: {
      projectName: 'Darbhanga Water Supply Distribution Network Upgrade',
      sectorName: 'Water Supply',
      city: 'Darbhanga',
      divisionName: 'Darbhanga',
      contractor: 'M/s Mithila Water Infra Pvt. Ltd.',
      pd: 'Er. Priya Ranjan',
      mainWork: 'Replacement of 30 km ageing distribution pipeline and installation of 8 new overhead tanks.',
      physicalWorkProgressNote: 'Pipeline replacement 45% complete across 4 wards.',
      contractType: 'Work Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: '2024-02-15',
      projectBrief: 'Upgrades Darbhanga’s ageing water distribution network to reduce non-revenue water losses and improve pressure in outlying wards.',
      schemeNames: ['AMRUT 2.0'],

      agreementNumber: 'BUIDCO/AGR/2024/0067',
      agreementDate: '2024-04-01',
      appointedDate: '2024-04-10',
      contractValueCr: 56.4,
      mobAdvanceIssuedCr: 5.64,
      mobAdvanceRecoveredCr: 2.1,
      advanceOutstandingCr: 3.54,
      retentionMoneyHeldCr: 1.4,
      pbgNumber: 'PBG/SBI/2024/2210',
      pbgAmountCr: 2.82,
      pbgExpiryDate: '2027-04-09',
      pbgIssuingBank: 'State Bank of India',
      emdAmountCr: 1.13,
      emdRefNumber: 'EMD/2024/0067',
      emdDate: '2024-01-20',
      totalPaymentsCr: 24.6,
      lastPaymentDate: '2026-07-20',
      lastRaBillNo: 'RA-9',

      // Created in Tender and advanced to Construction post-create (see
      // `advanceToStage` below) — the API rejects creating a project
      // directly in Construction/O&M (Tendor_Dashboard.md §9).
      projectStageV2: 'Tender',
      // Legacy stage column — see note on the Patna Sewerage project above.
      projectStage: 'Construction',
      status: 'In Progress',
      plannedEndDate: '2027-03-31',
      revisedEndDate: null,
      expectedCompletionDate: '2027-05-31',
      delayReason: 'Pipe supply delays from vendor due to raw material shortage.',
      deptStuckAt: null,

      priority: 'High',
      sanctionedCostCr: 62,
      aaAmountCr: 60,
      revisedAaAmountCr: 62,
      agreementAmountCr: 56.4,
      physicalProgressPct: 45,
      financialProgressCr: 24.6,
      financialProgressPct: 43.6,
      scheduledProgressPct: 50,

      geoTaggingUrl: 'https://maps.google.com/?q=Darbhanga+Water+Supply+Upgrade',

      remark: null,

      omApplicable: true,
      omStartDate: '2027-06-01',
      omPeriodMonths: 60,
      omEndDate: '2032-05-31',
      omAgency: 'M/s Mithila Water Infra Pvt. Ltd.',
      omStatusOverride: 'Not Started',
      omRemarks: 'O&M scope covers distribution network and overhead tank maintenance.',

      mprMonth: '2026-07',
      fundReceivedCr: 28,
      expenditureCentralRaw: '10.5',
      expenditureStateRaw: '14.1',
      manpowerEngagedRaw: '95',
      mainComponentScope: 'Distribution pipeline, overhead tanks',
      progressPrevMonthRaw: '40',
      progressThisMonthRaw: '45',
      mprRemark: 'On track; minor vendor supply delays.',
    },
    cosEotItems: [
      {
        cosNumber: 'COS-01',
        cosDate: '2025-11-10',
        category: 'QUANTITY VARIATION',
        cosAmountCr: 2.1,
        variationPct: 3.7,
        eotNumber: 'EOT-01',
        eotDaysGranted: 60,
        timeLinked: true,
        originalEndDate: '2027-01-31',
        newEndDate: '2027-03-31',
      },
    ],
    mgmtActions: [
      { topic: 'Expedite pipe delivery from vendor', status: 'Open', deadlineDate: '2026-09-10' },
      { topic: 'Complete ward 3 tie-in and commissioning', status: 'Closed', deadlineDate: '2026-05-15' },
    ],
    geoPhotos: [
      { url: 'https://picsum.photos/seed/darbhanga-water-1/640/480', caption: 'Pipeline trenching — Ward 4', photoDate: '2026-07-08' },
      { url: 'https://picsum.photos/seed/darbhanga-water-2/640/480', caption: 'Overhead tank foundation', photoDate: '2026-06-25' },
    ],
    advanceToStage: 'Construction',
  },

  {
    input: {
      projectName: 'Munger Storm Water Drainage & Flood Mitigation',
      sectorName: 'SWD',
      city: 'Munger',
      divisionName: 'Munger',
      pd: 'Er. Kavita Sinha',
      mainWork: 'Construction of 12 km primary storm water drains and 3 flood-retention basins along the Ganga floodplain.',
      contractType: 'Work Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: '2025-12-01',
      projectBrief: 'Builds primary storm water drainage and flood-retention capacity for Munger’s low-lying wards prone to Ganga flood backflow.',
      schemeNames: ['STATE FUNDED'],

      projectStageV2: 'Tender',
      // Legacy stage column — see note on the Patna Sewerage project above.
      projectStage: 'Tender',
      workType: 'Tender Work',
      status: 'Not Started',
      plannedEndDate: '2027-12-31',
      expectedCompletionDate: '2027-12-31',

      priority: 'Medium',
      sanctionedCostCr: 48,
      aaAmountCr: 46,
      physicalProgressPct: 0,
      financialProgressCr: 0,
      financialProgressPct: 0,
      scheduledProgressPct: 0,

      geoTaggingUrl: 'https://maps.google.com/?q=Munger+Storm+Water+Drainage',

      remark: 'Flood-retention basin land acquisition at Site 2 pending Revenue Department clearance.',
      omApplicable: false,

      mprMonth: '2026-07',
      fundReceivedCr: 0,
      mainComponentScope: 'Primary drains, flood-retention basins',
      progressPrevMonthRaw: '0',
      progressThisMonthRaw: '0',
      mprRemark: 'Bid evaluation in progress.',
    },
    cosEotItems: [],
    mgmtActions: [
      { topic: 'Follow up with Revenue Dept. on Site 2 land clearance', status: 'Open', deadlineDate: '2026-09-20' },
    ],
    geoPhotos: [
      { url: 'https://picsum.photos/seed/munger-swd-1/640/480', caption: 'Proposed flood-retention basin — Site 1', photoDate: '2026-05-30' },
    ],
  },

  {
    input: {
      projectName: 'Bihar Sharif Electric Crematorium Construction',
      sectorName: 'Crematorium',
      city: 'Bihar Sharif',
      divisionName: 'Nalanda',
      pd: 'Er. Rohit Kumar',
      mainWork: 'Construction of 1 electric cremation unit and ancillary waiting hall at Bihar Sharif municipal crematorium.',
      physicalWorkProgressNote: 'NIT published; bid submission window open.',
      contractType: 'Work Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: '2026-03-01',
      projectBrief: 'Adds electric cremation capacity to Bihar Sharif’s municipal crematorium as part of the state-wide clean cremation initiative.',
      schemeNames: ['STATE FUNDED'],

      projectStageV2: 'Tender',
      // Legacy stage column — see note on the Patna Sewerage project above.
      projectStage: 'Tender',
      status: 'Not Started',
      plannedEndDate: '2027-06-30',
      expectedCompletionDate: '2027-06-30',

      priority: 'Low',
      sanctionedCostCr: 5.5,
      aaAmountCr: 5.3,
      physicalProgressPct: 0,
      financialProgressCr: 0,
      financialProgressPct: 0,
      scheduledProgressPct: 0,

      geoTaggingUrl: 'https://maps.google.com/?q=Bihar+Sharif+Crematorium',

      remark: null,
      omApplicable: false,

      mprMonth: '2026-07',
      fundReceivedCr: 0,
      mainComponentScope: 'Electric cremation unit, waiting hall',
      mprRemark: 'NIT published; awaiting bids.',
    },
    cosEotItems: [],
    mgmtActions: [
      { topic: 'Publish pre-bid meeting minutes', status: 'Closed', deadlineDate: '2026-06-10' },
      { topic: 'Evaluate technical bids', status: 'Open', deadlineDate: '2026-09-05' },
    ],
    geoPhotos: [],
  },

  {
    input: {
      projectName: 'Hajipur Sewerage Treatment Plant Expansion',
      sectorName: 'Sewerage',
      city: 'Hajipur',
      divisionName: 'Vaishali',
      contractor: 'M/s Ganga Valley Infra Pvt. Ltd.',
      pd: 'Er. Neha Kumari',
      mainWork: 'Expansion of existing STP capacity from 10 MLD to 25 MLD and rehabilitation of 2 lift stations.',
      physicalWorkProgressNote: 'Construction complete; STP commissioning trials underway.',
      contractType: 'O&M Contract',
      sponsoringDept: 'Urban Development & Housing Department',
      implementingAgency: 'BUIDCO',
      sanctionDate: '2020-06-15',
      projectBrief: 'Expands Hajipur’s sewage treatment capacity to keep pace with population growth and improves lift station reliability.',
      schemeNames: ['Namami Gange'],

      agreementNumber: 'BUIDCO/AGR/2020/0054',
      agreementDate: '2020-08-01',
      appointedDate: '2020-08-10',
      contractValueCr: 42.3,
      mobAdvanceIssuedCr: 4.23,
      mobAdvanceRecoveredCr: 4.23,
      advanceOutstandingCr: 0,
      retentionMoneyHeldCr: 1.3,
      pbgNumber: 'PBG/UCO/2020/0198',
      pbgAmountCr: 2.1,
      pbgExpiryDate: '2026-08-09',
      pbgIssuingBank: 'UCO Bank',
      emdAmountCr: 0.85,
      emdRefNumber: 'EMD/2020/0054',
      emdDate: '2020-05-20',
      totalPaymentsCr: 42.3,
      lastPaymentDate: '2026-04-10',
      lastRaBillNo: 'RA-11 (Final)',

      // Created in Tender and advanced to Construction then O&M post-create
      // (see `advanceToStage` below) — the API rejects creating a project
      // directly in Construction/O&M (Tendor_Dashboard.md §9).
      projectStageV2: 'Tender',
      // Legacy stage column — see note on the Patna Sewerage project above.
      projectStage: 'O&M',
      status: 'Completed',
      plannedEndDate: '2026-03-31',
      revisedEndDate: '2026-05-31',
      expectedCompletionDate: '2026-05-31',
      delayReason: 'Equipment commissioning delayed due to grid power fluctuations.',
      deptStuckAt: null,

      priority: 'Medium',
      sanctionedCostCr: 44,
      aaAmountCr: 43,
      revisedAaAmountCr: 44,
      agreementAmountCr: 42.3,
      physicalProgressPct: 100,
      financialProgressCr: 42.3,
      financialProgressPct: 100,
      scheduledProgressPct: 100,

      geoTaggingUrl: 'https://maps.google.com/?q=Hajipur+STP+Expansion',

      remark: null,

      omApplicable: true,
      omStartDate: '2026-06-01',
      omPeriodMonths: 60,
      omEndDate: '2031-05-31',
      omAgency: 'M/s Ganga Valley Infra Pvt. Ltd.',
      omStatusOverride: 'Ongoing',
      omRemarks: 'O&M covers STP process equipment and both lift stations.',

      mprMonth: '2026-07',
      fundReceivedCr: 42.3,
      expenditureCentralRaw: '21',
      expenditureStateRaw: '21.3',
      manpowerEngagedRaw: '6',
      mainComponentScope: 'STP expansion, lift station rehabilitation',
      progressPrevMonthRaw: '98',
      progressThisMonthRaw: '100',
      mprRemark: 'Complete; O&M handover done.',
    },
    cosEotItems: [
      {
        cosNumber: 'COS-01',
        cosDate: '2025-09-01',
        category: 'DESIGN CHANGE',
        cosAmountCr: 1.2,
        variationPct: 2.8,
        eotNumber: 'EOT-01',
        eotDaysGranted: 61,
        timeLinked: true,
        originalEndDate: '2026-03-31',
        newEndDate: '2026-05-31',
      },
    ],
    mgmtActions: [
      { topic: 'Schedule 6-month O&M performance review', status: 'Open', deadlineDate: '2026-12-01' },
    ],
    geoPhotos: [
      { url: 'https://picsum.photos/seed/vaishali-stp-1/640/480', caption: 'Expanded STP — commissioning trial', photoDate: '2026-05-20' },
    ],
    advanceToStage: 'O&M',
  },
];

async function main(): Promise<void> {
  await assertDemoSeedingAllowed('seedDummyProjects');
  const sectorRows = await db.query.sector.findMany();
  const divisionRows = await db.query.division.findMany();
  const schemeRows = await db.query.scheme.findMany();

  const sectorByName = new Map(sectorRows.map((s) => [s.sectorName, s.sectorId]));
  const divisionByName = new Map(divisionRows.map((d) => [d.divisionName, d.divisionId]));
  const schemeByName = new Map(schemeRows.map((s) => [s.schemeName, s.schemeId]));

  for (const dp of DUMMY_PROJECTS) {
    const { sectorName, divisionName, schemeNames, ...rest } = dp.input;

    const [existing] = await db
      .select({ projectId: project.projectId, projectStage: project.projectStage, workType: project.workType })
      .from(project)
      .where(eq(project.projectName, rest.projectName))
      .limit(1);
    if (existing) {
      // Rows from an earlier run of this script predate the legacy
      // projectStage/workType fields — backfill them in place so the
      // Overview page's stage-buckets widget (which reads those columns,
      // not projectStageV2) picks these projects up without re-seeding
      // from scratch (which would also duplicate the child records below).
      const legacyPatch: { projectStage?: typeof rest.projectStage; workType?: typeof rest.workType } = {};
      if (rest.projectStage !== undefined && rest.projectStage !== existing.projectStage) {
        legacyPatch.projectStage = rest.projectStage;
      }
      if (rest.workType !== undefined && rest.workType !== existing.workType) {
        legacyPatch.workType = rest.workType;
      }
      if (Object.keys(legacyPatch).length > 0) {
        await updateProject(existing.projectId, legacyPatch, SEED_ACTOR);
        process.stdout.write(`skip  ${rest.projectName} (already exists) — backfilled legacy stage fields\n`);
      } else {
        process.stdout.write(`skip  ${rest.projectName} (already exists)\n`);
      }
      continue;
    }

    const sectorId = sectorByName.get(sectorName) ?? null;
    const divisionId = divisionByName.get(divisionName) ?? null;
    if (!sectorId) process.stderr.write(`  ! sector "${sectorName}" not found — leaving blank\n`);
    if (!divisionId) process.stderr.write(`  ! division "${divisionName}" not found — leaving blank\n`);
    const schemeIds = schemeNames
      .map((n) => schemeByName.get(n))
      .filter((id): id is number => id !== undefined);

    const parsedInput = createProjectSchema.parse({ ...rest, sectorId, divisionId, schemes: schemeIds });
    const created = await createProject(parsedInput, SEED_ACTOR);

    if (dp.advanceToStage) {
      // Walk Tender → (sub-stage complete) → Construction → (O&M if needed),
      // mirroring what the Tender Dashboard's transfer flow does, since the
      // API rejects creating a project directly in Construction/O&M.
      await updateProject(created.projectId, { tenderSubStage: FINAL_TENDER_SUB_STAGE }, SEED_ACTOR);
      await updateProject(created.projectId, { projectStageV2: 'Construction' }, SEED_ACTOR);
      if (dp.advanceToStage === 'O&M') {
        await updateProject(created.projectId, { projectStageV2: 'O&M' }, SEED_ACTOR);
      }
    }

    for (const item of dp.cosEotItems) {
      await createCosEot(created.projectId, cosEotCreateSchema.parse(item), SEED_ACTOR);
    }
    for (const action of dp.mgmtActions) {
      await createMgmtAction(created.projectId, action, SEED_ACTOR);
    }
    for (const photo of dp.geoPhotos) {
      await createGeoPhotoUrl(created.projectId, photo, SEED_ACTOR);
    }

    process.stdout.write(`apply ${rest.projectName}\n`);
  }

  process.stdout.write('Dummy project seed complete.\n');
}

main()
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
