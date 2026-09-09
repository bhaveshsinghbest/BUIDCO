import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  // Task 5 — one consistent interaction contract for every button: hover is
  // handled per-variant below, `active:` gives a tactile press, focus-visible
  // gives a keyboard ring, and disabled is both visually and functionally
  // inert. `active:` was the missing piece — buttons had hover and disabled
  // states but no feedback on the click itself.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:active:translate-y-0',
  {
    variants: {
      variant: {
        default: 'bg-[#1E3A5F] text-white hover:bg-[#152a48]',
        outline: 'border border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F9FAFB]',
        ghost: 'text-[#4B5563] hover:bg-[#F3F4F6]',
        subtle: 'bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE]',
        destructive: 'bg-[#B91C1C] text-white hover:bg-[#991B1B]',
        link: 'text-[#1D4ED8] underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-6 px-2 text-[11px]',
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-10 px-6 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
