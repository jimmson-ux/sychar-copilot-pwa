// Synthesized School Nurse health-record template (Oloolaiser — boys boarding).
// Filled instances live in `sick_bay_visits` (students) and `staff_patient_visits`
// (staff). Documentation uses objective clinical language — never "faking illness".

import { Template, SYCHAR_BRANDING } from './types'

export const NURSE_HEALTH_RECORD: Template = {
  id: 'nurse_health_record_v1',
  docType: 'nurse_record',
  name: 'School Health Services Record',
  branding: SYCHAR_BRANDING,
  sections: [
    {
      id: 'visit', title: 'Patient Visit',
      fields: [
        { key: 'patient_type', label: 'Patient Type', type: 'select', options: ['Student', 'Teaching Staff', 'Non-Teaching Staff'], required: true },
        { key: 'patient_name', label: 'Name', type: 'text', required: true },
        { key: 'identifier', label: 'Admission No / Staff ID', type: 'text' },
        { key: 'class_or_dept', label: 'Class / Department', type: 'text' },
        { key: 'dormitory', label: 'Dormitory (if boarder)', type: 'text' },
        { key: 'time_in', label: 'Time In', type: 'time' },
        { key: 'time_out', label: 'Time Out (auto: medication issued)', type: 'time' },
      ],
    },
    {
      id: 'complaint', title: 'Presenting Complaint',
      fields: [
        { key: 'complaint', label: 'Reason for Visit', type: 'select', required: true, options: ['Headache', 'Stomach Pain', 'Fever', 'Cough/Flu', 'Injury', 'Fatigue', 'Dizziness', 'Nausea', 'Sleep Difficulty', 'Stress-related Symptoms', 'Other'] },
        { key: 'description', label: "Patient's Description", type: 'textarea' },
      ],
    },
    {
      id: 'assessment', title: 'Initial Assessment',
      fields: [
        { key: 'vitals', label: 'Vital Signs', type: 'table', columns: ['Temperature', 'Pulse', 'Blood Pressure', 'Respiration', 'Weight'] },
        { key: 'observations', label: 'Observations', type: 'chips', options: ['Appears Well', 'Appears Ill', 'Distressed', 'Anxious', 'Fatigued', 'Injured', 'Dehydrated', 'Other'] },
        { key: 'nurse_findings', label: 'Clinical Notes / Findings', type: 'textarea', aiAssist: true },
      ],
    },
    {
      id: 'psychosomatic', title: 'Possible Stress / Psychosomatic Indicators',
      description: 'Tick only if clinically relevant. Use objective language.',
      fields: [
        { key: 'psychosomatic_indicators', label: 'Indicators', type: 'chips', options: ['Examination Stress', 'Academic Pressure', 'Homesickness', 'Peer Conflict', 'Bullying Concern', 'Dormitory Issues', 'Family Concerns', 'Anxiety Symptoms', 'Recurrent Unexplained Complaints', 'Sleep Deprivation', 'Not Applicable'] },
        { key: 'psychosomatic_comments', label: 'Comments', type: 'textarea' },
      ],
    },
    {
      id: 'frequent', title: 'Frequent Visitor Monitor',
      fields: [
        { key: 'visited_before_this_month', label: 'Visited sick bay this month?', type: 'checkbox' },
        { key: 'visit_count', label: 'Number of Visits', type: 'number' },
        { key: 'pattern', label: 'Pattern Observed', type: 'select', options: ['Similar Symptoms Repeated', 'Different Symptoms Each Visit', 'Symptoms Linked to Certain Lessons', 'Symptoms Linked to Examinations', 'Symptoms Linked to Dormitory Life', 'No Pattern Observed'] },
      ],
    },
    {
      id: 'management', title: 'Management Provided',
      fields: [
        { key: 'management_provided', label: 'Management', type: 'chips', options: ['Observation', 'First Aid', 'Rest', 'Hydration', 'Medication Administered', 'Wound Care', 'Parent Contacted', 'Returned to Class', 'Sent to Dormitory', 'Referred'] },
        { key: 'medication_items', label: 'Medication Issued (deducts stock)', type: 'table', columns: ['Drug/Item', 'Quantity', 'Dosage', 'Notes'] },
        { key: 'action_taken', label: 'Action / Outcome', type: 'select', required: true, options: ['Observation', 'First Aid', 'Bed Rest', 'Returned to Class', 'Sent Home', 'Referred'] },
      ],
    },
    {
      id: 'referral', title: 'Referral & Follow-up',
      fields: [
        { key: 'referral_to', label: 'Referred To', type: 'select', options: ['None', 'Guidance & Counselling', 'Parent/Guardian', 'Hospital/Clinic', 'School Administration', 'Boarding Department', 'Mental Health Professional'] },
        { key: 'follow_up_plan', label: 'Follow-up Plan', type: 'select', options: ['No Follow-Up Required', 'Review in 24 Hours', 'Review in 3 Days', 'Review in 1 Week', 'Ongoing Monitoring'] },
        { key: 'nurse_signature', label: 'Nurse Signature', type: 'signature' },
      ],
    },
  ],
}
