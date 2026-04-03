export interface Student {
  id: string
  school_id: string
  full_name: string
  admission_number: string | null
  class_name: string | null
  stream_name: string | null
  gender: string | null
  parent_name: string | null
  parent_phone: string | null
  parent_email: string | null
  photo_url: string | null
  is_active: boolean
  created_at: string
}

export interface StaffRecord {
  id: string
  school_id: string
  auth_user_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  role: string
  sub_role: string | null
  department: string | null
  subject_name: string | null
  class_name: string | null
  tsc_number: string | null
  photo_url: string | null
  is_active: boolean
  can_login: boolean
  created_at: string
}

export interface Mark {
  id: string
  school_id: string
  student_id: string
  subject: string
  score: number | null
  max_score: number
  exam_type: string
  class_name: string
  term: number | null
  academic_year: string | null
  teacher_id: string | null
  created_at: string
}

export interface Attendance {
  id: string
  school_id: string
  student_id: string
  date: string
  status: 'present' | 'absent' | 'late'
  class_name: string | null
  teacher_id: string | null
  created_at: string
}

export interface FeeBalance {
  id: string
  school_id: string
  student_id: string
  total_fees: number
  amount_paid: number
  balance: number
  term: number | null
  academic_year: string | null
  updated_at: string
}

export interface FeeRecord {
  id: string
  school_id: string
  student_id: string
  amount: number
  payment_date: string
  payment_method: string | null
  receipt_number: string | null
  recorded_by: string | null
  created_at: string
}

export interface Notice {
  id: string
  school_id: string
  title: string
  content: string
  is_active: boolean
  created_by: string | null
  created_at: string
}

export interface DisciplineRecord {
  id: string
  school_id: string
  student_id: string
  incident_type: string
  severity: 'minor' | 'moderate' | 'serious' | 'critical'
  description: string | null
  action_taken: string | null
  incident_date: string
  logged_by: string | null
  logged_via: string | null
  dean_reviewed: boolean
  parent_notified: boolean
  created_at: string
}

export interface TeacherToken {
  id: string
  school_id: string
  teacher_id: string | null
  token: string
  is_active: boolean
  used_count: number
  max_uses: number
  expires_at: string | null
  device_fingerprint: string | null
  first_device_registered_at: string | null
  device_lock_enabled: boolean
  created_at: string
}

export interface RecordOfWork {
  id: string
  school_id: string
  teacher_id: string
  class_name: string
  subject: string
  topic: string
  sub_topic: string | null
  lesson_date: string
  period: number | null
  week: number | null
  activities: string[]
  was_taught: boolean
  classwork_given: boolean
  homework_assigned: boolean
  remarks: string | null
  created_at: string
}

export interface DocumentCompliance {
  id: string
  school_id: string
  teacher_id: string
  has_scheme: boolean
  has_lesson_plans: boolean
  record_of_work_count: number
  compliance_score: number
  last_updated: string
}

export interface SchemeOfWork {
  id: string
  school_id: string
  teacher_id: string
  class_name: string
  subject: string
  term: number
  academic_year: string
  weeks: unknown[]
  created_at: string
}

export interface Timetable {
  id: string
  school_id: string
  class_name: string
  day: string
  period: number
  subject: string
  subject_code: string | null
  teacher_id: string | null
  teacher_initials: string | null
  room: string | null
  term: number | null
  academic_year: string | null
  is_published: boolean
}

export interface CounsellingLog {
  id: string
  school_id: string
  student_id: string
  counsellor_id: string
  session_type: string
  concern_area: string | null
  notes: string | null
  is_confidential: boolean
  session_date: string
  follow_up_needed: boolean
  follow_up_date: string | null
  parent_informed: boolean
  created_at: string
}

export interface HealthRecord {
  id: string
  school_id: string
  student_id: string
  blood_group: string | null
  allergies: string | null
  medical_condition: string | null
  emergency_contact: string | null
  created_at: string
}

export interface Appraisal {
  id: string
  school_id: string
  staff_id: string
  appraiser_id: string | null
  appraisal_date: string
  punctuality_score: number
  classroom_management_score: number
  lesson_delivery_score: number
  student_interaction_score: number
  professional_conduct_score: number
  total_score: number
  rating: string | null
  strengths: string | null
  areas_for_improvement: string | null
  created_at: string
}

export interface ClassroomQRCode {
  id: string
  school_id: string
  class_name: string
  stream_name: string | null
  qr_token: string
  is_active: boolean
  created_at: string
}

export interface SmsLog {
  id: string
  school_id: string
  channel: string
  from_number: string | null
  to_number: string | null
  message_in: string | null
  message_out: string | null
  parent_name: string | null
  created_at: string
}

export interface OcrLog {
  id: string
  school_id: string
  scan_type: string
  file_name: string | null
  result: string | null
  processed_by: string | null
  created_at: string
}

export interface TimetablePreference {
  id: string
  school_id: string
  teacher_id: string
  free_period_preferences: unknown[]
  avoid_back_to_back: boolean
  max_lessons_per_day: number
  preferred_morning: boolean
  avoid_classes: unknown[]
  additional_notes: string | null
  term: number | null
  academic_year: string | null
  created_at: string
}

export interface TimetableVersion {
  id: string
  school_id: string
  version_name: string
  version_number: number
  timetable_data: unknown
  conflicts: unknown[]
  generated_by: string
  status: 'draft' | 'review' | 'published' | 'archived'
  published_at: string | null
  term: number | null
  academic_year: string | null
  created_at: string
}

export interface StudentRemark {
  id: string
  school_id: string
  student_id: string
  teacher_id: string
  class_name: string
  subject: string
  term: number | null
  academic_year: string | null
  competency_communication: number | null
  competency_critical_thinking: number | null
  competency_creativity: number | null
  competency_collaboration: number | null
  competency_character: number | null
  subject_remarks: string | null
  quick_tag: 'positive' | 'needs_improvement' | 'excellent' | null
  created_at: string
}

export interface TeacherNotice {
  id: string
  school_id: string
  from_role: string
  from_user_id: string | null
  to_teacher_id: string | null
  to_department: string | null
  subject: string
  message: string
  is_read: boolean
  created_at: string
}
