# Application Testing & Audit suite

Automates the four test scenarios in `bhaveshTask.md` and produces the Word
audit document, with Before → Action → After screenshots and the changed
element outlined in every image.

## Running it

From `frontend/`, with the local stack up (API on :4000 started with
`npm run dev`, which sets `NODE_ENV=development`; Vite on :5173; local
Postgres) and the demo accounts seeded with a password of your choosing:

```bash
# backend/ — creates the demo_* accounts, or resets their password
DEMO_ACCOUNT_PASSWORD=<12+ characters> npm run db:seed-demo-roles

# frontend/ — the suites read the same variable; nothing is hardcoded
DEMO_ACCOUNT_PASSWORD=<same value> npm run audit   # runs TC-01..TC-05, writes audit-evidence/
npm run audit:report   # builds ../BUIDCO-Application-Testing-Audit-Report.docx
```

To run against a separate, disposable stack (e.g. a copy of the database on
other ports), also set `E2E_BASE_URL` and `AUDIT_APP_URL` to that frontend's
address; Playwright then uses it instead of starting Vite on :5173.

`npm run audit:clean` deletes the working evidence folder once the report is
signed off. The specs run serially and in order — TC-05 cleans up after the
other four, so don't run a subset and stop.

| Spec | Case | Scenario |
|---|---|---|
| `scenario1-create` | TC-01 | Create three projects through the Input Sheet |
| `scenario2-crud`   | TC-02 | Create / Read / Update / Delete on one test project |
| `scenario3-expiry` | TC-03 | O&M and PBG behaviour before, one day before, and after expiry |
| `scenario4-import` | TC-04 | Import projects from an Excel sheet |
| `scenario5-cleanup`| TC-05 | Remove all test data and verify the baseline is restored |

## Output

Everything lands in `frontend/audit-evidence/` (gitignored):

```
screenshots/   annotated PNGs, named <case>-<seq>-<slug>.png
evidence/      one JSON per case — the 15 documentation fields, plus tables
files/         the generated Excel import workbook
```

The Word report is built from those JSON files, so it can never claim a result
the run didn't produce. Re-running `audit:report` alone rebuilds the document
from the existing evidence without re-testing.

## How test data is kept safe

`bhaveshTask.md` §0 requires that testing cannot touch real data. The kit
enforces that structurally rather than by convention:

- **Local only.** The suite targets `localhost:5173` (or `E2E_BASE_URL`). It is
  never pointed at a deployed environment — and a production API refuses the
  demo_* accounts anyway.
- **No published credentials.** The demo password comes from
  `DEMO_ACCOUNT_PASSWORD`; the value that used to be written in the specs was
  public and has been removed (security finding S-02).
- **Tagged.** Every record created carries the `ZZ-AUDIT` prefix, so test data
  is obvious in any list and sorts to the bottom.
- **Never deleted by pattern.** Each created row's id is written to
  `evidence/created-projects.json` the moment it exists. Cleanup deletes by id
  from that registry, and `apiDeleteAuditProject` re-reads each row and refuses
  unless the name still carries the tag. A crashed run leaves a registry that
  the cleanup spec can still finish from.
- **Nothing pre-existing is modified.** The update and expiry scenarios mutate
  only projects the same run created.
- **Proven afterwards.** TC-05 re-reads every KPI tile and asserts the counts
  match the baseline TC-01 recorded before any change.

## Adding a scenario

Create `scenarioN-*.audit.spec.ts`, build a `Recorder` with a new `TC-0N` id,
and call `rec.step/expected/actual/change/remark/table` as the test runs plus
`rec.shot(page, …)` for evidence. `rec.save()` at the end writes the JSON; the
report builder picks up any `TC-*.json` automatically, in id order.
