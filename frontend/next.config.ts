import type { NextConfig } from 'next';

const backend = process.env.BACKEND_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  // supaya Server-Sent Events alert tidak di-buffer oleh kompresi
  compress: false,
  poweredByHeader: false,
  // Browser hanya bicara ke origin portal; API diproxy (cookie httpOnly tetap same-origin)
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default config;
