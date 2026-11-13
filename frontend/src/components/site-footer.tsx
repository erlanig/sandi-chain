'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuth } from './auth';
import { Logo } from './kit';

/** Footer bersama: pita hijau-hitam, warna tetap di kedua tema. Dipakai di landing dan seluruh portal (bukan login). */
export function SiteFooter() {
  const { user } = useAuth();
  const href = user ? '/documents' : '/login';
  const label = user ? 'Buka portal' : 'Masuk';

  return (
    <footer className="bg-[#1a2013] text-[#ecebe0] dark:bg-[#151a11]">
      <div className="mx-auto max-w-[1360px] px-5 sm:px-8">
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
  );
}
