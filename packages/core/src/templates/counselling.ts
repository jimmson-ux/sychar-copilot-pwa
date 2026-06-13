// Synthesized Guidance & Counselling case-file templates.
//   - Template A: mixed schools (boys & girls)
//   - Template B: single-gender schools (Oloolaiser = boys, with boarding-life block)
// PRIVACY: filled instances live in counselling_sessions / counselling_logs; only the
// counselor and (via gc_access_log request) the principal may read. AI fill-assist
// (/api/ai/template-assist) drafts text fields but never auto-submits.

import { Template, SYCHAR_BRANDING } from './types'

const STUDENT_INFO = {
  id: 'student', title: 'Student Information',
  fields: [
    { key: 'case_no', label: 'Case No', type: 'text' as const },
    { key: 'date', label: 'Date', type: 'date' as const, required: true },
    { key: 'student_name', label: 'Student Name', type: 'text' as const, required: true },
    { key: 'admission_no', label: 'Admission No', type: 'text' as const },
    { key: 'class_name', label: 'Class/Grade', type: 'text' as const },
    { key: 'boarding_status', label: 'Boarding Status', type: 'select' as const, options: ['Day Scholar', 'Boarder'] },
    { key: 'guardian_contact', label: 'Parent/Guardian Contact', type: 'text' as const },
  ],
}

const REFERRAL = {
  id: 'referral', title: 'Referral Information',
  fields: [
    { key: 'referred_by', label: 'Referred By', type: 'select' as const, options: ['Self', 'Teacher', 'Class Teacher', 'Parent/Guardian', 'Deputy Principal', 'Peer', 'Boarding Department', 'Prefect/Student Leader'] },
    { key: 'reason', label: 'Reason for Referral', type: 'textarea' as const, required: true },
  ],
}

const NATURE_OF_CONCERN = {
  id: 'concern', title: 'Nature of Concern',
  fields: [
    { key: 'academic', label: 'Academic', type: 'chips' as const, options: ['Poor Performance', 'Examination Anxiety', 'Lack of Motivation', 'Absenteeism', 'Time Management'] },
    { key: 'social', label: 'Social & Interpersonal', type: 'chips' as const, options: ['Peer Pressure', 'Friendship Conflict', 'Bullying', 'Social Isolation', 'Online/Social Media Conflict', 'Boundary and Respect Issues'] },
    { key: 'emotional', label: 'Emotional & Behavioural', type: 'chips' as const, options: ['Stress', 'Anxiety', 'Anger Management', 'Grief/Loss', 'Low Self-Esteem', 'Behaviour Change', 'Family Issues'] },
    { key: 'safety', label: 'Safety & Welfare', type: 'chips' as const, options: ['Harassment', 'Coercion', 'Exploitation Concern', 'Safety Concern', 'Child Protection Issue', 'Other'] },
  ],
}

const SESSION_RECORD = {
  id: 'session', title: 'Counselling Session Record',
  fields: [
    { key: 'session_number', label: 'Session Number', type: 'number' as const },
    { key: 'session_date', label: 'Date', type: 'date' as const },
    { key: 'issues_discussed', label: 'Key Issues Discussed', type: 'textarea' as const, aiAssist: true },
    { key: 'strategies', label: 'Counselling Strategies Used', type: 'chips' as const, options: ['Active Listening', 'Solution-Focused Counselling', 'Goal Setting', 'Conflict Resolution', 'Behaviour Coaching', 'Peer Mediation', 'Psychoeducation', 'Mentorship', 'Referral'] },
    { key: 'risk_level', label: 'Risk Level', type: 'select' as const, options: ['Low', 'Medium', 'High'] },
  ],
}

const ACTION_FOLLOWUP = {
  id: 'action', title: 'Action Plan & Follow-up',
  fields: [
    { key: 'action_plan', label: 'Action Plan', type: 'table' as const, columns: ['Goal', 'Action', 'Timeline'] },
    { key: 'next_appointment', label: 'Next Appointment', type: 'date' as const },
    { key: 'progress', label: 'Progress', type: 'select' as const, options: ['Excellent', 'Good', 'Fair', 'Needs Further Support'] },
    { key: 'referral_needed', label: 'Referral Needed To', type: 'chips' as const, options: ['Parent/Guardian', 'School Administration', 'Child Protection Services', 'Healthcare Professional', 'Psychologist/Counsellor', 'Other'] },
    { key: 'counsellor_remarks', label: "Counsellor's Remarks", type: 'textarea' as const, aiAssist: true },
    { key: 'counsellor_signature', label: 'Counsellor Signature', type: 'signature' as const },
  ],
}

// Mixed-school relationship/social development block.
const MIXED_RELATIONSHIP = {
  id: 'relationship_mixed', title: 'Relationship & Social Development (Mixed School)',
  fields: [
    { key: 'issues_identified', label: 'Issues Identified', type: 'chips' as const, options: ['Excessive Focus on Romantic Relationships', 'Relationship Conflict', 'Breakup Distress', 'Peer Pressure Related to Relationships', 'Rumours/Gossip', 'Online Communication Issues', 'Boundary Concerns', 'Jealousy/Conflict', 'None'] },
    { key: 'observations', label: 'Observations', type: 'textarea' as const },
    { key: 'guidance_provided', label: 'Guidance Provided', type: 'textarea' as const, aiAssist: true },
  ],
}

// Single-gender adolescent development + boarding adjustment blocks.
const SINGLE_GENDER_DEV = {
  id: 'development_single', title: 'Adolescent Relationship & Social Development (Single-Gender)',
  fields: [
    { key: 'areas_discussed', label: 'Areas Discussed', type: 'chips' as const, options: ['Healthy Relationships', 'Respectful Communication', 'Personal Boundaries', 'Online Interactions', 'Managing Distractions', 'Decision Making', 'Emotional Regulation', 'Future Planning', 'Peer Influence'] },
    { key: 'counsellor_notes', label: 'Counsellor Notes', type: 'textarea' as const, aiAssist: true },
  ],
}
const BOARDING_ADJUSTMENT = {
  id: 'boarding_adjustment', title: 'Boarding Life Adjustment (if applicable)',
  fields: [
    { key: 'boarding_issues', label: 'Issues', type: 'chips' as const, options: ['Homesickness', 'Dormitory Conflict', 'Adaptation Challenges', 'Study Routine Issues', 'Peer Influence', 'Other'] },
    { key: 'intervention', label: 'Intervention', type: 'textarea' as const, aiAssist: true },
  ],
}

export const COUNSELLING_MIXED: Template = {
  id: 'gc_case_mixed_v1',
  docType: 'gc_case_file',
  name: 'G&C Case File — Mixed School',
  genderProfile: 'mixed',
  branding: SYCHAR_BRANDING,
  sections: [STUDENT_INFO, REFERRAL, NATURE_OF_CONCERN, MIXED_RELATIONSHIP, SESSION_RECORD, ACTION_FOLLOWUP],
}

export const COUNSELLING_SINGLE: Template = {
  id: 'gc_case_single_v1',
  docType: 'gc_case_file',
  name: 'G&C Case File — Single-Gender School',
  genderProfile: 'boys',
  branding: SYCHAR_BRANDING,
  sections: [STUDENT_INFO, REFERRAL, NATURE_OF_CONCERN, SINGLE_GENDER_DEV, BOARDING_ADJUSTMENT, SESSION_RECORD, ACTION_FOLLOWUP],
}

export function resolveCounsellingTemplate(genderProfile: 'mixed' | 'boys' | 'girls'): Template {
  return genderProfile === 'mixed' ? COUNSELLING_MIXED : COUNSELLING_SINGLE
}
