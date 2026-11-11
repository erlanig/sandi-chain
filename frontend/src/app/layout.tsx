import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/components/auth';
import { Toaster } from '@/components/ui/toaster';

// Font disimpan di repo (src/fonts) supaya build dan runtime tidak butuh internet.
const jakarta = localFont({
  variable: '--font-jakarta',
  display: 'swap',
  src: [
    { path: '../fonts/plus-jakarta-sans-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/plus-jakarta-sans-latin-500-normal.woff2', weight: '500' },
    { path: '../fonts/plus-jakarta-sans-latin-600-normal.woff2', weight: '600' },
    { path: '../fonts/plus-jakarta-sans-latin-700-normal.woff2', weight: '700' },
  ],
});
const plexMono = localFont({
  variable: '--font-plex-mono',
  display: 'swap',
  src: [
    { path: '../fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
    { path: '../fonts/ibm-plex-mono-latin-600-normal.woff2', weight: '600' },
  ],
});
const barlow = localFont({
  variable: '--font-barlow',
  display: 'swap',
  src: [
    { path: '../fonts/barlow-condensed-latin-500-normal.woff2', weight: '500' },
    { path: '../fonts/barlow-condensed-latin-600-normal.woff2', weight: '600' },
    { path: '../fonts/barlow-condensed-latin-700-normal.woff2', weight: '700' },
  ],
});

export const metadata: Metadata = {
  title: 'SANDI-Chain',
  description: 'Sistem integritas & jejak akses dokumen klasifikasi berbasis permissioned blockchain',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f1e6' },
    { media: '(prefers-color-scheme: dark)', color: '#161b14' },
  ],
};

// Dijalankan sebelum render pertama supaya tema tidak berkedip.
// Pilihan tersimpan menang; kalau belum ada, ikuti preferensi sistem.
const themeScript = `(function(){var t;try{t=localStorage.getItem('sandi.theme')}catch(e){}
if(t!=='light'&&t!=='dark'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}
document.documentElement.dataset.theme=t})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${jakarta.variable} ${plexMono.variable} ${barlow.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
