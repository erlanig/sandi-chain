'use client';

import { useId } from 'react';
import { useAuth } from './auth';
import { Logo } from './kit';

/**
 * Banner "Selamat datang". Semua teks ada di sini dan dirender sebagai teks asli,
 * jadi cukup ubah nilai di bawah. Visualnya disusun dari lapisan (bukan satu gambar):
 * gradasi merah, loreng (feTurbulence), kisi heksagon, bendera Merah Putih, kilau emas.
 */
export const WELCOME = {
  /** Sapaan kecil di atas judul; nama pengguna ditambahkan otomatis. */
  kicker: 'Selamat datang,',
  /** Dua baris putih bertumpuk di kiri judul emas. */
  lead: ['Dokumen', 'Yang'],
  /** Kata besar berwarna emas. */
  highlight: 'AMAN',
  /** Baris slogan; huruf pertama tiap kata diberi warna. */
  tagline: ['Terlacak', 'Terverifikasi', 'Terenkripsi', 'Terkendali'],
  /** Teks samar berulang di latar. */
  watermark: 'SANDI',
};

const GOLD = 'bg-[linear-gradient(180deg,#fff6cf_0%,#f1cf6a_32%,#c8962f_62%,#f6dc85_100%)] bg-clip-text text-transparent';

export function WelcomeBanner() {
  const { user } = useAuth();
  const camo = useId();
  const hex = useId();
  const flagA = useId();
  const flagB = useId();

  return (
    <section
      className="relative isolate mb-7 overflow-hidden rounded-3xl bg-[#1b0707] text-white shadow-[0_20px_50px_-24px_rgba(90,15,10,0.6)]"
      aria-label="Selamat datang"
    >
      {/* ---------------------------------------------- latar berlapis */}
      <div
        className="absolute inset-0 -z-30"
        style={{
          background:
            'radial-gradient(900px 420px at 88% 8%, rgba(214,40,30,0.85), transparent 60%), radial-gradient(600px 300px at 62% 100%, rgba(150,25,18,0.55), transparent 70%), linear-gradient(105deg, #12090a 0%, #2a0c0b 42%, #6e130f 100%)',
        }}
      />

      {/* loreng: noise fraktal dipotong jadi empat warna */}
      <svg className="absolute inset-0 -z-20 size-full opacity-[0.8] [mask-image:linear-gradient(100deg,black_0%,black_40%,transparent_85%)]" aria-hidden>
        <filter id={camo} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="2" seed="23" />
          {/* satu kanal noise, dikontraskan, lalu dipetakan ke empat warna loreng */}
          <feColorMatrix type="matrix" values="3.2 0 0 0 -1.1  3.2 0 0 0 -1.1  3.2 0 0 0 -1.1  0 0 0 0 1" />
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues="0.04 0.13 0.27 0.43" />
            <feFuncG type="discrete" tableValues="0.05 0.18 0.31 0.36" />
            <feFuncB type="discrete" tableValues="0.03 0.08 0.14 0.20" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter={`url(#${camo})`} />
      </svg>

      {/* kisi heksagon tipis */}
      <svg className="absolute inset-0 -z-20 size-full opacity-[0.16] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" aria-hidden>
        <defs>
          <pattern id={hex} width="56" height="97" patternUnits="userSpaceOnUse" patternTransform="scale(0.9)">
            <path d="M28 0 56 16V48L28 64 0 48V16ZM28 64V97M0 48 L-28 64M56 48 L84 64" fill="none" stroke="#fff" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${hex})`} />
      </svg>

      {/* teks samar berulang */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden font-display text-[150px] leading-[0.9] font-bold tracking-[0.04em] whitespace-nowrap uppercase opacity-[0.05] select-none [-webkit-text-stroke:1.5px_#fff] [color:transparent]" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="-translate-x-12" style={{ marginLeft: i * 90 }}>
            {`${WELCOME.watermark} `.repeat(6)}
          </div>
        ))}
      </div>

      {/* bendera Merah Putih bergelombang di kanan atas */}
      <svg className="absolute -top-6 -right-10 -z-10 h-[78%] w-[62%] min-w-[420px] [mask-image:linear-gradient(to_left,black_35%,transparent)]" viewBox="0 0 800 400" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={flagA} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff4a3a" />
            <stop offset="1" stopColor="#b3150f" />
          </linearGradient>
          <linearGradient id={flagB} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#c9c4c0" />
          </linearGradient>
        </defs>
        <path d="M0 70C140 20 280 120 430 70S690 20 800 60V210C690 170 560 250 430 210S140 150 0 215Z" fill={`url(#${flagA})`} opacity="0.92" />
        <path d="M0 215C140 150 280 255 430 210S690 170 800 210V350C690 315 560 395 430 355S140 300 0 355Z" fill={`url(#${flagB})`} opacity="0.85" />
        {/* bayangan lipatan kain */}
        <path d="M0 70C140 20 280 120 430 70S690 20 800 60V350C690 315 560 395 430 355S140 300 0 355Z" fill="#000" opacity="0.18" style={{ mixBlendMode: 'multiply' }} />
      </svg>

      {/* kilau emas di tepi kiri dan sorot cahaya */}
      <span className="absolute top-7 left-0 h-px w-[46%] bg-gradient-to-r from-[#f3d27a] via-[#f3d27a]/60 to-transparent" aria-hidden />
      <span className="absolute top-[34px] left-0 h-[2px] w-[22%] bg-gradient-to-r from-[#fff3c4] to-transparent blur-[1px]" aria-hidden />
      <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" aria-hidden />

      {/* lambang besar di kanan */}
      <div className="pointer-events-none absolute top-1/2 right-[5%] hidden -translate-y-1/2 lg:block [--logo-gold:#f1cf6a] [--logo-red:#ff5a48] [--logo-wing:#f4efe6]" aria-hidden>
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-[radial-gradient(closest-side,rgba(255,90,70,0.45),transparent)]" />
        <Logo className="h-44 drop-shadow-[0_10px_24px_rgba(0,0,0,0.55)]" />
      </div>

      {/* ---------------------------------------------- isi */}
      <div className="relative px-6 pt-10 pb-24 sm:px-10 sm:pt-12 lg:pb-20">
        <p className="text-[14px] font-medium text-white/85 sm:text-[15px]">
          {WELCOME.kicker} <span className="font-semibold text-white">{user?.nama}</span>
        </p>

        <div className="mt-3 flex items-end gap-3 sm:gap-4">
          <div className="pb-1 font-display text-[30px] leading-[0.88] font-bold tracking-wide text-white uppercase [text-shadow:0_2px_10px_rgba(0,0,0,0.5)] sm:text-[44px]">
            {WELCOME.lead.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
          <div className={`font-display text-[84px] leading-[0.82] font-bold tracking-[0.01em] uppercase drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)] sm:text-[124px] ${GOLD}`}>
            {WELCOME.highlight}
          </div>
        </div>

        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] font-medium text-white sm:text-[16px] [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
          {WELCOME.tagline.map((w, i) => (
            <span key={w} className="flex items-center gap-3">
              {i > 0 && <span className="text-[#f1cf6a]">★</span>}
              <span>
                <span className="font-bold text-[#ff6a55]">{w[0]}</span>
                {w.slice(1)}
              </span>
            </span>
          ))}
        </p>
      </div>

      {/* papan nama emas bersudut miring */}
      {user && (
        <div
          className="absolute right-0 bottom-0 flex max-w-full items-center gap-3 bg-[linear-gradient(100deg,#fff1b8_0%,#f1cf6a_30%,#c8962f_70%,#e9c35c_100%)] py-2.5 pr-5 pl-9 text-[#2a1604] [clip-path:polygon(22px_0,100%_0,100%_100%,0_100%)] sm:pr-8"
          style={{ filter: 'drop-shadow(0 -2px 12px rgba(0,0,0,0.35))' }}
        >
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13.5px] font-bold sm:text-[15px]">{user.nama}</p>
            <p className="truncate text-[12px] font-medium opacity-80 sm:text-[13px]">
              {user.jabatan} · {user.mspId}
            </p>
          </div>
          <span className="shrink-0 text-[15px] tracking-tight text-[#7a1410] max-sm:hidden">★★★★</span>
        </div>
      )}
    </section>
  );
}
