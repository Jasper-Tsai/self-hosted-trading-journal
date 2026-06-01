import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6AD2]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506] disabled:pointer-events-none disabled:opacity-50';

    const variantClasses = {
      default: 'bg-[#5E6AD2] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)] hover:bg-[#6872D9] hover:shadow-[0_0_0_1px_rgba(94,106,210,0.6),0_8px_20px_rgba(94,106,210,0.35),inset_0_1px_0_0_rgba(255,255,255,0.2)] active:scale-[0.98]',
      destructive: 'bg-red-500/80 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] hover:bg-red-500 hover:shadow-[0_0_0_1px_rgba(239,68,68,0.5),0_4px_12px_rgba(239,68,68,0.3),inset_0_1px_0_0_rgba(255,255,255,0.1)] active:scale-[0.98]',
      outline: 'border border-white/[0.06] bg-white/[0.03] text-[#EDEDEF] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-white/[0.06] hover:border-white/[0.10] active:scale-[0.98]',
      secondary: 'bg-white/[0.05] text-[#EDEDEF] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-white/[0.08] active:scale-[0.98]',
      ghost: 'text-[#8A8F98] hover:bg-white/[0.05] hover:text-[#EDEDEF] active:scale-[0.98]',
      link: 'text-[#5E6AD2] underline-offset-4 hover:underline hover:text-[#6872D9]',
    };

    const sizeClasses = {
      default: 'h-10 px-4 py-2',
      sm: 'h-8 rounded-lg px-3 text-xs',
      lg: 'h-11 rounded-lg px-8',
      icon: 'h-10 w-10',
    };

    return (
      <button
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };