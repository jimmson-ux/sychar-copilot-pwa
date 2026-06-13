// ─────────────────────────────────────────────────────────────
// Sychar Copilot — Billing Utilities
//
// Population-based tier pricing + per-add-on pricing.
// All monetary values are in Kenyan Shillings (KES).
// ─────────────────────────────────────────────────────────────

import type { SchoolFeatures } from './features'

export type { SchoolFeatures }

// ── GlobalPricing ─────────────────────────────────────────────
// Loaded from global_settings.addon_pricing in the database.
// Passed explicitly into calculateYearlyInvoice so the function
// remains pure and testable without a Supabase call.

export type GlobalPricing = {
  gate_pass:        number
  visitor_log:      number
  staff_attendance: number
  pocket_money:     number
  bread_voucher:    number
}

// ── School ────────────────────────────────────────────────────
// Mirrors the public.schools table columns used across the admin
// dashboard, billing pages, and SchoolContext.

export type School = {
  id:                      string
  name:                    string
  county:                  string
  sub_county?:             string
  knec_code?:              string
  student_count:           number
  contact_name?:           string
  contact_phone?:          string
  contact_email?:          string
  features:                SchoolFeatures
  is_active:               boolean
  subscription_expires_at: string
  created_at:              string
  // Joined from tenant_configs
  school_short_code?:      string | null
  tenant_configs?:         { school_short_code: string | null }[] | null
}

// ── ADDON_KEYS ────────────────────────────────────────────────
// Canonical ordered list of all add-on keys.
// Iterate this instead of Object.keys(features) for stable order.

export const ADDON_KEYS: (keyof SchoolFeatures)[] = [
  'gate_pass',
  'visitor_log',
  'staff_attendance',
  'pocket_money',
  'bread_voucher',
]

// ── Population tiers ─────────────────────────────────────────
// Base annual fee (KES) by enrolled student count.

type Tier = { max: number; base: number; label: string }

const TIERS: Tier[] = [
  { max: 399,   base: 48000, label: 'Under 400 students'    },
  { max: 900,   base: 53500, label: '400–900 students'      },
  { max: 1500,  base: 57500, label: '901–1,500 students'    },
  { max: 2500,  base: 62500, label: '1,501–2,500 students'  },
  { max: Infinity, base: 68000, label: 'Over 2,500 students' },
]

function resolveTier(studentCount: number): Tier {
  return TIERS.find(t => studentCount <= t.max) ?? TIERS[TIERS.length - 1]
}

// ── calculateYearlyInvoice ────────────────────────────────────
// Returns the full invoice breakdown for a school for one year.
//
// basePrice    — tier-based platform fee
// addonsPrice  — sum of enabled add-on prices from global_settings
// totalYearly  — basePrice + addonsPrice
// tier         — human-readable tier label for invoice display

export function calculateYearlyInvoice(
  school: School,
  pricing: GlobalPricing,
): {
  basePrice:    number
  addonsPrice:  number
  totalYearly:  number
  tier:         string
} {
  const resolved = resolveTier(school.student_count)

  const addonsPrice = ADDON_KEYS.reduce((sum, key) => {
    return school.features[key] === true ? sum + pricing[key] : sum
  }, 0)

  return {
    basePrice:   resolved.base,
    addonsPrice,
    totalYearly: resolved.base + addonsPrice,
    tier:        resolved.label,
  }
}

// ── formatKES ─────────────────────────────────────────────────
// Formats a whole-shilling amount as 'KES X,XXX'.
// Uses Kenyan locale (en-KE) so thousands separators are correct.

export function formatKES(amount: number): string {
  return (
    'KES ' +
    new Intl.NumberFormat('en-KE', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount)
  )
}

// ── getDaysUntilExpiry ────────────────────────────────────────
// Returns the number of whole days until the subscription expires.
// Negative means already expired.

export function getDaysUntilExpiry(expiresAt: string): number {
  return Math.ceil(
    (new Date(expiresAt).getTime() - Date.now()) / 86_400_000,
  )
}

// ── getExpiryBadge ────────────────────────────────────────────
// Maps a day-count to a badge label + semantic colour for UI.

export function getExpiryBadge(days: number): {
  label: string
  color: 'green' | 'amber' | 'red'
} {
  if (days < 0)   return { label: 'Expired',       color: 'red'   }
  if (days <= 14) return { label: `${days}d left`, color: 'red'   }
  if (days <= 30) return { label: `${days}d left`, color: 'amber' }
  return              { label: `${days}d left`, color: 'green' }
}
