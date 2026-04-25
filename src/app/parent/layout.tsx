import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title:       'Sychar Parent',
  description: 'Stay connected with your child\'s school',
  manifest:    '/manifest-parent.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Sychar Parent' },
}

export const viewport: Viewport = {
  themeColor:         '#16a34a',
  width:              'device-width',
  initialScale:       1,
  maximumScale:       1,
  userScalable:       false,
}

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#f0fdf4', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {children}
    </div>
  )
}
