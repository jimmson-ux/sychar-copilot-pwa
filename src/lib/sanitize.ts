export function sanitizeSearch(input: string): string {
  return input
    .replace(/[%_\\]/g, '\\$&')
    .replace(/[<>'"`;{}()|]/g, '')
    .trim()
    .slice(0, 100)
}

export function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('254') && digits.length === 12) return '+' + digits
  if (digits.startsWith('0') && digits.length === 10) return '+254' + digits.slice(1)
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
    return '+254' + digits
  }
  return phone.trim()
}

export function sanitizeText(input: string, maxLength = 500): string {
  return input
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength)
}

export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

export function isValidAdmissionNo(str: string): boolean {
  return /^[A-Z]{2,5}\/\d{4}\/\d{3,4}$/.test(str.toUpperCase())
}

export function isValidScore(score: number, outOf = 100): boolean {
  return Number.isFinite(score) && score >= 0 && score <= outOf
}

export function isValidTerm(term: number): boolean {
  return [1, 2, 3].includes(term)
}

export function isValidExamType(type: string): boolean {
  return ['opener', 'mid_term', 'end_term', 'mock', 'kcse', 'cat'].includes(type)
}

export function isValidSeverity(sev: string): boolean {
  return ['minor', 'moderate', 'serious', 'critical'].includes(sev)
}

export function safeError(error: unknown, context: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  console.error(`[${context}]`, error)
  if (isDev && error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
