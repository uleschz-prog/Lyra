import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em]",
  {
    variants: {
      variant: {
        default: "border-border bg-[#F4F1EC] text-[#5C5854]",
        violet: "border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#6D28D9]",
        cyan: "border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#6D28D9]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
