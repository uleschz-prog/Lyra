import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-[#312F2F] text-white hover:bg-[#1E1E24]",
        secondary: "border border-border-bright bg-transparent text-foreground hover:bg-surface-hover",
        outline: "border border-border-bright bg-transparent text-foreground hover:bg-surface-hover",
        ghost: "text-muted hover:bg-surface-hover hover:text-foreground",
        constellation: "bg-[#312F2F] text-white hover:bg-[#1E1E24]",
      },
      size: {
        default: "h-11 px-4 md:h-10",
        sm: "h-10 px-3 text-xs md:h-8",
        lg: "h-12 px-5 sm:px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
