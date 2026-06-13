// ─────────────────────────────────────────────────────────────
// Sychar Copilot — School Feature Flags
//
// The `features` JSONB column on the `schools` table holds
// exactly these 5 keys — the paid add-on modules.
//
// All other capabilities (fees, payroll, LPO, reports, parent
// PWA, push alerts, etc.) are CORE and always available;
// they are NOT represented here.
// ─────────────────────────────────────────────────────────────

export type SchoolFeatures = {
  gate_pass:        boolean
  visitor_log:      boolean
  staff_attendance: boolean
  pocket_money:     boolean
  bread_voucher:    boolean
}

// ── Display metadata for each add-on ─────────────────────────
// Used by the God Mode dashboard, billing pages, and FeatureGate
// locked-state UI.

export const ADDON_META: Record<
  keyof SchoolFeatures,
  { label: string; description: string; price_key: keyof SchoolFeatures }
> = {
  gate_pass: {
    label:       'Gate Pass System',
    description: 'Student exit and entry gate pass management',
    price_key:   'gate_pass',
  },
  visitor_log: {
    label:       'Visitor Log',
    description: 'Visitor entry, exit and badge management',
    price_key:   'visitor_log',
  },
  staff_attendance: {
    label:       'Staff Attendance',
    description: 'Teaching and non-teaching staff daily attendance',
    price_key:   'staff_attendance',
  },
  pocket_money: {
    label:       'Pocket Money',
    description: 'Student pocket money top-up and withdrawal ledger',
    price_key:   'pocket_money',
  },
  bread_voucher: {
    label:       'Bread Voucher',
    description: 'Daily bread and meal voucher issuance and redemption',
    price_key:   'bread_voucher',
  },
}

// ── hasFeature ────────────────────────────────────────────────
// Safe null-guard: returns false when features is null/undefined.
// Use this everywhere instead of inline optional chaining so
// feature checks are consistent and easy to audit.

export function hasFeature(
  features: SchoolFeatures | null | undefined,
  flag: keyof SchoolFeatures,
): boolean {
  return features?.[flag] === true
}

// ── getActiveAddons ───────────────────────────────────────────
// Returns the list of add-on keys that are currently enabled.
// Useful for billing summaries and dashboard add-on lists.

export function getActiveAddons(
  features: SchoolFeatures | null | undefined,
): (keyof SchoolFeatures)[] {
  if (!features) return []
  return (Object.keys(features) as (keyof SchoolFeatures)[]).filter(
    key => features[key] === true,
  )
}
