import { useState } from 'react';
import { useCreateSchemeMutation, useCreateSectorMutation, useGetLookupsQuery } from '../../app/api/lookupsApi';
import { AddLookupItemDialog } from '../ui/AddLookupItemDialog';
import { Card, CardContent } from '../ui/card';
import { FormField } from './FormField';
import { FormSectionHeader } from './FormSectionHeader';
import { MultiSelectField } from './MultiSelectField';
import type { ProjectDraft } from '../../hooks/useProjectDraft';
import type { ContractType } from '../../types/api';

/** Sentinel option value for the Sector dropdown's "+ Add New Sector" row —
 *  never a real sectorId, so it can't collide with an actual selection. */
const ADD_NEW_SECTOR = '__add_new_sector__';

interface Props {
  draft: ProjectDraft;
  setField: <K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) => void;
  /**
   * When true, all inputs render disabled. Used for PD/Viewer viewing a
   * Fixed Input section — Basic Info is edit-locked to MD/Admin, but the
   * data itself stays visible for context.
   */
  readOnly?: boolean;
  /** Override the default section number (used by the ALL Fields tab). */
  num?: string;
}

/** Contract Type dropdown — required field (Phase A §3.1). */
const CONTRACT_TYPES = ['Work Contract', 'Service Contract', 'O&M Contract', 'Others'] as const;

export function BasicInfoSection({ draft, setField, readOnly = false, num = '01' }: Props): JSX.Element {
  const { data: lookups } = useGetLookupsQuery();
  const sectors = lookups?.sectors ?? [];
  const schemes = lookups?.schemes ?? [];
  const regions = lookups?.regions ?? [];
  const divisions = lookups?.divisions ?? [];

  const [createSector] = useCreateSectorMutation();
  const [createScheme] = useCreateSchemeMutation();
  const [addSectorOpen, setAddSectorOpen] = useState(false);
  const [addSchemeOpen, setAddSchemeOpen] = useState(false);

  // Division belongs to exactly one Region, so the Region picker filters the
  // Division dropdown. Region isn't stored on the project — it's derived from
  // whichever division is picked. We keep a local pickedRegionId so the user
  // can filter without also committing a division yet, and it auto-syncs when
  // the draft's divisionId changes (e.g. on edit-mode hydrate).
  const selectedDivision = divisions.find((d) => d.divisionId === draft.divisionId);
  const derivedRegionId = selectedDivision?.regionId ?? null;
  const [pickedRegionId, setPickedRegionId] = useState<number | null>(derivedRegionId);
  // When the draft's division changes (edit-mode load or explicit selection),
  // snap the region filter to match so the dropdown reflects reality.
  const effectiveRegionId = derivedRegionId ?? pickedRegionId;
  const filteredDivisions = effectiveRegionId
    ? divisions.filter((d) => d.regionId === effectiveRegionId)
    : divisions;

  return (
    <Card>
      <CardContent className="pt-4">
        <FormSectionHeader num={num} title="Basic Info" sub="Core project identification details" />
        {readOnly ? <FixedInputReadOnlyBanner /> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FormField
            label="Project Name"
            value={draft.projectName}
            onChange={(v) => setField('projectName', v)}
            required
            disabled={readOnly}
          />
          <FormField
            label="Sector"
            type="select"
            value={draft.sectorId === null ? '' : String(draft.sectorId)}
            onChange={(v) => {
              if (v === ADD_NEW_SECTOR) {
                setAddSectorOpen(true);
                return;
              }
              setField('sectorId', v ? Number(v) : null);
            }}
            options={[
              ...sectors.map((s) => ({ value: String(s.sectorId), label: s.sectorName })),
              { value: ADD_NEW_SECTOR, label: '+ Add New Sector' },
            ]}
            disabled={readOnly}
          />
          <FormField
            label="City"
            value={draft.city}
            onChange={(v) => setField('city', v || null)}
            disabled={readOnly}
          />
          <FormField
            label="Division"
            type="select"
            value={draft.divisionId === null ? '' : String(draft.divisionId)}
            onChange={(v) => {
              const next = v ? Number(v) : null;
              setField('divisionId', next);
              // Auto-sync Region so the label matches even if the user hadn't
              // touched the Region picker yet.
              if (next !== null) {
                const d = divisions.find((x) => x.divisionId === next);
                if (d) setPickedRegionId(d.regionId);
              }
            }}
            options={filteredDivisions.map((d) => ({
              value: String(d.divisionId),
              label: d.divisionName,
            }))}
            hint={
              effectiveRegionId === null
                ? 'Showing all divisions — pick a Region below to narrow'
                : `Showing ${filteredDivisions.length} division(s) in this region`
            }
            disabled={readOnly}
          />
          <FormField
            label="Region"
            type="select"
            value={effectiveRegionId === null ? '' : String(effectiveRegionId)}
            onChange={(v) => {
              const next = v ? Number(v) : null;
              setPickedRegionId(next);
              // If the currently-selected division doesn't belong to the newly
              // picked region, clear it so the user picks a valid one.
              if (
                next !== null && selectedDivision && selectedDivision.regionId !== next
              ) {
                setField('divisionId', null);
              }
            }}
            options={regions.map((r) => ({
              value: String(r.regionId),
              label: r.regionName,
            }))}
            hint={
              derivedRegionId !== null
                ? '🔒 Auto-selected from Division — clear Division above to change it'
                : 'Optional — narrows the Division list above'
            }
            // Once a Division is picked, Region is derived from it and locked;
            // it only becomes independently editable when no Division is set.
            disabled={readOnly || derivedRegionId !== null}
          />
          <FormField
            label="Contractor"
            value={draft.contractor}
            onChange={(v) => setField('contractor', v || null)}
            disabled={readOnly}
          />
          <FormField
            label="PD"
            value={draft.pd}
            onChange={(v) => setField('pd', v || null)}
            disabled={readOnly}
          />
          <MultiSelectField
            label="Scheme(s)"
            value={draft.schemes}
            onChange={(v) => setField('schemes', v)}
            options={schemes.map((s) => ({ value: s.schemeId, label: s.schemeName }))}
            placeholder="+ Add scheme"
            className="md:col-span-2"
            disabled={readOnly}
            onAddNew={() => setAddSchemeOpen(true)}
            addNewLabel="+ Add New Scheme"
          />
          <FormField
            label="Main Work"
            type="textarea"
            rows={3}
            value={draft.mainWork}
            onChange={(v) => setField('mainWork', v || null)}
            className="md:col-span-2"
            disabled={readOnly}
          />
          <FormField
            label="Physical Work Progress (free text)"
            value={draft.physicalWorkProgressNote}
            onChange={(v) => setField('physicalWorkProgressNote', v || null)}
            hint="Descriptive note. Use Section 03 for numeric %."
            className="md:col-span-2"
            disabled={readOnly}
          />
          <FormField
            label="Contract Type"
            type="select"
            value={draft.contractType ?? ''}
            onChange={(v) => setField('contractType', (v as ContractType) || null)}
            options={CONTRACT_TYPES as unknown as string[]}
            required
            disabled={readOnly}
          />
          <FormField
            label="Sponsoring Department"
            value={draft.sponsoringDept}
            onChange={(v) => setField('sponsoringDept', v || null)}
            disabled={readOnly}
          />
          <FormField
            label="Implementing Agency"
            value={draft.implementingAgency}
            onChange={(v) => setField('implementingAgency', v || null)}
            disabled={readOnly}
          />
          <FormField
            label="Project Sanction Date"
            type="date"
            value={draft.sanctionDate}
            onChange={(v) => setField('sanctionDate', v || null)}
            disabled={readOnly}
          />
        </div>
        <div className="mt-3">
          <FormField
            label="Project Brief"
            type="textarea"
            rows={3}
            value={draft.projectBrief}
            onChange={(v) => setField('projectBrief', v || null)}
            disabled={readOnly}
          />
        </div>
      </CardContent>

      {addSectorOpen ? (
        <AddLookupItemDialog
          title="Add New Sector"
          fieldLabel="Sector Name"
          placeholder="e.g. Water Supply"
          onSubmit={(name) => createSector(name).unwrap()}
          onClose={() => setAddSectorOpen(false)}
          onCreated={(result) => setField('sectorId', (result as { sectorId: number }).sectorId)}
        />
      ) : null}

      {addSchemeOpen ? (
        <AddLookupItemDialog
          title="Add New Scheme"
          fieldLabel="Scheme Name"
          placeholder="e.g. Namami Gange"
          onSubmit={(name) => createScheme(name).unwrap()}
          onClose={() => setAddSchemeOpen(false)}
          onCreated={(result) =>
            setField('schemes', [...draft.schemes, (result as { schemeId: number }).schemeId])
          }
        />
      ) : null}
    </Card>
  );
}

/**
 * Shown at the top of Basic Info / Contract & Security when the current
 * user isn't MD/Admin — makes it obvious *why* every input is greyed out
 * (they're viewing a Fixed Input section that only MD/Admin can change).
 */
function FixedInputReadOnlyBanner(): JSX.Element {
  return (
    <div
      role="note"
      className="mb-3 flex items-start gap-2 rounded border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[12px] text-[#92400E]"
    >
      <span aria-hidden className="text-[13px]">🔒</span>
      <div>
        <p className="font-semibold">Read-only — Fixed Input section</p>
        <p className="mt-0.5 text-[11.5px] text-[#78350F]/80">
          Only MD and Admin roles can change Basic Info or Contract &amp; Security
          fields. Ask an Admin if a change is needed here.
        </p>
      </div>
    </div>
  );
}
