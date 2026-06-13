// Synthesized unified Record of Work (ROW) template — one enhanced format that
// serves CBC (Grade 10) and 8-4-4 (Forms 3/4), with curriculum-specific sub-blocks.
// Filled rows live in the existing `records_of_work` table; HOD verification reuses
// existing reviewer RLS. Department tailoring is driven by staff_records.department.

import { Template, SYCHAR_BRANDING, Curriculum } from './types'

const SCHOOL_INFO = {
  id: 'school_info',
  title: 'School & Teacher Information',
  fields: [
    { key: 'teacher_name', label: 'Teacher', type: 'text' as const, required: true },
    { key: 'tsc_number', label: 'TSC No.', type: 'text' as const },
    { key: 'department', label: 'Department', type: 'text' as const },
    { key: 'subject_name', label: 'Subject', type: 'text' as const, required: true },
    { key: 'class_name', label: 'Class/Stream', type: 'text' as const, required: true },
    { key: 'term', label: 'Term', type: 'select' as const, options: ['Term 1', 'Term 2', 'Term 3'] },
    { key: 'academic_year', label: 'Year', type: 'text' as const },
  ],
}

// Core weekly record — the unified spine for both curricula.
const WEEKLY_RECORD = {
  id: 'weekly_record',
  title: 'Term Record of Work',
  description: 'One row per lesson. CBC: Strand/Sub-strand/SLOs. 8-4-4: Topic/Sub-topic/Objectives.',
  fields: [
    {
      key: 'entries', label: 'Weekly entries', type: 'table' as const,
      columns: ['Week', 'Date', 'Strand/Topic', 'Sub-strand/Sub-topic', 'Outcomes/Objectives Covered', 'Activities Conducted', 'Resources Used', 'Assessment Evidence', 'Remarks/Intervention'],
    },
  ],
}

const COVERAGE_ANALYSIS = {
  id: 'coverage',
  title: 'End-of-Month Coverage Analysis',
  fields: [
    { key: 'work_planned', label: 'Work Planned', type: 'textarea' as const },
    { key: 'work_covered', label: 'Work Covered', type: 'textarea' as const },
    { key: 'coverage_pct', label: 'Coverage (%)', type: 'percent' as const },
    { key: 'variance', label: 'Variance', type: 'textarea' as const },
    {
      key: 'variance_reasons', label: 'Reasons for Variance', type: 'chips' as const,
      options: ['Public Holiday', 'School Activity', 'Examination', 'Co-curricular Activity', 'Teacher Absence', 'Learner Absenteeism', 'Other'],
    },
    { key: 'recovery_strategy', label: 'Recovery Strategy', type: 'textarea' as const, aiAssist: true },
  ],
}

const INTERVENTION_LOG = {
  id: 'intervention',
  title: 'Learner Progress & Intervention Log',
  fields: [
    {
      key: 'interventions', label: 'Interventions', type: 'table' as const,
      columns: ['Learner/Group', 'Challenge Identified', 'Intervention Provided', 'Date', 'Outcome'],
    },
  ],
}

const HOD_VERIFICATION = {
  id: 'hod_verification',
  title: 'Head of Department Verification',
  fields: [
    { key: 'hod_month', label: 'Month', type: 'text' as const },
    { key: 'hod_verified', label: 'Work Covered Verified', type: 'checkbox' as const },
    { key: 'hod_comments', label: 'Comments', type: 'textarea' as const },
    { key: 'hod_signature', label: 'HOD Signature', type: 'signature' as const },
  ],
}

// CBC-only competency / values / PCI trackers.
const CBC_TRACKERS = [
  {
    id: 'cbc_competencies', title: 'CBC Competencies Tracker',
    fields: [{ key: 'competencies', label: 'Competencies integrated', type: 'table' as const, columns: ['Competency', 'Integrated (✓)', 'Evidence'] }],
  },
  {
    id: 'cbc_values', title: 'Values Integration Record',
    fields: [{ key: 'values', label: 'Values covered', type: 'table' as const, columns: ['Value', 'Date Covered', 'Evidence'] }],
  },
  {
    id: 'cbc_pcis', title: 'Pertinent & Contemporary Issues (PCIs) Record',
    fields: [{ key: 'pcis', label: 'PCIs covered', type: 'table' as const, columns: ['PCI', 'Date Covered', 'Evidence'] }],
  },
]

// 8-4-4-only practical / CATs / KCSE prep blocks.
const F844_BLOCKS = [
  {
    id: 'practical_work', title: 'Practical Work Record',
    description: 'For Sciences, Agriculture, Computer Studies, Home Science, Art & Design.',
    fields: [{ key: 'practicals', label: 'Practicals', type: 'table' as const, columns: ['Date', 'Practical Activity', 'Skills Developed', 'Apparatus/Resources', 'Remarks'] }],
  },
  {
    id: 'cats_assignments', title: 'Tests, CATs & Assignments Record',
    fields: [{ key: 'assessments', label: 'Assessments', type: 'table' as const, columns: ['Date', 'Assessment Type', 'Topic Tested', 'Class Average', 'Action Taken'] }],
  },
  {
    id: 'kcse_prep', title: 'KCSE Preparation Tracker (Form 4)',
    fields: [{ key: 'kcse_activities', label: 'KCSE prep', type: 'table' as const, columns: ['Activity', 'Date Conducted', 'Remarks'] }],
  },
]

const REFLECTION = {
  id: 'reflection',
  title: 'Teacher Reflection',
  fields: [
    { key: 'went_well', label: 'What went well?', type: 'textarea' as const },
    { key: 'challenges', label: 'Challenges experienced', type: 'textarea' as const },
    { key: 'improvements', label: 'Strategies for improvement', type: 'textarea' as const, aiAssist: true },
  ],
}

export const RECORD_OF_WORK_CBC: Template = {
  id: 'record_of_work_cbc_v1',
  docType: 'record_of_work',
  name: 'Record of Work — CBC (Grade 10)',
  curriculum: 'CBC',
  branding: SYCHAR_BRANDING,
  sections: [SCHOOL_INFO, WEEKLY_RECORD, ...CBC_TRACKERS, COVERAGE_ANALYSIS, INTERVENTION_LOG, REFLECTION, HOD_VERIFICATION],
}

export const RECORD_OF_WORK_844: Template = {
  id: 'record_of_work_844_v1',
  docType: 'record_of_work',
  name: 'Record of Work — 8-4-4 (Forms 3 & 4)',
  curriculum: '844',
  branding: SYCHAR_BRANDING,
  sections: [SCHOOL_INFO, WEEKLY_RECORD, ...F844_BLOCKS, COVERAGE_ANALYSIS, INTERVENTION_LOG, REFLECTION, HOD_VERIFICATION],
}

export function resolveRecordOfWorkTemplate(curriculum: Curriculum): Template {
  return curriculum === 'CBC' ? RECORD_OF_WORK_CBC : RECORD_OF_WORK_844
}
