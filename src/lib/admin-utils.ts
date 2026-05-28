export function genTempPassword(name: string): string {
  const first  = name.trim().split(/\s+/)[0] ?? 'School'
  const year   = new Date().getFullYear()
  const digits = String(Math.floor(1000 + Math.random() * 9000))
  return `${first}@${year}${digits}`
}
