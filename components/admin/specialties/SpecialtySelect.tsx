"use client";

import type { ApiSpecialty } from "@/lib/specialties";
import { NO_SPECIALTY_LABEL } from "./data";

/**
 * Shared specialty `<select>` for the directory + "Без спеціальності" option.
 * Single source of truth used both in the doctor row (/admin/users) and the
 * role-grant modal's "create doctor" form — no duplicated option list / null
 * mapping. The empty option maps to/from `null`; styling comes via `className`.
 */
export function SpecialtySelect({
  value,
  specialties,
  onChange,
  className,
  id,
  ariaLabel,
  disabled,
  loading,
}: {
  /** Current specialty id, or null for "Без спеціальності". */
  value: string | null;
  /** Directory from GET /api/specialties; null = still loading. */
  specialties: ApiSpecialty[] | null;
  onChange: (specialtyId: string | null) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Saving in progress — disables the control and flags aria-busy. */
  loading?: boolean;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      value={value ?? ""}
      disabled={disabled || loading || specialties === null}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      className={className}
    >
      <option value="">{NO_SPECIALTY_LABEL}</option>
      {(specialties ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
