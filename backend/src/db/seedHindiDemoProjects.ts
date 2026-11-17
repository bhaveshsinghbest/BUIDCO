/**
 * Seed 10 Hindi-language demo projects with every field populated.
 *
 * Purpose: exercise the Hindi/Hinglish search from the opposite direction.
 * The rest of the register is in English, so a Hindi query matching English
 * rows is all that could be tested. These rows are written in Devanagari, so
 * typing ENGLISH in the search bar must find them — which only works because
 * the dictionary is bidirectional (see lib/hindiSearch/dictionary.ts).
 *
 * Every project is named with vocabulary that is in searchSynonyms.json, so
 * each one is reachable by an English word:
 *
 *   type "bridge"      -> पटना पुल निर्माण परियोजना
 *   type "road"        -> गया सड़क चौड़ीकरण कार्य
 *   type "drainage"    -> मुजफ्फरपुर जल निकासी सुधार
 *   type "water supply"-> भागलपुर जलापूर्ति विस्तार
 *   type "drain"       -> दरभंगा नाला पुनर्निर्माण
 *   type "sewerage"    -> पूर्णिया सीवरेज नेटवर्क
 *   type "toilet"      -> आरा शौचालय निर्माण
 *   type "park"        -> बेगूसराय पार्क विकास
 *   type "pond"        -> कटिहार तालाब सौंदर्यीकरण
 *   type "building"    -> नालंदा भवन मरम्मत
 *
 * ## Safety
 *
 * Every row uses one of the ten fixed project ids below, so this script can
 * only ever touch its own data — it never reads or writes a project it did
 * not create. Re-running refreshes those ten rows and nothing else.
 *
 *   npm run db:seed-hindi-demo              create or refresh the ten rows
 *   npm run db:seed-hindi-demo -- --remove  delete them again
 */
import { inArray, sql } from 'drizzle-orm';
import { db } from './client.js';
import { assertDemoSeedingAllowed } from './seedGuard.js';
import { district, division, project, projectScheme, scheme, sector } from './schema.js';

/**
 * The only ids this script will ever touch.
 *
 * These MUST be syntactically valid UUIDs. `project.project_id` is a `text`
 * column, so the database accepts anything — but every per-project route
 * validates the id as a UUID, so a readable id like `HIN-DEMO-01` produces
 * rows that list correctly and then 400 on the detail endpoint: the profile
 * modal opens empty, and editing is impossible. A fixed, hand-written set
 * keeps them instantly recognisable (and exactly removable) while staying
 * valid: version nibble 4, variant nibble 8, counter in the last group.
 */
const IDS = Array.from(
  { length: 10 },
  (_, i) => `11111111-2222-4333-8444-5555555550${String(i + 1).padStart(2, '0')}`,
);

interface Spec {
  id: string;
  /** Hindi project name — the thing an English query has to find. */
  name: string;
  /** English district name, resolved to an id at run time. */
  districtName: string;
  /** Hindi city name, so the city column is Hindi too. */
  cityHi: string;
  sectorName: string;
  schemeName: string;
  /** The English word the user should be able to type. Printed on completion. */
  findBy: string;
  work: string;
  scope: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'On Hold' | 'Delayed';
  stage: 'Conceptualisation' | 'Design' | 'Pre-Tender' | 'Tender' | 'Construction' | 'O&M' | 'Other';
  /** Required when stage is Tender, forbidden otherwise (DB check constraint). */
  subStage:
    | 'NIT Published'
    | 'Bid Submission (Open)'
    | 'Technical Evaluation'
    | 'Financial Evaluation'
    | 'Approval Process'
    | 'LoA Issued'
    | 'Agreement Signing'
    | 'Work Order Issued'
    | null;
  priority: 'High' | 'Medium' | 'Low' | 'N/A';
  physical: number;
  cost: number;
}

const SPECS: Spec[] = [
  {
    id: IDS[0]!, name: 'पटना पुल निर्माण परियोजना', districtName: 'Patna', cityHi: 'पटना',
    sectorName: 'Others', schemeName: 'Patna Smart City', findBy: 'bridge',
    work: 'गंगा नदी पर चार लेन पुल का निर्माण तथा पहुँच पथ का विकास',
    scope: 'पुल निर्माण, पहुँच सड़क, प्रकाश व्यवस्था एवं सुरक्षा रेलिंग',
    status: 'In Progress', stage: 'Construction', subStage: null, priority: 'High',
    physical: 62, cost: 148.5,
  },
  {
    id: IDS[1]!, name: 'गया सड़क चौड़ीकरण कार्य', districtName: 'Gaya', cityHi: 'गया',
    sectorName: 'Others', schemeName: 'SAAT NISHCHAY', findBy: 'road',
    work: 'मुख्य बाजार मार्ग का चौड़ीकरण एवं नाली सहित सुदृढ़ीकरण',
    scope: 'सड़क चौड़ीकरण, नाली निर्माण, फुटपाथ एवं साइनेज',
    status: 'Delayed', stage: 'Construction', subStage: null, priority: 'High',
    physical: 38, cost: 76.25,
  },
  {
    id: IDS[2]!, name: 'मुजफ्फरपुर जल निकासी सुधार', districtName: 'Muzaffarpur', cityHi: 'मुजफ्फरपुर',
    sectorName: 'SWD', schemeName: 'AMRUT 2.0', findBy: 'drainage',
    work: 'शहरी क्षेत्र में वर्षा जल निकासी प्रणाली का सुधार एवं पम्पिंग स्टेशन',
    scope: 'जल निकासी नाला, पम्पिंग स्टेशन एवं आउटफॉल निर्माण',
    status: 'In Progress', stage: 'Construction', subStage: null, priority: 'High',
    physical: 54, cost: 112,
  },
  {
    id: IDS[3]!, name: 'भागलपुर जलापूर्ति विस्तार', districtName: 'Bhagalpur', cityHi: 'भागलपुर',
    sectorName: 'Water Supply', schemeName: 'AMRUT 1.0', findBy: 'water supply',
    work: 'नगर निगम क्षेत्र में पेयजल आपूर्ति नेटवर्क का विस्तार',
    scope: 'जलापूर्ति पाइपलाइन, जलमीनार एवं घरेलू कनेक्शन',
    status: 'In Progress', stage: 'Construction', subStage: null, priority: 'Medium',
    physical: 71, cost: 95.4,
  },
  {
    id: IDS[4]!, name: 'दरभंगा नाला पुनर्निर्माण', districtName: 'Darbhanga', cityHi: 'दरभंगा',
    sectorName: 'SWD', schemeName: 'STATE FUNDED', findBy: 'drain',
    work: 'पुराने खुले नाले का ढका हुआ नाला के रूप में पुनर्निर्माण',
    scope: 'नाला पुनर्निर्माण, सिल्ट निकासी एवं कवर स्लैब',
    status: 'On Hold', stage: 'Design', subStage: null, priority: 'Medium',
    physical: 12, cost: 34.8,
  },
  {
    id: IDS[5]!, name: 'पूर्णिया सीवरेज नेटवर्क', districtName: 'Purnia', cityHi: 'पूर्णिया',
    sectorName: 'Sewerage', schemeName: 'Namami Gange', findBy: 'sewerage',
    work: 'भूमिगत मलजल निकासी नेटवर्क एवं शोधन संयंत्र का निर्माण',
    scope: 'सीवर लाइन, पम्पिंग स्टेशन एवं मलजल शोधन संयंत्र',
    status: 'Not Started', stage: 'Tender', subStage: 'Technical Evaluation', priority: 'High',
    physical: 0, cost: 201.75,
  },
  {
    id: IDS[6]!, name: 'आरा शौचालय निर्माण', districtName: 'Bhojpur', cityHi: 'आरा',
    sectorName: 'Others', schemeName: 'SAAT NISHCHAY', findBy: 'toilet',
    work: 'सार्वजनिक स्थलों पर सामुदायिक शौचालय का निर्माण',
    scope: 'शौचालय ब्लॉक, जलापूर्ति एवं सेप्टिक टैंक',
    status: 'Completed', stage: 'O&M', subStage: null, priority: 'Low',
    physical: 100, cost: 18.6,
  },
  {
    id: IDS[7]!, name: 'बेगूसराय पार्क विकास', districtName: 'Begusarai', cityHi: 'बेगूसराय',
    sectorName: 'Others', schemeName: 'Pragati Yatra', findBy: 'park',
    work: 'नगर उद्यान का सौंदर्यीकरण एवं बाल क्रीड़ा क्षेत्र का विकास',
    scope: 'उद्यान विकास, पैदल पथ, प्रकाश व्यवस्था एवं बैठने की व्यवस्था',
    status: 'In Progress', stage: 'Construction', subStage: null, priority: 'Low',
    physical: 44, cost: 22.3,
  },
  {
    id: IDS[8]!, name: 'कटिहार तालाब सौंदर्यीकरण', districtName: 'Katihar', cityHi: 'कटिहार',
    sectorName: 'Others', schemeName: 'STATE FUNDED', findBy: 'pond',
    work: 'ऐतिहासिक तालाब का जीर्णोद्धार एवं घाट निर्माण',
    scope: 'तालाब सफाई, घाट निर्माण एवं परिक्रमा पथ',
    status: 'Delayed', stage: 'Construction', subStage: null, priority: 'Medium',
    physical: 29, cost: 41.9,
  },
  {
    id: IDS[9]!, name: 'नालंदा भवन मरम्मत', districtName: 'Nalanda', cityHi: 'बिहार शरीफ',
    sectorName: 'Others', schemeName: 'STATE FUNDED', findBy: 'building',
    work: 'प्रशासनिक भवन की मरम्मत एवं विद्युत कार्य',
    scope: 'भवन मरम्मत, छत उपचार, विद्युत एवं रंग-रोगन',
    status: 'Not Started', stage: 'Pre-Tender', subStage: null, priority: 'N/A',
    physical: 0, cost: 9.75,
  },
];

/** `YYYY-MM-DD`, `base` shifted by `days`. Deterministic, so re-runs match. */
function shiftDate(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Drizzle types a `numeric` column as string, not number. Formatting here
 * rather than letting the driver coerce keeps the stored value at exactly
 * the scale these money columns are declared with.
 */
function num(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

const CONTRACTORS = [
  'मेसर्स गंगा निर्माण प्राइवेट लिमिटेड',
  'मेसर्स बिहार अभियंत्रण संस्थान',
  'मेसर्स कोसी इंफ्रा डेवलपर्स',
  'मेसर्स मगध कंस्ट्रक्शन कंपनी',
  'मेसर्स सोन वैली बिल्डर्स',
];
const PDS = [
  'श्री राजेश कुमार सिंह',
  'श्रीमती अनीता शर्मा',
  'श्री दिनेश प्रसाद यादव',
  'श्रीमती प्रीति कुमारी',
  'श्री मनोज कुमार वर्मा',
];
const BANKS = ['भारतीय स्टेट बैंक', 'पंजाब नेशनल बैंक', 'बैंक ऑफ बड़ौदा', 'केनरा बैंक'];
const OM_AGENCIES = [
  'मेसर्स बिहार संचालन एवं अनुरक्षण सेवा',
  'मेसर्स गंगा सुविधा प्रबंधन',
  'मेसर्स मगध अनुरक्षण संस्थान',
  'मेसर्स कोसी सेवा प्रबंधन',
];
const INSURERS = [
  'न्यू इंडिया एश्योरेंस कंपनी',
  'ओरिएंटल इंश्योरेंस कंपनी',
  'नेशनल इंश्योरेंस कंपनी',
  'यूनाइटेड इंडिया इंश्योरेंस',
];

async function remove(): Promise<void> {
  // project_scheme first — the link rows reference the projects.
  await db.delete(projectScheme).where(inArray(projectScheme.projectId, IDS));
  const deleted = await db.delete(project).where(inArray(project.projectId, IDS)).returning({
    id: project.projectId,
  });
  process.stdout.write(`Removed ${deleted.length} Hindi demo project(s).\n`);
}

async function seed(): Promise<void> {
  /* ---- resolve lookups by name ---- */
  const districts = new Map(
    (await db.select().from(district)).map((d) => [d.districtName, d.districtId]),
  );
  const divisions = await db.select().from(division);
  const sectors = new Map((await db.select().from(sector)).map((s) => [s.sectorName, s.sectorId]));
  const schemes = new Map((await db.select().from(scheme)).map((s) => [s.schemeName, s.schemeId]));

  /**
   * Not every district has a same-named division (Patna and Purnia do not),
   * so fall back to a prefix match and then to the first division rather
   * than leaving the column null — "fill every field" is the point here.
   */
  // District → division spellings that differ in the master data. Without
  // this, "Purnia" matched neither exactly nor by prefix ("Purnea") and fell
  // through to divisions[0] — Arwal, in the other region.
  const DIVISION_ALIASES: Record<string, string> = { Purnia: 'Purnea' };
  const divisionFor = (district: string): number => {
    const name = DIVISION_ALIASES[district] ?? district;
    const exact = divisions.find((d) => d.divisionName === name);
    if (exact !== undefined) return exact.divisionId;
    const prefix = divisions.find((d) =>
      d.divisionName.toLowerCase().startsWith(name.toLowerCase()),
    );
    return prefix?.divisionId ?? divisions[0]!.divisionId;
  };

  // Refresh rather than patch: delete our own ten rows, then insert them.
  await remove();

  const base = '2024-04-01';
  const rows = SPECS.map((s, i) => {
    const n = i + 1;
    const districtId = districts.get(s.districtName) ?? null;
    const sanction = shiftDate(base, n * 11);
    const agreement = shiftDate(sanction, 30);
    const appointed = shiftDate(agreement, 14);
    const plannedEnd = shiftDate(appointed, 540);
    const revisedEnd = shiftDate(plannedEnd, 120);
    const financialPct = Math.max(0, s.physical - 6);
    const contractValue = Number((s.cost * 0.96).toFixed(2));
    const financialCr = Number(((contractValue * financialPct) / 100).toFixed(2));

    return {
      projectId: s.id,
      projectName: s.name,
      sectorId: sectors.get(s.sectorName) ?? null,
      city: s.cityHi,
      districtId,
      divisionId: divisionFor(s.districtName),
      contractor: CONTRACTORS[i % CONTRACTORS.length]!,
      pd: PDS[i % PDS.length]!,
      mainWork: s.work,
      physicalWorkProgressNote: `इस माह ${s.physical}% भौतिक प्रगति दर्ज की गई।`,
      projectStage: s.stage === 'Conceptualisation' ? 'Conceptualization' : (
        s.stage === 'Design' || s.stage === 'Other' ? 'Pre-Tender' : s.stage
      ),
      workType: 'Tender Work',
      contractType: 'Work Contract',
      sponsoringDept: 'नगर विकास एवं आवास विभाग',
      implementingAgency: 'बिहार शहरी आधारभूत संरचना विकास निगम',
      sanctionDate: sanction,
      projectBrief: `${s.name} — ${s.work}। कार्य ${s.cityHi} नगर क्षेत्र में प्रगति पर है।`,
      currentPhase: s.stage === 'Conceptualisation' ? 'Conceptualization' : (
        s.stage === 'Other' ? 'Design' : (s.stage === 'O&M' ? 'O&M' : s.stage)
      ),
      status: s.status,
      projectStageV2: s.stage,
      tenderSubStage: s.subStage,
      nitNumber: `निविदा/${2024 + (n % 2)}/${String(n).padStart(3, '0')}`,
      nitDate: shiftDate(sanction, 10),
      plannedEndDate: plannedEnd,
      revisedEndDate: revisedEnd,
      delayReason:
        s.status === 'Delayed' || s.status === 'On Hold'
          ? 'भूमि अधिग्रहण एवं उपयोगिता स्थानांतरण में विलंब के कारण कार्य प्रभावित।'
          : 'कोई विलंब नहीं।',
      deptStuckAt:
        s.status === 'On Hold' ? 'राजस्व एवं भूमि सुधार विभाग' : 'कोई लंबित स्वीकृति नहीं',
      expectedCompletionDate: revisedEnd,
      expectedCompletionRaw: `अपेक्षित पूर्णता ${revisedEnd}`,
      priority: s.priority,
      sanctionedCostCr: num(s.cost),
      aaAmountCr: num(Number((s.cost * 0.99).toFixed(2))),
      revisedAaAmountCr: num(Number((s.cost * 1.04).toFixed(2))),
      agreementAmountCr: num(contractValue),
      physicalProgressPct: num(s.physical),
      financialProgressCr: num(financialCr),
      financialProgressPct: num(financialPct),
      scheduledProgressPct: num(Math.min(100, s.physical + 8)),
      agreementNumber: `अनुबंध/${2024 + (n % 2)}/${String(n).padStart(3, '0')}`,
      agreementDate: agreement,
      appointedDate: appointed,
      contractValueCr: num(contractValue),
      mobAdvanceIssuedCr: num(Number((contractValue * 0.1).toFixed(2))),
      mobAdvanceRecoveredCr: num(Number((contractValue * 0.06).toFixed(2))),
      advanceOutstandingCr: num(Number((contractValue * 0.04).toFixed(2))),
      retentionMoneyHeldCr: num(Number((contractValue * 0.05).toFixed(2))),
      pbgNumber: `पीबीजी/${String(n).padStart(4, '0')}`,
      pbgAmountCr: num(Number((contractValue * 0.05).toFixed(2))),
      pbgExpiryDate: shiftDate(base, 400 + n * 15),
      pbgIssuingBank: BANKS[i % BANKS.length]!,
      insurancePolicyNo: `बीमा/${2024}/${String(n).padStart(4, '0')}`,
      insurer: INSURERS[i % INSURERS.length]!,
      insuredAmountCr: num(Number((contractValue * 1.1).toFixed(2))),
      insuranceStartDate: shiftDate(base, n * 11),
      insuranceExpiryDate: shiftDate(base, 380 + n * 12),
      emdAmountCr: num(Number((s.cost * 0.02).toFixed(2))),
      emdRefNumber: `ईएमडी/${String(n).padStart(4, '0')}`,
      emdDate: shiftDate(sanction, 5),
      totalPaymentsCr: num(financialCr),
      lastPaymentDate: shiftDate(base, 300 + n * 7),
      lastRaBillNo: `आरए/${String(n).padStart(2, '0')}`,
      geoTaggingUrl: `https://maps.example.gov.in/buidco/${s.id}`,
      remark: `${s.cityHi} इकाई द्वारा मासिक समीक्षा में प्रस्तुत।`,
      managementActionLegacy: 'मुख्य अभियंता स्तर पर साप्ताहिक समीक्षा निर्धारित।',
      // O&M is planned for every contract, so these are filled on all ten
      // rather than only on the one already in the O&M stage — the window
      // simply starts after the construction end date. Only the status
      // override distinguishes "running now" from "not started yet".
      omApplicable: true,
      omStartDate: shiftDate(plannedEnd, 1),
      omPeriodMonths: num(60),
      omEndDate: shiftDate(plannedEnd, 1 + 1825),
      omAgency: OM_AGENCIES[i % OM_AGENCIES.length]!,
      omStatusOverride: s.stage === 'O&M' ? ('Ongoing' as const) : ('Not Started' as const),
      omRemarks:
        s.stage === 'O&M'
          ? 'संचालन एवं अनुरक्षण अनुबंध प्रभावी है।'
          : 'निर्माण पूर्ण होने पर संचालन एवं अनुरक्षण अवधि प्रारंभ होगी।',
      mprMonth: '2026-10',
      fundReceivedCr: num(Number((contractValue * 0.7).toFixed(2))),
      expenditureCentralRaw: `केन्द्रांश व्यय ${(financialCr * 0.6).toFixed(2)} करोड़`,
      expenditureStateRaw: `राज्यांश व्यय ${(financialCr * 0.4).toFixed(2)} करोड़`,
      manpowerEngagedRaw: `कुल ${40 + n * 5} श्रमिक एवं ${4 + n} तकनीकी कर्मी कार्यरत`,
      mainComponentScope: s.scope,
      progressPrevMonthRaw: `गत माह प्रगति ${Math.max(0, s.physical - 5)}%`,
      progressThisMonthRaw: `इस माह प्रगति ${s.physical}%`,
      mprRemark: 'मासिक प्रगति रिपोर्ट समय पर प्रस्तुत।',
      cosEotType: s.status === 'Delayed' ? 'समय विस्तार' : 'लागू नहीं',
      cosEotStatus: s.status === 'Delayed' ? 'स्वीकृत' : 'लागू नहीं',
      cosEotDate: shiftDate(plannedEnd, -20),
      cosEotRemark:
        s.status === 'Delayed'
          ? 'भूमि अधिग्रहण विलंब के आधार पर समय विस्तार स्वीकृत।'
          : 'कोई परिवर्तन नहीं।',
      lastUpdated: new Date(),
      createdAt: new Date(),
    };
  });

  await db.insert(project).values(rows);

  // Scheme links — the search also matches on scheme name.
  const links = SPECS.flatMap((s) => {
    const schemeId = schemes.get(s.schemeName);
    return schemeId === undefined ? [] : [{ projectId: s.id, schemeId }];
  });
  if (links.length > 0) await db.insert(projectScheme).values(links);

  /* ---- report ---- */
  process.stdout.write(`\nInserted ${rows.length} Hindi demo projects (${links.length} scheme links).\n\n`);
  process.stdout.write('Type these ENGLISH words in the search bar to find the Hindi rows:\n');
  for (const s of SPECS) {
    process.stdout.write(`  ${s.findBy.padEnd(14)} ->  ${s.name}\n`);
  }
  process.stdout.write(`\nRemove them again with:  npm run db:seed-hindi-demo -- --remove\n`);
}

async function main(): Promise<void> {
  await assertDemoSeedingAllowed('seedHindiDemoProjects');
  const shouldRemove = process.argv.includes('--remove');
  if (shouldRemove) await remove();
  else await seed();
  // Count only our own rows — never report on anything else.
  const mine = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(project)
    .where(inArray(project.projectId, IDS));
  process.stdout.write(`\nHindi demo projects now in the database: ${mine[0]?.n ?? 0}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
