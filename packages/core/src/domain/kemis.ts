// KEMIS export helpers — format values to match Kenya EMIS field expectations.

export function formatKEMISDate(isoDate: string | null | undefined): string {
  if (!isoDate) return 'None'
  const raw = isoDate.split('T')[0]
  const parts = raw.split('-')
  if (parts.length !== 3) return 'None'
  const [year, month, day] = parts
  return `${day}/${month}/${year}`
}

export function kemisGender(gender: string | null | undefined): string {
  if (!gender) return 'Unknown'
  return gender.toUpperCase().startsWith('M') ? 'Male' : 'Female'
}
