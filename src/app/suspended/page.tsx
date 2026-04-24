import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Account Unavailable — Sychar Copilot',
  robots: { index: false, follow: false },
}

const REASONS: Record<string, { heading: string }> = {
  expired: {
    heading: 'Your school subscription has expired',
  },
  suspended: {
    heading: 'Your school account has been suspended',
  },
}

const DEFAULT_HEADING = 'Access to your school account is unavailable'

interface Props {
  searchParams: Promise<{ reason?: string; role?: string }>
}

export default async function SuspendedPage({ searchParams }: Props) {
  const params  = await searchParams
  const reason  = params?.reason ?? ''
  const role    = params?.role   ?? ''
  const heading = REASONS[reason]?.heading ?? DEFAULT_HEADING
  const isPrincipal = role === 'principal'

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-16">

      {/* Card */}
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl px-8 py-10 space-y-8">

        {/* Logo */}
        <div className="text-center">
          <span className="text-2xl font-extrabold tracking-tight text-white">
            Sychar<span className="text-[#09D1C7]">Copilot</span>
          </span>
        </div>

        <div className="border-t border-gray-800" />

        {/* Status icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-3">
          <h1 className="text-xl font-semibold text-white leading-snug">{heading}</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Your school data is safe and fully preserved.
          </p>
        </div>

        <div className="border-t border-gray-800" />

        {/* Role-specific message */}
        {isPrincipal ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-300 text-center leading-relaxed">
              As principal you can still access your dashboard to review payment options and reinstate your account.
            </p>
            <Link
              href="/dashboard/principal"
              className="block w-full text-center bg-[#09D1C7] text-gray-950 font-semibold py-3 rounded-xl text-sm hover:bg-[#07b8af] transition-colors"
            >
              Go to Principal Dashboard
            </Link>

            <div className="bg-gray-800 rounded-xl px-4 py-4 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">Payment Instructions</p>
              <p className="text-sm text-gray-300 leading-relaxed">
                Send M-Pesa to <span className="font-mono text-[#09D1C7]">0700 000 000</span> (Sychar Ltd), then email the receipt to{' '}
                <span className="font-mono text-[#09D1C7]">billing@sychar.co.ke</span> with your school name.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-sm text-gray-400 leading-relaxed">
              Please contact your school principal to resolve this issue.
            </p>
          </div>
        )}

        <div className="border-t border-gray-800" />

        {/* Contact */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-widest text-center">
            Contact Support
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
              <svg
                className="w-4 h-4 text-[#09D1C7] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                />
              </svg>
              <span className="text-sm text-gray-300 select-all">support@sychar.co.ke</span>
            </div>
            <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
              <svg
                className="w-4 h-4 text-[#09D1C7] shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                />
              </svg>
              <span className="text-sm text-gray-300 select-all">+254 700 000 000</span>
            </div>
          </div>
        </div>

      </div>

      <p className="mt-6 text-xs text-gray-600 text-center max-w-sm leading-relaxed">
        If you believe this is an error, please contact your school administrator.
      </p>

    </div>
  )
}
