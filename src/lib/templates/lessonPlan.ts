// Synthesized lesson-plan templates — one canonical CBC (Senior School / Grade 10+)
// and one 8-4-4 (Forms 3/4). Auto-selected by curriculum, applied to ALL schools.
// Filled instances are stored in the existing `lesson_plans` table.

import { Template, curriculumForClass, SYCHAR_BRANDING } from './types'

const CORE_COMPETENCIES = [
  'Communication & Collaboration', 'Critical Thinking & Problem Solving',
  'Creativity & Imagination', 'Citizenship', 'Digital Literacy',
  'Self-Efficacy', 'Learning to Learn',
]
const CORE_VALUES = ['Respect', 'Responsibility', 'Integrity', 'Patriotism', 'Unity', 'Peace', 'Social Justice', 'Inclusivity']
const PCIS = ['Environmental Conservation', 'Financial Literacy', 'Health Education', 'Safety and Security', 'Child Rights', 'Gender Issues', 'Disaster Risk Reduction', 'Peace Education']
const CROSS_CUTTING = ['Life Skills', 'HIV/AIDS Education', 'Human Rights', 'Citizenship', 'Environmental Education', 'Health Education', 'Gender', 'ESD']

const GENERAL_INFO = {
  id: 'general',
  title: 'General Information',
  fields: [
    { key: 'teacher_name', label: 'Teacher', type: 'text' as const, required: true },
    { key: 'subject_name', label: 'Subject', type: 'text' as const, required: true },
    { key: 'class_name', label: 'Grade / Class', type: 'text' as const, required: true },
    { key: 'date_taught', label: 'Date', type: 'date' as const, required: true },
    { key: 'period_number', label: 'Period', type: 'number' as const },
    { key: 'duration_minutes', label: 'Duration (mins)', type: 'number' as const },
    { key: 'roll_present', label: 'Learners Present', type: 'number' as const },
    { key: 'roll_total', label: 'Learners on Roll', type: 'number' as const },
    { key: 'topic', label: 'Strand / Topic', type: 'text' as const, required: true },
    { key: 'sub_topic', label: 'Sub-strand / Sub-topic', type: 'text' as const, required: true },
  ],
}

const RESOURCES_FIELD = {
  key: 'learning_resources', label: 'Learning Resources & Aids', type: 'chips' as const,
  options: ['Textbook', 'Projector', 'Charts', 'Diagrams', 'Video', 'Real objects', 'Lab apparatus', 'Worksheets', 'Digital device'],
  help: 'Core textbooks (with page ranges), visual/digital media, physical materials.',
}

const DELIVERY_SECTION = {
  id: 'delivery',
  title: 'Lesson Delivery Procedure',
  description: 'Introduction & Hook → Core Content & Modeling → Guided & Independent Practice → Conclusion & Review.',
  fields: [
    { key: 'intro_activity', label: 'Introduction & Hook (5–10 min)', type: 'textarea' as const, aiAssist: true },
    { key: 'core_activity', label: 'Core Content Delivery & Modeling (15–20 min)', type: 'textarea' as const, aiAssist: true },
    { key: 'practice_activity', label: 'Guided & Independent Practice (15–20 min)', type: 'textarea' as const, aiAssist: true },
    { key: 'conclusion_activity', label: 'Conclusion & Review (5 min)', type: 'textarea' as const, aiAssist: true },
  ],
}

const ASSESSMENT_SECTION = {
  id: 'assessment',
  title: 'Assessment Methods',
  fields: [
    { key: 'formative_check', label: 'Formative Check (oral, poll, exit ticket)', type: 'textarea' as const, aiAssist: true },
    { key: 'summative_check', label: 'Summative Check (quiz, worksheet, presentation)', type: 'textarea' as const, aiAssist: true },
    { key: 'homework', label: 'Extended Learning / Homework', type: 'textarea' as const },
  ],
}

const REFLECTION_SECTION = {
  id: 'reflection',
  title: "Teacher's Self-Reflection (after the lesson)",
  fields: [
    { key: 'reflection_pct', label: 'Objectives Achieved (%)', type: 'percent' as const },
    { key: 'reflection_went_well', label: 'What went well?', type: 'textarea' as const },
    { key: 'reflection_challenges', label: 'What did not go as planned?', type: 'textarea' as const },
    { key: 'reflection_remedial', label: 'Which learners need remedial support?', type: 'textarea' as const },
    { key: 'reflection_changes', label: 'Changes for next time', type: 'textarea' as const },
  ],
}

export const LESSON_PLAN_CBC: Template = {
  id: 'lesson_plan_cbc_v1',
  docType: 'lesson_plan',
  name: 'CBC Lesson Plan (Senior School)',
  curriculum: 'CBC',
  branding: SYCHAR_BRANDING,
  sections: [
    GENERAL_INFO,
    {
      id: 'outcomes',
      title: 'Objectives & Learning Outcomes',
      description: 'By the end of the lesson, learners should be able to:',
      fields: [
        { key: 'slo_cognitive', label: 'Cognitive (Knowledge)', type: 'textarea', required: true, aiAssist: true },
        { key: 'slo_psychomotor', label: 'Psychomotor (Skills)', type: 'textarea', aiAssist: true },
        { key: 'slo_affective', label: 'Affective (Attitudes/Values)', type: 'textarea', aiAssist: true },
        { key: 'key_inquiry_question', label: 'Key Inquiry Question', type: 'textarea', aiAssist: true },
        { key: 'core_competencies', label: 'Core Competencies', type: 'chips', options: CORE_COMPETENCIES },
        { key: 'values_core', label: 'Values', type: 'chips', options: CORE_VALUES },
        { key: 'pcis', label: 'Pertinent & Contemporary Issues (PCIs)', type: 'chips', options: PCIS },
      ],
    },
    { id: 'resources', title: 'Teaching Resources & Learning Aids', fields: [RESOURCES_FIELD] },
    DELIVERY_SECTION,
    ASSESSMENT_SECTION,
    REFLECTION_SECTION,
  ],
}

export const LESSON_PLAN_844: Template = {
  id: 'lesson_plan_844_v1',
  docType: 'lesson_plan',
  name: '8-4-4 Lesson Plan (Forms 3 & 4)',
  curriculum: '844',
  branding: SYCHAR_BRANDING,
  sections: [
    GENERAL_INFO,
    {
      id: 'objectives',
      title: 'Lesson Objectives',
      description: 'By the end of the lesson, the learner should be able to:',
      fields: [
        { key: 'instructional_obj_1', label: 'Objective 1', type: 'textarea', required: true, aiAssist: true },
        { key: 'instructional_obj_2', label: 'Objective 2', type: 'textarea', aiAssist: true },
        { key: 'cross_cutting_issues', label: 'Cross-Cutting Issues', type: 'chips', options: CROSS_CUTTING },
      ],
    },
    { id: 'resources', title: 'Teaching Resources & Learning Aids', fields: [RESOURCES_FIELD] },
    DELIVERY_SECTION,
    ASSESSMENT_SECTION,
    REFLECTION_SECTION,
  ],
}

/** Pick the right lesson-plan template for a class (and optionally subject/school). */
export function resolveLessonPlanTemplate(className: string): Template {
  return curriculumForClass(className) === 'CBC' ? LESSON_PLAN_CBC : LESSON_PLAN_844
}
