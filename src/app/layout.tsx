import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, DM_Sans } from 'next/font/google'
import './globals.css'
import InstallPrompt from '@/components/InstallPrompt'
import { SchoolThemeProvider } from '@/components/providers/SchoolThemeProvider'

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
        <meta name="x-deploy-version" content="20260403-v9" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            // Reload once when a new SW takes control (controllerchange fires after
            // skipWaiting + clients.claim, even if the page was loaded before the SW)
            var _reloading = false
            navigator.serviceWorker.addEventListener('controllerchange', function() {
              if (_reloading) return
              _reloading = true
              window.location.reload()
            })

            // Also handle the explicit SW_UPDATED postMessage from the activate handler
            navigator.serviceWorker.addEventListener('message', function(e) {
              if (e.data && e.data.type === 'SW_UPDATED' && !_reloading) {
                _reloading = true
                setTimeout(function() { window.location.reload() }, 200)
              }
            })

            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
                .then(function(reg) {
                  // Poll aggressively: every 10 s for first minute, then every 60 s
                  var _polls = 0
                  var _iv = setInterval(function() {
                    reg.update()
                    if (++_polls >= 6) {
                      clearInterval(_iv)
                      setInterval(function() { reg.update() }, 60000)
                    }
                  }, 10000)

                  // When a new SW is found, tell it to skip waiting immediately
                  reg.addEventListener('updatefound', function() {
                    var newWorker = reg.installing
                    if (!newWorker) return
                    newWorker.addEventListener('statechange', function() {
                      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        newWorker.postMessage({ type: 'SKIP_WAITING' })
                      }
                    })
                  })
                })
                .catch(function(err) { console.warn('SW registration failed:', err) })
            })
          }
        `}} />
      </head>
      <body className={`${spaceGrotesk.variable} ${dmSans.variable}`} style={{ fontFamily: 'var(--font-dm-sans), DM Sans, system-ui, sans-serif' }}>
        <SchoolThemeProvider>
          {children}
          <InstallPrompt />
        </SchoolThemeProvider>
      </body>
    </html>
  )
}
