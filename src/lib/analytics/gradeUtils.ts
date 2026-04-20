/**
 * gradeUtils.ts
 * Grade calculation for both 8-4-4 and CBC curricula.
 * Pure functions — no DB calls, no side effects.
 */

// ── 8-4-4 ─────────────────────────────────────────────────────────────────────

export interface Grade844 {
  grade:  string
  points: number
}

export function calculateGrade844(percentage: number): Grade844 {
  if (percentage >= 81) return { grade: 'A',  points: 12 }
  if (percentage >= 74) return { grade: 'A-', points: 11 }
  if (percentage >= 67) return { grade: 'B+', points: 10 }
  if (percentage >= 60) return { grade: 'B',  points: 9  }
  if (percentage >= 53) return { grade: 'B-', points: 8  }
  if (percentage >= 46) return { grade: 'C+', points: 7  }
  if (percentage >= 39) return { grade: 'C',  points: 6  }
  if (percentage >= 32) return { grade: 'C-', points: 5  }
  if (percentage >= 25) return { grade: 'D+', points: 4  }
  if (percentage >= 18) return { grade: 'D',  points: 3  }
  if (percentage >= 11) return { grade: 'D-', points: 2  }
  return                       { grade: 'E',  points: 1  }
}

/** Reverse-lookup grade label from mean points (for report card mean grade) */
export function pointsToGrade844(points: number): string {
  if (points >= 11.5) return 'A'
  if (points >= 10.5) return 'A-'
  if (points >= 9.5)  return 'B+'
  if (points >= 8.5)  return 'B'
  if (points >= 7.5)  return 'B-'
  if (points >= 6.5)  return 'C+'
  if (points >= 5.5)  return 'C'
  if (points >= 4.5)  return 'C-'
  if (points >= 3.5)  return 'D+'
  if (points >= 2.5)  return 'D'
  if (points >= 1.5)  return 'D-'
  return 'E'
}

/**
 * 844 mean grade — sum of best 8 subject points / 8
 * (or all subjects if fewer than 8)
 */
export interface MeanGrade844 {
  mean_points: number
  mean_grade:  string
}

export function calculateMeanGrade844(subjectPoints: number[]): MeanGrade844 {
  if (!subjectPoints.length) return { mean_points: 0, mean_grade: 'E' }
  const sorted     = [...subjectPoints].sort((a, b) => b - a)
  const top8       = sorted.slice(0, 8)
  const mean_points = parseFloat((top8.reduce((a, b) => a + b, 0) / top8.length).toFixed(2))
  return { mean_points, mean_grade: pointsToGrade844(mean_points) }
}

// ── CBC ────────────────────────────────────────────────────────────────────────

export interface GradeCBC {
  grade_code: string
  level:      string
  points:     number
}

export function calculateGradeCBC(rawMarks: number): GradeCBC {
  if (rawMarks >= 90) return { grade_code: 'EE1', level: 'Exceeding Expectation',  points: 4.0 }
  if (rawMarks >= 75) return { grade_code: 'EE2', level: 'Exceeding Expectation',  points: 3.5 }
  if (rawMarks >= 58) return { grade_code: 'ME1', level: 'Meeting Expectation',     points: 3.0 }
  if (rawMarks >= 41) return { grade_code: 'ME2', level: 'Meeting Expectation',     points: 2.5 }
  if (rawMarks >= 31) return { grade_code: 'AE1', level: 'Approaching Expectation', points: 2.0 }
  if (rawMarks >= 21) return { grade_code: 'AE2', level: 'Approaching Expectation', points: 1.5 }
  if (rawMarks >= 11) return { grade_code: 'BE1', level: 'Below Expectation',        points: 1.0 }
  return                     { grade_code: 'BE2', level: 'Below Expectation',        points: 0.5 }
}

export interface MeanGradeCBC {
  mean_points: number
  mean_level:  string
}

export function calculateMeanGradeCBC(subjectPoints: number[]): MeanGradeCBC {
  if (!subjectPoints.length) return { mean_points: 0, mean_level: 'Below Expectation' }
  const mean_points = parseFloat(
    (subjectPoints.reduce((a, b) => a + b, 0) / subjectPoints.length).toFixed(2),
  )
  const level =
    mean_points >= 3.75 ? 'Exceeding Expectation' :
    mean_points >= 2.75 ? 'Meeting Expectation' :
    mean_points >= 1.75 ? 'Approaching Expectation' :
    'Below Expectation'
  return { mean_points, mean_level: level }
}

// ── Severity helpers ──────────────────────────────────────────────────────────

export type DropSeverity = 'mild' | 'moderate' | 'severe'

export function classifyDrop(delta: number): DropSeverity {
  const abs = Math.abs(delta)
  if (abs > 20) return 'severe'
  if (abs > 10) return 'moderate'
  return 'mild'
}

export function suggestAction(severity: DropSeverity): string {
  switch (severity) {
    case 'mild':     return 'Monitor closely this week'
    case 'moderate': return 'Schedule one-on-one session'
    case 'severe':   return 'Immediate intervention + parent contact'
  }
}

export type TopicSeverity = 'critical' | 'needs_attention' | 'good'

export function classifyTopicFailureRate(rate: number): TopicSeverity {
  if (rate > 50) return 'critical'
  if (rate > 30) return 'needs_attention'
  return 'good'
}

// ── KCPE normalisation ────────────────────────────────────────────────────────
// KCPE max = 500, KPSEA max = 100 → both normalised to percentage

export function normaliseBaseline(score: number, type: 'KCPE' | 'KPSEA'): number {
  return type === 'KCPE'
    ? parseFloat(((score / 500) * 100).toFixed(2))
    : parseFloat(score.toFixed(2))
}
