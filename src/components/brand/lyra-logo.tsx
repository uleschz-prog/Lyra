import { Logo } from "@/components/brand/logo";

export function LyraLogo({
  className = "",
  showText = true,
  ink = false,
}: {
  className?: string;
  size?: number;
  showText?: boolean;
  ink?: boolean;
}) {
  return <Logo className={className} compact={!showText} ink={ink} />;
}
