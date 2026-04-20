/**
 * useSchool — access school context from any client component.
 *
 * Usage:
 *   const { schoolName, theme, featuresEnabled, currentTerm } = useSchool()
 *
 * Returns DEFAULT_CONTEXT values while loading.
 * Never throws — always safe to destructure.
 */

import { useSchoolContext } from '@/components/providers/SchoolThemeProvider'
import type { SchoolContext } from '@/types/school'

export function useSchool(): SchoolContext {
  return useSchoolContext()
}
