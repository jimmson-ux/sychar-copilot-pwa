// Static KUCCPS course database — minimum cluster weights (A+B) for 2025 placement
// Source: KUCCPS 2024/2025 Admission Guide

export type ClusterKey = 'STEM' | 'SOCIAL' | 'ARTS' | 'TECHNICAL'

export interface KuccpsCourse {
  course: string
  institution: string
  clusterA: number   // minimum cluster A weight
  clusterB: number   // minimum cluster B weight
  minGrade: string   // overall minimum KCSE grade
  duration: number   // years
  cluster: ClusterKey
}

export const KUCCPS_COURSES: Record<ClusterKey, KuccpsCourse[]> = {
  STEM: [
    { course: 'Bachelor of Medicine & Surgery (MBChB)', institution: 'University of Nairobi', clusterA: 56, clusterB: 54, minGrade: 'B+', duration: 6, cluster: 'STEM' },
    { course: 'Bachelor of Medicine & Surgery (MBChB)', institution: 'Moi University', clusterA: 54, clusterB: 52, minGrade: 'B+', duration: 6, cluster: 'STEM' },
    { course: 'Bachelor of Dental Surgery', institution: 'University of Nairobi', clusterA: 54, clusterB: 52, minGrade: 'B+', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Pharmacy', institution: 'University of Nairobi', clusterA: 50, clusterB: 48, minGrade: 'B', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Pharmacy', institution: 'Kenyatta University', clusterA: 48, clusterB: 46, minGrade: 'B', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Engineering (Civil)', institution: 'University of Nairobi', clusterA: 46, clusterB: 44, minGrade: 'B', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Engineering (Electrical & Electronic)', institution: 'University of Nairobi', clusterA: 46, clusterB: 44, minGrade: 'B', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Engineering (Mechanical)', institution: 'University of Nairobi', clusterA: 44, clusterB: 42, minGrade: 'B', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Engineering (Civil)', institution: 'JKUAT', clusterA: 44, clusterB: 42, minGrade: 'B', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Engineering (Electrical)', institution: 'JKUAT', clusterA: 44, clusterB: 42, minGrade: 'B', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Architecture', institution: 'University of Nairobi', clusterA: 44, clusterB: 42, minGrade: 'B', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Science (Computer Science)', institution: 'University of Nairobi', clusterA: 40, clusterB: 38, minGrade: 'B-', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Computer Science)', institution: 'Kenyatta University', clusterA: 38, clusterB: 36, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Software Engineering)', institution: 'JKUAT', clusterA: 40, clusterB: 38, minGrade: 'B-', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Nursing', institution: 'University of Nairobi', clusterA: 42, clusterB: 40, minGrade: 'B-', duration: 4, cluster: 'STEM' },
    { course: 'Diploma in Nursing', institution: 'KMTC', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 3, cluster: 'STEM' },
    { course: 'Bachelor of Science (Mathematics)', institution: 'University of Nairobi', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Physics)', institution: 'Kenyatta University', clusterA: 34, clusterB: 32, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Chemistry)', institution: 'Kenyatta University', clusterA: 34, clusterB: 32, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Biology)', institution: 'Kenyatta University', clusterA: 34, clusterB: 32, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Biochemistry)', institution: 'JKUAT', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Environmental Science', institution: 'Kenyatta University', clusterA: 32, clusterB: 30, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Agricultural Engineering)', institution: 'JKUAT', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Science (Food Science)', institution: 'University of Nairobi', clusterA: 32, clusterB: 30, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Meteorology)', institution: 'University of Nairobi', clusterA: 34, clusterB: 32, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Information Technology)', institution: 'Strathmore University', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Actuarial Science', institution: 'University of Nairobi', clusterA: 46, clusterB: 44, minGrade: 'B', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Statistics', institution: 'University of Nairobi', clusterA: 38, clusterB: 36, minGrade: 'B-', duration: 4, cluster: 'STEM' },
    { course: 'Bachelor of Science (Veterinary Medicine)', institution: 'University of Nairobi', clusterA: 50, clusterB: 48, minGrade: 'B', duration: 5, cluster: 'STEM' },
    { course: 'Bachelor of Science (Optometry)', institution: 'Masinde Muliro University', clusterA: 38, clusterB: 36, minGrade: 'B-', duration: 4, cluster: 'STEM' },
  ],

  SOCIAL: [
    { course: 'Bachelor of Laws (LLB)', institution: 'University of Nairobi', clusterA: 52, clusterB: 50, minGrade: 'B+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Laws (LLB)', institution: 'Kenyatta University', clusterA: 48, clusterB: 46, minGrade: 'B', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Laws (LLB)', institution: 'Strathmore University', clusterA: 50, clusterB: 48, minGrade: 'B', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Commerce (Accounting)', institution: 'University of Nairobi', clusterA: 40, clusterB: 38, minGrade: 'B-', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Commerce', institution: 'Kenyatta University', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Economics', institution: 'University of Nairobi', clusterA: 42, clusterB: 40, minGrade: 'B-', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Business Administration', institution: 'Strathmore University', clusterA: 40, clusterB: 38, minGrade: 'B-', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Business Management', institution: 'JKUAT', clusterA: 34, clusterB: 32, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of International Relations', institution: 'University of Nairobi', clusterA: 38, clusterB: 36, minGrade: 'B-', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Public Policy & Administration', institution: 'Kenyatta University', clusterA: 34, clusterB: 32, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Psychology', institution: 'Kenyatta University', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Social Work', institution: 'University of Nairobi', clusterA: 32, clusterB: 30, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Journalism & Mass Communication', institution: 'University of Nairobi', clusterA: 34, clusterB: 32, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Arts (Political Science)', institution: 'University of Nairobi', clusterA: 34, clusterB: 32, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Finance', institution: 'Strathmore University', clusterA: 40, clusterB: 38, minGrade: 'B-', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Procurement & Supply Chain', institution: 'JKUAT', clusterA: 32, clusterB: 30, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Hospitality Management', institution: 'Kenyatta University', clusterA: 28, clusterB: 26, minGrade: 'C', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Tourism Management', institution: 'University of Nairobi', clusterA: 30, clusterB: 28, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Real Estate', institution: 'University of Nairobi', clusterA: 34, clusterB: 32, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
    { course: 'Bachelor of Insurance', institution: 'Kenyatta University', clusterA: 30, clusterB: 28, minGrade: 'C+', duration: 4, cluster: 'SOCIAL' },
  ],

  ARTS: [
    { course: 'Bachelor of Education (Arts — English/Kiswahili)', institution: 'Kenyatta University', clusterA: 28, clusterB: 26, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Education (Arts — History/CRE)', institution: 'University of Nairobi', clusterA: 26, clusterB: 24, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Arts (Linguistics)', institution: 'University of Nairobi', clusterA: 28, clusterB: 26, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Arts (Literature)', institution: 'Kenyatta University', clusterA: 26, clusterB: 24, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Arts (Music)', institution: 'Kenyatta University', clusterA: 24, clusterB: 22, minGrade: 'C-', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Fine Arts', institution: 'Kenyatta University', clusterA: 24, clusterB: 22, minGrade: 'C-', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Arts (French)', institution: 'University of Nairobi', clusterA: 26, clusterB: 24, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Arts (Kiswahili)', institution: 'University of Nairobi', clusterA: 26, clusterB: 24, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Library & Information Science', institution: 'University of Nairobi', clusterA: 28, clusterB: 26, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Theology', institution: 'St Pauls University', clusterA: 24, clusterB: 22, minGrade: 'C-', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Arts (Religious Studies)', institution: 'Kenyatta University', clusterA: 24, clusterB: 22, minGrade: 'C-', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Arts (Philosophy)', institution: 'University of Nairobi', clusterA: 26, clusterB: 24, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Arts (Geography)', institution: 'Kenyatta University', clusterA: 26, clusterB: 24, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Bachelor of Arts (History & Archaeology)', institution: 'University of Nairobi', clusterA: 26, clusterB: 24, minGrade: 'C', duration: 4, cluster: 'ARTS' },
    { course: 'Diploma in Film & Theatre Arts', institution: 'Kenyatta University', clusterA: 22, clusterB: 20, minGrade: 'C-', duration: 3, cluster: 'ARTS' },
  ],

  TECHNICAL: [
    { course: 'Bachelor of Technology (Building & Civil Engineering)', institution: 'JKUAT', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 4, cluster: 'TECHNICAL' },
    { course: 'Bachelor of Technology (Mechanical Engineering)', institution: 'JKUAT', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 4, cluster: 'TECHNICAL' },
    { course: 'Bachelor of Technology (Electrical Engineering)', institution: 'Moi University', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 4, cluster: 'TECHNICAL' },
    { course: 'Bachelor of Technology (ICT)', institution: 'Technical University of Kenya', clusterA: 30, clusterB: 28, minGrade: 'C+', duration: 4, cluster: 'TECHNICAL' },
    { course: 'Diploma in Medical Laboratory Sciences', institution: 'KMTC', clusterA: 32, clusterB: 30, minGrade: 'C+', duration: 3, cluster: 'TECHNICAL' },
    { course: 'Diploma in Clinical Medicine', institution: 'KMTC', clusterA: 36, clusterB: 34, minGrade: 'C+', duration: 3, cluster: 'TECHNICAL' },
    { course: 'Diploma in Business Information Technology', institution: 'KCA University', clusterA: 26, clusterB: 24, minGrade: 'C', duration: 3, cluster: 'TECHNICAL' },
    { course: 'Diploma in Accountancy', institution: 'KASNEB/Various', clusterA: 24, clusterB: 22, minGrade: 'C', duration: 3, cluster: 'TECHNICAL' },
    { course: 'Diploma in Supply Chain Management', institution: 'Kenya School of Supply Chain', clusterA: 24, clusterB: 22, minGrade: 'C', duration: 3, cluster: 'TECHNICAL' },
    { course: 'Diploma in Automotive Engineering', institution: 'Technical University of Mombasa', clusterA: 24, clusterB: 22, minGrade: 'C', duration: 3, cluster: 'TECHNICAL' },
    { course: 'Craft Certificate in Motor Vehicle Mechanics', institution: 'TTIs', clusterA: 16, clusterB: 14, minGrade: 'D+', duration: 2, cluster: 'TECHNICAL' },
    { course: 'Diploma in Electrical Installation', institution: 'TTIs', clusterA: 22, clusterB: 20, minGrade: 'C-', duration: 3, cluster: 'TECHNICAL' },
  ],
}

// KCSE grade to points mapping (Kenya 2026 system)
export const GRADE_POINTS: Record<string, number> = {
  'A':  12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8,
  'C+': 7,  'C': 6,   'C-': 5,  'D+': 4, 'D': 3,
  'D-': 2,  'E': 1,
}

export function gradeToPoints(grade: string): number {
  return GRADE_POINTS[grade.trim()] ?? 0
}

export function detectCluster(subjectMarks: Record<string, number>): ClusterKey {
  const stem   = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Studies', 'Agriculture']
  const social = ['Business Studies', 'Economics', 'Commerce', 'History', 'Government', 'Geography']
  const arts   = ['English', 'Kiswahili', 'Literature', 'CRE', 'IRE', 'Music', 'French']

  let stemScore = 0; let socialScore = 0; let artsScore = 0
  for (const [subj, mark] of Object.entries(subjectMarks)) {
    if (stem.some(s => subj.toLowerCase().includes(s.toLowerCase())))   stemScore   += mark
    else if (social.some(s => subj.toLowerCase().includes(s.toLowerCase()))) socialScore += mark
    else if (arts.some(s => subj.toLowerCase().includes(s.toLowerCase())))  artsScore   += mark
  }

  if (stemScore >= socialScore && stemScore >= artsScore) return 'STEM'
  if (socialScore >= artsScore) return 'SOCIAL'
  return 'ARTS'
}

// Returns courses the student can qualify for given cluster score
export function matchCourses(
  clusterScore: number,
  cluster: ClusterKey,
  topN = 5
): KuccpsCourse[] {
  return KUCCPS_COURSES[cluster]
    .filter(c => clusterScore >= c.clusterB)
    .sort((a, b) => b.clusterA - a.clusterA)
    .slice(0, topN)
}
