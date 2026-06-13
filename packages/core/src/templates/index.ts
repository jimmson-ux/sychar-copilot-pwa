// Template registry — single import surface for Lovable / API consumers.
//
// Usage:
//   import { resolveTemplate } from '@/lib/templates'
//   const t = resolveTemplate('lesson_plan', { className: 'Grade 10A' })
//   const t = resolveTemplate('gc_case_file', { genderProfile: 'boys' })

import { Template, curriculumForClass } from './types'
import { LESSON_PLAN_CBC, LESSON_PLAN_844, resolveLessonPlanTemplate } from './lessonPlan'
import { RECORD_OF_WORK_CBC, RECORD_OF_WORK_844, resolveRecordOfWorkTemplate } from './recordOfWork'
import { TOD_DAILY_REPORT } from './tod'
import { COUNSELLING_MIXED, COUNSELLING_SINGLE, resolveCounsellingTemplate } from './counselling'
import { NURSE_HEALTH_RECORD } from './nurse'
import { MEETING_MINUTES } from './minutes'

export * from './types'
export {
  LESSON_PLAN_CBC, LESSON_PLAN_844, resolveLessonPlanTemplate,
  RECORD_OF_WORK_CBC, RECORD_OF_WORK_844, resolveRecordOfWorkTemplate,
  TOD_DAILY_REPORT,
  COUNSELLING_MIXED, COUNSELLING_SINGLE, resolveCounsellingTemplate,
  NURSE_HEALTH_RECORD,
  MEETING_MINUTES,
}

export const ALL_TEMPLATES: Template[] = [
  LESSON_PLAN_CBC, LESSON_PLAN_844,
  RECORD_OF_WORK_CBC, RECORD_OF_WORK_844,
  TOD_DAILY_REPORT,
  COUNSELLING_MIXED, COUNSELLING_SINGLE,
  NURSE_HEALTH_RECORD,
  MEETING_MINUTES,
]

export interface ResolveOpts {
  className?: string
  curriculum?: 'CBC' | '844'
  genderProfile?: 'mixed' | 'boys' | 'girls'
}

export function resolveTemplate(docType: string, opts: ResolveOpts = {}): Template | null {
  const curriculum = opts.curriculum
    ?? (opts.className ? curriculumForClass(opts.className) : '844')
  switch (docType) {
    case 'lesson_plan':
      return opts.className ? resolveLessonPlanTemplate(opts.className)
        : (curriculum === 'CBC' ? LESSON_PLAN_CBC : LESSON_PLAN_844)
    case 'record_of_work':
      return resolveRecordOfWorkTemplate(curriculum)
    case 'tod_report':
      return TOD_DAILY_REPORT
    case 'gc_case_file':
      return resolveCounsellingTemplate(opts.genderProfile ?? 'mixed')
    case 'nurse_record':
      return NURSE_HEALTH_RECORD
    case 'meeting_minutes':
      return MEETING_MINUTES
    default:
      return null
  }
}
