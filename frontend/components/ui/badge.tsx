import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-lg hover:shadow-xl hover:scale-105 dark:from-indigo-500 dark:to-emerald-500",
        secondary:
          "border-transparent bg-gradient-to-r from-zinc-100 to-zinc-200 text-zinc-900 hover:from-zinc-200 hover:to-zinc-300 dark:from-zinc-800 dark:to-zinc-700 dark:text-zinc-50 dark:hover:from-zinc-700 dark:hover:to-zinc-600",
        destructive:
          "border-transparent bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg hover:shadow-xl hover:scale-105 dark:from-red-600 dark:to-red-700",
        outline: "text-zinc-950 dark:text-zinc-50 border-indigo-500/50 hover:bg-indigo-500/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

