import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'border-accent bg-accent text-accent-ink font-semibold hover:border-accent-hover hover:bg-accent-hover',
        outline: 'border-line-strong bg-panel text-ink hover:bg-panel-2',
        ghost: 'border-transparent text-muted hover:bg-panel-2 hover:text-ink',
        danger: 'border-bad bg-transparent text-bad hover:bg-bad-wash',
        'danger-solid': 'border-bad bg-bad text-panel font-semibold hover:opacity-90',
      },
      size: {
        md: 'h-9 px-4 text-[13px]',
        sm: 'h-7 px-2.5 text-xs',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
);

type Props = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type, ...props }: Props) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...(asChild ? {} : { type: type ?? 'button' })} {...props} />;
}
