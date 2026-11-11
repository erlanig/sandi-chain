'use client';

import { Select as S } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Select = S.Root;
export const SelectValue = S.Value;

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof S.Trigger>) {
  return (
    <S.Trigger
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-bg px-3 text-left text-sm text-ink data-[placeholder]:text-faint focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <S.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </S.Icon>
    </S.Trigger>
  );
}

export function SelectContent({ className, children, ...props }: React.ComponentProps<typeof S.Content>) {
  return (
    <S.Portal>
      <S.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) min-w-48 overflow-hidden rounded-lg border border-line-strong bg-panel text-ink shadow-lg shadow-black/20',
          className,
        )}
        {...props}
      >
        <S.Viewport className="p-1">{children}</S.Viewport>
      </S.Content>
    </S.Portal>
  );
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof S.Item>) {
  return (
    <S.Item
      className={cn(
        'relative flex cursor-pointer items-center rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-[highlighted]:bg-panel-2',
        className,
      )}
      {...props}
    >
      <S.ItemText>{children}</S.ItemText>
      <S.ItemIndicator className="absolute right-2">
        <Check className="size-4 text-accent" />
      </S.ItemIndicator>
    </S.Item>
  );
}
