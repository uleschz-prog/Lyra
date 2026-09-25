"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";

import { cn } from "@/lib/utils";

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-[calc(100vw-1.5rem)] min-w-64 rounded-2xl border border-[#E7E2DA] bg-white p-2 text-[#1E1E24] shadow-[0_12px_40px_rgba(30,30,36,0.08)]",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center rounded-xl px-3 py-2 text-sm outline-none select-none focus:bg-[#F4F1EC] data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger };
