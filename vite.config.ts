import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { defineConfig } from 'vite'

// Source maps are uploaded to Better Stack (Sentry-compatible) only when these are set,
// i.e. on Vercel builds. They are build-time secrets: no VITE_ prefix, never sent to the browser.
const uploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_URL,
)

export default defineConfig({
  // 'hidden' emits maps without a sourceMappingURL comment; the plugin uploads then deletes them.
  build: { sourcemap: uploadSourceMaps ? 'hidden' : false },
  // Fixed port: the Supabase redirect allow-list contains this exact origin.
  // strictPort fails instead of silently moving to 5174 when 5173 is busy.
  // `.local` lets a phone use the Mac's Bonjour name (stable across networks, unlike its IP).
  server: { port: 5173, strictPort: true, allowedHosts: ['.local'] },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pulse',
        short_name: 'Pulse',
        description: 'Personal dashboard & habit tracker',
        theme_color: '#07070C',
        background_color: '#07070C',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
    ...(uploadSourceMaps
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            url: process.env.SENTRY_URL,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            telemetry: false,
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            // A monitoring hiccup must never fail a deploy.
            errorHandler: (err) => console.warn('[source maps] upload failed:', err.message),
          }),
        ]
      : []),
  ],
})
