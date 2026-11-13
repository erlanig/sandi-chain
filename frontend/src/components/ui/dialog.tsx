'use client';

import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, 'title'> & { title: string; description?: React.ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/55" />
      <D.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-line-strong bg-panel p-5 shadow-2xl shadow-black/40',
          className,
        )}
        {...(description ? {} : { 'aria-describedby': undefined })}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-lg font-semibold tracking-[-0.01em]">{title}</D.Title>
            {description && <D.Description className="mt-1 text-[13px] text-muted">{description}</D.Description>}
          </div>
          <D.Close className="-mt-1 -mr-1 grid size-7 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-ink" aria-label="Tutup">
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
