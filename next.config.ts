import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,

  // Silence workspace root warning
  turbopack: {
    root: path.resolve(__dirname),
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'xwgtsldimlrhtgvpnjnd.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      // Security headers on all routes
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control',     value: 'on' },
        ],
      },
      // Cache icons and manifest
      {
        source: '/(icon-192|icon-512|icon-maskable-512|apple-touch-icon)\\.(png|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
      // Service worker — never cache, always fresh
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
