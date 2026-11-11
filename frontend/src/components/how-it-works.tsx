/**
 * Section "Cara kerja" di landing page.
 * Sengaja polos: pita gelap, judul besar, empat baris bernomor dipisah garis.
 * Warna pita tetap gelap di kedua tema supaya kontras dengan hero.
 */
const POINTS = [
  ['01', 'Jejak permanen', 'Setiap buka, tolak, revisi, dan disposisi tercatat di ledger. Tidak bisa dihapus, termasuk oleh admin.'],
  ['02', 'Akses sesuai clearance', 'Chaincode memutuskan siapa boleh membuka dokumen, berdasarkan atribut di sertifikat personel.'],
  ['03', 'Isi tetap rahasia', 'File dienkripsi per dokumen. Ledger hanya menyimpan sidik jarinya, bukan isinya.'],
  ['04', 'Peringatan seketika', 'Percobaan akses tidak sah langsung muncul di pusat pengamanan.'],
];

export function HowItWorks() {
  return (
    <section id="cara-kerja" className="scroll-mt-24 bg-[#1a2013] text-[#ecebe0] dark:bg-[#161b12]">
      <div className="mx-auto grid max-w-[1320px] gap-x-16 gap-y-12 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-32">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="font-mono text-[11px] tracking-[0.24em] text-[#b9c578] uppercase">Cara kerja</p>
          <h2 className="mt-5 text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] sm:text-[44px]">
            Empat lapis pengamanan.
            <br />
            <span className="text-[#ecebe0]/45">Satu jejak yang utuh.</span>
          </h2>
        </div>

        <ol className="border-b border-[#ecebe0]/12">
          {POINTS.map(([n, title, body]) => (
            <li key={n} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-6 border-t border-[#ecebe0]/12 py-8 sm:grid-cols-[88px_minmax(0,1fr)]">
              <span className="font-display text-[44px] leading-none font-bold text-[#b9c578] sm:text-[56px]">{n}</span>
              <div className="pt-1">
                <h3 className="text-[19px] font-semibold tracking-[-0.01em] sm:text-[21px]">{title}</h3>
                <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[#ecebe0]/60">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
