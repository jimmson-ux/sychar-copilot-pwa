import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, DM_Sans } from 'next/font/google'
import './globals.css'
import InstallPrompt from '@/components/InstallPrompt'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['300', '400', '500', '600', '700'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700'],
})

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  title: 'Sychar Copilot | Nkoroi Senior Secondary School',
  description: 'AI-powered school management for Nkoroi Mixed Senior Secondary School, Ongata Rongai, Kajiado County',
  applicationName: 'Sychar Copilot',
  appleWebApp: {
    capable: true,
    title: 'Sychar Copilot',
    statusBarStyle: 'default',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/favicon.ico', sizes: '32x32' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico" />
        <meta name="theme-color" content="#0891b2" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Sychar Copilot" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Sychar Copilot" />
        <meta name="x-deploy-version" content="20260403-v8" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
                .then(function(reg) {
                  // Poll for updates every 10 seconds until stable, then every 60s
                  var _polls = 0
                  var _iv = setInterval(function() {
                    reg.update()
                    if (++_polls >= 6) { clearInterval(_iv); setInterval(function() { reg.update() }, 60000) }
                  }, 10000)

                  reg.addEventListener('updatefound', function() {
                    var newWorker = reg.installing
                    if (!newWorker) return
                    newWorker.addEventListener('statechange', function() {
                      if (newWorker.state === 'installed') {
                        // Tell the new SW to skip waiting and activate immediately
                        newWorker.postMessage({ type: 'SKIP_WAITING' })
                      }
                    })
                  })

                  // When the SW sends SW_UPDATED, reload to get fresh bundles
                  navigator.serviceWorker.addEventListener('message', function(e) {
                    if (e.data && e.data.type === 'SW_UPDATED') {
                      setTimeout(function() { window.location.reload() }, 300)
                    }
                  })
                })
                .catch(function(err) { console.warn('SW registration failed:', err) })
            })
          }
        `}} />
      </head>
      <body className={`${spaceGrotesk.variable} ${dmSans.variable}`} style={{ fontFamily: 'var(--font-dm-sans), DM Sans, system-ui, sans-serif' }}>
        {children}
        <InstallPrompt />
      </body>
    </html>
  )
}
