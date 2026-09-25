"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import { cn } from "@/lib/utils";

export function PasswordField({
  name,
  autoComplete,
  required,
  minLength,
  defaultValue,
  value,
  onChange,
  placeholder,
  tone = "dark",
  className,
}: {
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  defaultValue?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  tone?: "dark" | "light";
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative mt-2 block">
      <input
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(className, "pr-11")}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className={cn(
          "absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1",
          tone === "light" ? "text-[#8A8680] hover:text-[#1E1E24]" : "text-zinc-400 hover:text-white",
        )}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </span>
  );
}
