// /dashboard/fees → redirect to bursar dashboard (canonical fee management page)
import { redirect } from 'next/navigation'

export default function FeesRedirect() {
  redirect('/dashboard/bursar')
}
