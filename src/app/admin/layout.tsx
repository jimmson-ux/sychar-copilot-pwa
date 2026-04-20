import type { Metadata } from 'next'
import { Syne, JetBrains_Mono } from 'next/font/google'
import AdminSidebar from '@/components/admin/AdminSidebar'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title:       'Sychar God Mode',
  description: 'Sychar Copilot Admin Dashboard',
  robots:      { index: false, follow: false },
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${jetbrainsMono.variable}`}
    >
      <body style={{ margin: 0, background: '#0a0a0b' }}>
        <div style={{ display: 'flex', flexDirection: 'row' }}>
          <AdminSidebar />
          <main
            style={{
              marginLeft:    220,
              minHeight:     '100vh',
              padding:       32,
              background:    '#0a0a0b',
              flex:          1,
              boxSizing:     'border-box',
            }}
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
