'use client'

/**
 * CurriculumGate
 *
 * Renders children only when the school's curriculumMix matches the given
 * curriculum prop. Handles "fusion" schools via the 'both' prop — fusion
 * schools can show EITHER curriculum's UI depending on the current class.
 *
 * Rules:
 *   curriculum="CBC"  → renders for curriculumMix 'CBC' or 'fusion'
 *   curriculum="844"  → renders for curriculumMix '844' or 'fusion'
 *   curriculum="both" → renders only for curriculumMix 'fusion'
 *
 * Usage:
 *   <CurriculumGate curriculum="CBC">
 *     <CompetencyLevelDisplay />
 *   </CurriculumGate>
 *
 *   <CurriculumGate curriculum="844">
 *     <LetterGradeDisplay />
 *   </CurriculumGate>
 *
 *   <CurriculumGate curriculum="both">
 *     <CurriculumToggle />   {/* shown only on fusion schools *\/}
 *   </CurriculumGate>
 */

import React from 'react'
import { useSchool } from '@/hooks/useSchool'

type CurriculumProp = 'CBC' | '844' | 'both'

interface CurriculumGateProps {
  curriculum: CurriculumProp
  children:   React.ReactNode
  fallback?:  React.ReactNode
}

export function CurriculumGate({ curriculum, children, fallback = null }: CurriculumGateProps) {
  const { curriculumMix } = useSchool()

  const visible =
    curriculum === 'both'
      ? curriculumMix === 'fusion'
      : curriculum === 'CBC'
        ? curriculumMix === 'CBC'  || curriculumMix === 'fusion'
        : curriculumMix === '844' || curriculumMix === 'fusion'

  return visible ? <>{children}</> : <>{fallback}</>
}
