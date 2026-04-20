/**
 * useFeatureFlag — type-safe feature flag check from school context.
 *
 * Usage:
 *   const canSeeBoarding   = useFeatureFlag('boarding_module')
 *   const hasWallet        = useFeatureFlag('digital_wallet')
 *   const nurseEnabled     = useFeatureFlag('school_nurse')
 *
 * Returns false while loading (safe default — hides optional panels).
 * Returns false for unknown flag keys (future-proof).
 *
 * Available flags:
 *   boarding_module | dual_deputy | school_nurse | digital_wallet
 *   alumni_portal | e_magazine | qr_lesson_attendance | nts_management
 *   gate_pass | provisions_store
 */

import { useSchoolContext } from '@/components/providers/SchoolThemeProvider'
import type { FeaturesEnabled } from '@/types/school'

export function useFeatureFlag(flag: keyof FeaturesEnabled): boolean {
  const { featuresEnabled } = useSchoolContext()
  return featuresEnabled[flag] ?? false
}

/**
 * useFeatureFlags — check multiple flags at once.
 *
 * Usage:
 *   const { boarding_module, digital_wallet } = useFeatureFlags()
 */
export function useFeatureFlags(): FeaturesEnabled {
  const { featuresEnabled } = useSchoolContext()
  return featuresEnabled
}
