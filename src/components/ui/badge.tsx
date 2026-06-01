import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/50 focus:ring-offset-2 focus:ring-offset-[#050506]",
  {
    variants: {
      variant: {
        default:
          "border-[rgba(94,106,210,0.30)] bg-[rgba(94,106,210,0.10)] text-[#c7d2fe] hover:bg-[rgba(94,106,210,0.15)]",
        secondary:
          "border-white/[0.06] bg-white/[0.05] text-[#EDEDEF] hover:bg-white/[0.08]",
        destructive:
          "border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15",
        outline: "border-white/[0.10] text-[#8A8F98] hover:bg-white/[0.05]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }