export const SCHOOL_ID = '68bd8d34-f2f0-4297-bd18-093328824d84'

export const GUARDIAN_PHONE_ROLES = new Set([
  'principal','deputy_principal','dean_of_students','dean_of_studies',
  'deputy_dean_of_studies','form_principal_form4','form_principal_grade10',
  'bursar','guidance_counselling','class_teacher','bom_teacher',
])

export function canSeeGuardianPhone(role: string): boolean {
  return GUARDIAN_PHONE_ROLES.has(role)
}

export const ROLE_COLORS: Record<string, { primary: string; secondary: string; light: string; glow: string }> = {
  principal: { primary: '#B51A2B', secondary: '#FFA586', light: '#fff5f5', glow: 'rgba(181,26,43,0.2)' },
  deputy_principal_academics: { primary: '#09D1C7', secondary: '#46DFB1', light: '#f0fdfa', glow: 'rgba(9,209,199,0.25)' },
  deputy_principal_discipline: { primary: '#09D1C7', secondary: '#46DFB1', light: '#f0fdfa', glow: 'rgba(9,209,199,0.25)' },
  dean_of_studies: { primary: '#09D1C7', secondary: '#46DFB1', light: '#f0fdfa', glow: 'rgba(9,209,199,0.25)' },
  dean_of_students: { primary: '#DC586D', secondary: '#FFBB94', light: '#fff5f7', glow: 'rgba(220,88,109,0.2)' },
  hod_subjects: { primary: '#09D1C7', secondary: '#46DFB1', light: '#f0fdfa', glow: 'rgba(9,209,199,0.25)' },
  hod_pathways: { primary: '#7C3AED', secondary: '#A78BFA', light: '#f5f3ff', glow: 'rgba(124,58,237,0.2)' },
  class_teacher: { primary: '#09D1C7', secondary: '#46DFB1', light: '#f0fdfa', glow: 'rgba(9,209,199,0.25)' },
  bom_teacher: { primary: '#09D1C7', secondary: '#46DFB1', light: '#f0fdfa', glow: 'rgba(9,209,199,0.25)' },
  bursar: { primary: '#2176FF', secondary: '#FDCA40', light: '#eff6ff', glow: 'rgba(33,118,255,0.2)' },
  guidance_counselling: { primary: '#0C6478', secondary: '#46DFB1', light: '#f0fdfa', glow: 'rgba(12,100,120,0.2)' },
  storekeeper: { primary: '#6B7280', secondary: '#9CA3AF', light: '#f9fafb', glow: 'rgba(107,114,128,0.2)' },
  quality_assurance_officer: { primary: '#384358', secondary: '#FFA586', light: '#f8f9fa', glow: 'rgba(56,67,88,0.2)' },
  default: { primary: '#09D1C7', secondary: '#46DFB1', light: '#f0fdfa', glow: 'rgba(9,209,199,0.25)' },
}

export function setRoleTheme(role: string) {
  if (typeof document === 'undefined') return
  const colors = ROLE_COLORS[role] ?? ROLE_COLORS.default
  const root = document.documentElement
  root.setAttribute('data-role', role)
  root.style.setProperty('--role-primary', colors.primary)
  root.style.setProperty('--role-secondary', colors.secondary)
  root.style.setProperty('--role-light', colors.light)
  root.style.setProperty('--role-glow', colors.glow)
}

export const ROLE_LABELS: Record<string, string> = {
  principal: 'Principal',
  deputy_principal_academics: 'Deputy Principal (Academics)',
  deputy_principal_discipline: 'Deputy Principal (Discipline)',
  dean_of_studies: 'Dean of Studies',
  dean_of_students: 'Dean of Students',
  hod_subjects: 'Head of Department',
  hod_pathways: 'HOD Pathways',
  class_teacher: 'Class Teacher',
  bom_teacher: 'BOM Teacher',
  bursar: 'Bursar',
  guidance_counselling: 'Guidance & Counselling',
  storekeeper: 'Storekeeper',
  quality_assurance_officer: 'Quality Assurance Officer',
  timetabling_committee: 'Timetabling Committee',
}

export const DEPARTMENTS = ['Sciences', 'Mathematics', 'Languages', 'Humanities', 'Applied Sciences']

export const STREAM_COLORS: Record<string, string> = {
  Champions: '#FDCA40',
  Achievers: '#09D1C7',
  Winners: '#2176FF',
  Victors: '#DC586D',
}

export const STREAM_BADGE_CLASS: Record<string, string> = {
  Champions: 'badge-warning',
  Achievers: 'badge-info',
  Winners: 'badge-info',
  Victors: 'badge-error',
}

export const SUBJECT_COLORS: Record<string, string> = {
  Mathematics: '#2176FF',
  English: '#7C3AED',
  Kiswahili: '#059669',
  Biology: '#16A34A',
  Chemistry: '#DC2626',
  Physics: '#D97706',
  History: '#B45309',
  Geography: '#0D9488',
  CRE: '#6D28D9',
  Business: '#0369A1',
  Agriculture: '#65A30D',
  Computer: '#0F766E',
  Music: '#BE185D',
  Art: '#C026D3',
  PE: '#EA580C',
  French: '#1D4ED8',
  German: '#374151',
  Arabic: '#92400E',
  IRE: '#4338CA',
  HomeSci: '#BE123C',
  default: '#6B7280',
}

export function getSubjectColor(subject: string): string {
  const s = subject ?? ''
  const key = Object.keys(SUBJECT_COLORS).find(k => s.toLowerCase().includes(k.toLowerCase()))
  return key ? SUBJECT_COLORS[key] : SUBJECT_COLORS.default
}

export function getGradeFromScore(score: number): string {
  if (score >= 75) return 'A'
  if (score >= 70) return 'A-'
  if (score >= 65) return 'B+'
  if (score >= 60) return 'B'
  if (score >= 55) return 'B-'
  if (score >= 50) return 'C+'
  if (score >= 45) return 'C'
  if (score >= 40) return 'C-'
  if (score >= 35) return 'D+'
  if (score >= 30) return 'D'
  if (score >= 25) return 'D-'
  return 'E'
}

export function getGradePoints(grade: string): number {
  const points: Record<string, number> = {
    'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8,
    'C+': 7, 'C': 6, 'C-': 5, 'D+': 4, 'D': 3, 'D-': 2, 'E': 1
  }
  return points[grade] ?? 0
}

export function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return '#16A34A'
  if (grade.startsWith('B')) return '#2176FF'
  if (grade.startsWith('C')) return '#D97706'
  if (grade.startsWith('D')) return '#DC2626'
  return '#6B7280'
}

export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return dateStr }
}

export function formatCurrency(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`
}

export const KENYAN_SCHOOL_PERIODS = [
  { period: 1, name: 'Period 1', start: '08:00', end: '08:40' },
  { period: 2, name: 'Period 2', start: '08:40', end: '09:20' },
  { period: 3, name: 'Period 3', start: '09:20', end: '10:00' },
  { period: 0, name: 'Break', start: '10:00', end: '10:20' },
  { period: 4, name: 'Period 4', start: '10:20', end: '11:00' },
  { period: 5, name: 'Period 5', start: '11:00', end: '11:40' },
  { period: 6, name: 'Period 6', start: '11:40', end: '12:20' },
  { period: 0, name: 'Lunch', start: '12:20', end: '13:20' },
  { period: 7, name: 'Period 7', start: '13:20', end: '14:00' },
  { period: 8, name: 'Period 8', start: '14:00', end: '14:40' },
]

export function getCurrentTerm(): { term: 1 | 2 | 3; year: number } {
  const month = new Date().getMonth() + 1
  const year = new Date().getFullYear()
  if (month >= 1 && month <= 4) return { term: 1, year }
  if (month >= 5 && month <= 8) return { term: 2, year }
  return { term: 3, year }
}
