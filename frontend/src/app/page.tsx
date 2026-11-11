'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/auth';
import { ClassBanner, Logo, ThemeToggle } from '@/components/kit';
import { cn } from '@/lib/utils';
// Foto hero dengan latar langit dibuat transparan, jadi menyatu dengan latar halaman di tema terang maupun gelap.
import hero from '@/assets/hero.webp';

export default function LandingPage() {
  const { user } = useAuth();
  const href = user ? '/documents' : '/login';
  const label = user ? 'Buka portal' : 'Masuk';

  // Navbar menyatu dengan hero, lalu jadi padat dengan garis bawah setelah digulir.
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <div className="bg-white dark:bg-bg">
      <div className="fixed inset-x-0 top-0 z-40">
        <ClassBanner k="TERBATAS">Sistem informasi terbatas — hanya untuk personel berwenang</ClassBanner>
        <header
          className={cn(
            'border-b transition-colors duration-300',
            solid ? 'border-line bg-white/85 backdrop-blur-md dark:bg-bg/85' : 'border-transparent',
          )}
        >
          <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-5 sm:px-8">
            <Link href="/" className="flex items-center gap-3">
              <Logo className="h-7" />
              <span className="hidden font-display text-xl font-bold tracking-[0.14em] whitespace-nowrap sm:inline">SANDI-CHAIN</span>
            </Link>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link
                href={href}
                className="inline-flex h-9 items-center rounded-full bg-ink px-5 text-[13px] font-medium text-bg transition-opacity hover:opacity-85"
              >
                {label}
              </Link>
            </div>
          </div>
        </header>
      </div>

      {/* ------------------------------------------------ hero: pas satu layar */}
      {/* Teks ringkas di atas, foto mengisi sisa tinggi layar. Langit di foto transparan. */}
      <section className="flex min-h-[640px] flex-col pt-[112px] sm:h-[100svh] sm:pt-[124px]">
        <div className="mx-auto grid w-full max-w-[1320px] items-end gap-x-12 gap-y-6 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div>
            <p className="font-mono text-[11px] tracking-[0.24em] text-accent uppercase">
              Portal dokumen dinas
            </p>
            <h1 className="mt-4 text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] sm:text-[44px] xl:text-[52px]">
              Dokumen rahasia,
              <br />
              <span className="text-muted">jejak yang tak terhapus.</span>
            </h1>
          </div>
          <div className="lg:pb-1.5">
            <p className="text-[14.5px] text-muted">Integritas dan jejak akses dokumen klasifikasi, dicatat permanen di blockchain.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Link
                href={href}
                className="group inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[13.5px] font-semibold text-accent-ink shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)] transition-colors hover:bg-accent-hover"
              >
                {label}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* foto mengisi sisa layar; bagian bawah memudar ke latar halaman */}
        <div className="relative mx-auto mt-4 min-h-[300px] w-full max-w-[1800px] flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.src}
            alt="Barisan prajurit"
            className="absolute inset-0 size-full object-cover object-[50%_0%] [mask-image:linear-gradient(to_bottom,black_78%,transparent)] dark:brightness-[0.88]"
            draggable={false}
          />
        </div>
      </section>

      {/* Footer: pita hijau-hitam, warna tetap di kedua tema */}
      <footer className="bg-[#1a2013] text-[#ecebe0] dark:bg-[#151a11]">
        <div className="mx-auto max-w-[1320px] px-5 sm:px-8">
          <div className="grid items-center gap-8 py-12 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/" className="flex items-center gap-3 [--logo-gold:#d4a72c] [--logo-red:#e04a3f] [--logo-wing:#ecebe0]">
                <Logo className="h-8" />
                <span className="font-display text-[22px] font-bold tracking-[0.14em]">SANDI-CHAIN</span>
              </Link>
              <span className="hidden h-6 w-px bg-[#ecebe0]/20 md:block" aria-hidden />
              <p className="text-[14px] text-[#ecebe0]/60">Integritas dan jejak akses dokumen klasifikasi.</p>
            </div>
            <Link
              href={href}
              className="group inline-flex h-10 w-fit items-center gap-2 rounded-full bg-[#ecebe0] px-5 text-[13.5px] font-semibold text-[#1a2013] transition-colors hover:bg-white"
            >
              {label}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[#ecebe0]/12 py-6 text-[12.5px] text-[#ecebe0]/50">
            <span>© {new Date().getFullYear()} SANDI-Chain. Prototype, seluruh data fiktif.</span>
            <span className="flex items-center gap-2.5">
              <span className="rounded-xs border-[1.5px] border-current px-1.5 pt-px font-display text-[11px] leading-[1.45] font-bold tracking-[0.14em] text-[#6fa8dc] uppercase">
                Terbatas
              </span>
              Hanya untuk personel berwenang
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
