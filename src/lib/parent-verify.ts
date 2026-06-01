// Knowledge-based parent→student verification (name + admission number).
// Relocated out of the route file so it can be shared (e.g. the Groq chat route)
// — Next.js 16 route.ts files may only export HTTP handlers + config.
export async function verifyAndLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc:              any,
  _parentIdentifier: string,
  schoolId:          string,
  studentName:       string,
  admissionNumber:   string,
): Promise<
  | { verified: true;  studentId: string; studentName: string; className: string }
  | { verified: false; reason: 'not_found' }
> {
  const { data: students } = await svc
    .from('students')
    .select('id, full_name, class_name')
    .eq('school_id', schoolId)
    .eq('admission_no', admissionNumber.trim())
    .limit(5)

  if (!students?.length) return { verified: false, reason: 'not_found' }

  const tokens = studentName.toLowerCase().split(/\s+/).filter((t: string) => t.length >= 3)
  const match  = (students as { id: string; full_name: string; class_name: string }[]).find(
    (s) => tokens.length === 0 || tokens.some((t: string) => s.full_name.toLowerCase().includes(t)),
  )
  if (!match) return { verified: false, reason: 'not_found' }

  return { verified: true, studentId: match.id, studentName: match.full_name, className: match.class_name }
}
