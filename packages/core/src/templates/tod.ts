// Synthesized Teacher-on-Duty (TOD) daily report template. Must be filled by the
// end of each duty day. A nagging web push (supabase/functions/tod-reminder) chases
// the on-duty teacher if unfilled by the cutoff and escalates a summary to the
// deputy & principal. Filled instances live in `tod_daily_report`.

import { Template, SYCHAR_BRANDING } from './types'

const STATUS_OPTS = ['Satisfactory', 'Needs Attention', 'Not Applicable']

export const TOD_DAILY_REPORT: Template = {
  id: 'tod_daily_report_v1',
  docType: 'tod_report',
  name: 'Teacher on Duty — Daily Report',
  branding: SYCHAR_BRANDING,
  sections: [
    {
      id: 'details', title: 'Duty Details',
      fields: [
        { key: 'duty_teacher', label: 'Duty Teacher', type: 'text', required: true },
        { key: 'duty_date', label: 'Date', type: 'date', required: true },
        { key: 'week_number', label: 'Week No.', type: 'number' },
        { key: 'shift', label: 'Shift', type: 'select', options: ['Day', 'Night'] },
      ],
    },
    {
      id: 'gate_punctuality', title: 'Gate Supervision & Punctuality',
      fields: [
        { key: 'teacher_present_before_time', label: 'Teachers present before reporting time', type: 'select', options: STATUS_OPTS },
        { key: 'students_on_time', label: 'Students arriving on time', type: 'select', options: STATUS_OPTS },
        { key: 'latecomers_recorded', label: 'Latecomers recorded', type: 'number' },
        { key: 'visitors_screened', label: 'Visitors screened', type: 'select', options: STATUS_OPTS },
        { key: 'gate_remarks', label: 'Remarks', type: 'textarea' },
      ],
    },
    {
      id: 'attendance', title: 'Student Attendance',
      fields: [
        { key: 'attendance_table', label: 'Attendance by class', type: 'table', columns: ['Class', 'Present', 'Absent', 'Late', 'Remarks'] },
        { key: 'total_absent', label: 'Total Absent', type: 'number' },
        { key: 'students_sent_home', label: 'Students Sent Home', type: 'number' },
      ],
    },
    {
      id: 'assembly', title: 'Assembly Report',
      fields: [
        { key: 'assembly_conducted', label: 'Assembly conducted', type: 'checkbox' },
        { key: 'discipline_satisfactory', label: 'Discipline satisfactory', type: 'select', options: STATUS_OPTS },
        { key: 'assembly_issues', label: 'Key issues raised', type: 'textarea' },
      ],
    },
    {
      id: 'classroom', title: 'Classroom Monitoring',
      fields: [
        { key: 'teaching_ongoing', label: 'Teaching and learning ongoing', type: 'select', options: STATUS_OPTS },
        { key: 'lesson_attendance_monitored', label: 'Lesson attendance monitored', type: 'select', options: STATUS_OPTS },
        { key: 'teachers_absent', label: 'Teachers absent from lessons', type: 'table', columns: ['Name', 'Lesson Missed', 'Action Taken'] },
      ],
    },
    {
      id: 'discipline', title: 'Discipline Report',
      fields: [
        { key: 'incidents', label: 'Incidents', type: 'table', columns: ['Time', 'Incident', 'Students Involved', 'Action Taken'] },
        { key: 'common_issues', label: 'Common issues observed', type: 'chips', options: ['Noise Making', 'Bullying', 'Truancy', 'Fighting', 'Vandalism', 'Drug/Substance Abuse', 'Improper Uniform', 'Mobile Phones', 'Other'] },
      ],
    },
    {
      id: 'sanitation', title: 'Sanitation & Cleanliness',
      fields: [{ key: 'sanitation_table', label: 'Areas', type: 'table', columns: ['Area', 'Good', 'Fair', 'Poor', 'Remarks'] }],
    },
    {
      id: 'meals', title: 'Meals & Dining Hall',
      fields: [
        { key: 'meals_on_time', label: 'Meals served on time', type: 'select', options: STATUS_OPTS },
        { key: 'food_quality', label: 'Food quality satisfactory', type: 'select', options: STATUS_OPTS },
        { key: 'meal_complaints', label: 'Complaints received', type: 'textarea' },
      ],
    },
    {
      id: 'health_safety', title: 'Health & Safety',
      fields: [
        { key: 'sick_bay_attended', label: 'Students attended sick bay', type: 'number' },
        { key: 'injuries_reported', label: 'Injuries reported', type: 'number' },
        { key: 'safety_concerns', label: 'Safety concerns observed', type: 'textarea' },
      ],
    },
    {
      id: 'boarding', title: 'Boarding Section (if applicable)',
      fields: [
        { key: 'dorm_inspection', label: 'Dormitory inspection done', type: 'checkbox' },
        { key: 'prep_attended', label: 'Prep attended', type: 'select', options: STATUS_OPTS },
        { key: 'roll_call_done', label: 'Roll call conducted', type: 'checkbox' },
        { key: 'boarding_issues', label: 'Issues noted', type: 'textarea' },
      ],
    },
    {
      id: 'summary', title: 'End of Day Summary & Handover',
      fields: [
        { key: 'achievements', label: 'Key achievements', type: 'textarea' },
        { key: 'challenges', label: 'Challenges encountered', type: 'textarea' },
        { key: 'followup', label: 'Matters requiring follow-up', type: 'textarea', aiAssist: true },
        { key: 'handover_notes', label: 'Issues handed over to next duty teacher', type: 'textarea' },
        { key: 'signature', label: 'Duty Teacher Signature', type: 'signature' },
      ],
    },
  ],
}
