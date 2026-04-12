/** @type {import('next').NextConfig} */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : '',
  ].filter(Boolean).join(' '),
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
].join('; ')

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
    ]
  },

  // Prevent Next.js from bundling pdfkit — it reads font/icc data from disk
  // at runtime via fs.readFileSync and breaks when webpack inlines the module.
  serverExternalPackages: ['pdfkit'],

  // Vercel file tracing: include pdfkit's AFM data files (needed when pdfkit
  // is properly external) and the woff fonts used by the PDF route.
  outputFileTracingIncludes: {
    '/api/declarations/[id]/pdf': [
      './node_modules/pdfkit/js/data/**/*',
      './public/fonts/*.woff',
    ],
  },

  // Explicit webpack external as belt-and-suspenders (observed bundling despite
  // serverComponentsExternalPackages in some Next 14.x builds).
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals]).filter(Boolean),
        'pdfkit',
      ]
    }
    return config
  },

  // Silence the "sharp is required" warning — Next <Image> optimisation is
  // not used server-side in this project.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
