/** @type {import('next').NextConfig} */
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
