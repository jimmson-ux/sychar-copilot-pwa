export const SUBJECT_DEPARTMENT_MAP: Record<string, string> = {
  // Sciences
  'Biology': 'sciences', 'Chemistry': 'sciences', 'Physics': 'sciences',
  'Agriculture': 'sciences', 'Science': 'sciences',
  // Mathematics
  'Mathematics': 'mathematics', 'Math': 'mathematics', 'Maths': 'mathematics',
  // Languages
  'English': 'languages', 'Kiswahili': 'languages', 'French': 'languages',
  'German': 'languages', 'Arabic': 'languages',
  // Humanities
  'History': 'humanities', 'Geography': 'humanities', 'CRE': 'humanities',
  'IRE': 'humanities', 'HSC': 'humanities', 'Social Studies': 'humanities',
  // Applied Sciences
  'Computer Studies': 'applied', 'ICT': 'applied', 'Home Science': 'applied',
  'Aviation': 'applied', 'Technical Drawing': 'applied',
  // Games & Sports
  'PE': 'sports', 'Physical Education': 'sports', 'Games': 'sports',
}

export const DEPARTMENT_COLORS = {
  sciences:    { primary: '#09D1C7', secondary: '#80EE98', gradient: 'linear-gradient(135deg, #09D1C7, #80EE98)', text: '#213A58' },
  mathematics: { primary: '#2176FF', secondary: '#33A1FD', gradient: 'linear-gradient(135deg, #2176FF, #33A1FD)', text: '#ffffff' },
  languages:   { primary: '#DC586D', secondary: '#FFBB94', gradient: 'linear-gradient(135deg, #DC586D, #FFBB94)', text: '#ffffff' },
  humanities:  { primary: '#FDCA40', secondary: '#F79824', gradient: 'linear-gradient(135deg, #FDCA40, #F79824)', text: '#31393C' },
  applied:     { primary: '#B51A2B', secondary: '#FFA586', gradient: 'linear-gradient(135deg, #B51A2B, #FFA586)', text: '#ffffff' },
  sports:      { primary: '#852E4E', secondary: '#DC586D', gradient: 'linear-gradient(135deg, #852E4E, #DC586D)', text: '#ffffff' },
  default:     { primary: '#09D1C7', secondary: '#46DFB1', gradient: 'linear-gradient(135deg, #09D1C7, #46DFB1)', text: '#213A58' },
}

export function getSubjectColors(subjectName: string) {
  const dept = SUBJECT_DEPARTMENT_MAP[subjectName] || 'default'
  return DEPARTMENT_COLORS[dept as keyof typeof DEPARTMENT_COLORS]
}
