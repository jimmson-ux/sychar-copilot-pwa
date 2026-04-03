// Detects curriculum type from class name and returns appropriate labels.
// Grade 10 → CBC; Form 3/4 → 844

export type CurriculumType = '844' | 'CBC'

export interface CurriculumLabels {
  topic: string
  subTopic: string
  objectives: string
  activities: string
  assessmentTypes: string[]
  readinessLabel: string   // e.g. "KCSE Readiness" vs "KJSEA Readiness"
  progressUnit: string     // e.g. "syllabus" vs "strand"
}

export function detectCurriculum(className: string): CurriculumType {
  if (/grade\s*10/i.test(className)) return 'CBC'
  return '844'
}

export function getCurriculumLabels(type: CurriculumType): CurriculumLabels {
  if (type === 'CBC') {
    return {
      topic:            'Strand',
      subTopic:         'Sub-strand',
      objectives:       'Learning Outcomes',
      activities:       'Learning Experiences',
      assessmentTypes:  ['Formative', 'Summative'],
      readinessLabel:   'KJSEA Readiness',
      progressUnit:     'strand',
    }
  }
  return {
    topic:            'Topic',
    subTopic:         'Sub-topic',
    objectives:       'Objectives',
    activities:       'Activities',
    assessmentTypes:  ['CAT', 'Opener', 'Mid-term', 'End-term', 'Mock'],
    readinessLabel:   'KCSE Readiness',
    progressUnit:     'syllabus',
  }
}
