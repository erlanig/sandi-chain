'use client';

import { Toaster as Sonner } from 'sonner';

/** Toast tanpa gaya bawaan: tampilannya ditentukan token tema. */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      // di bawah banner klasifikasi + navbar yang menempel di atas
      offset={{ top: 112 }}
      mobileOffset={{ top: 112 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'flex w-[360px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border border-line-strong border-l-4 bg-panel p-3 text-[13px] text-ink shadow-lg shadow-black/25',
          title: 'font-semibold',
          description: 'text-muted',
          error: 'border-l-bad',
          success: 'border-l-ok',
          icon: 'mt-0.5',
        },
      }}
    />
  );
}
