import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SANDI-Chain',
    short_name: 'SANDI-Chain',
    description: 'Sistem integritas & jejak akses dokumen klasifikasi',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f130e',
    theme_color: '#2c361c',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon1.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon2.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
