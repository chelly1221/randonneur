import { CATEGORIES } from "@/types";

const SERIES_ICON_SRC: Record<string, string> = {
  "sr-600": "/sr-600.webp?v=9",
  adventure: "/adventure.webp?v=1",
  baekdudaegan: "/baekdudaegan.webp?v=1",
  "dongbu-60-pass": "/dongbu-60-pass.webp?v=1",
  "river-to-sea": "/river-to-sea.webp?v=1",
  seagull: "/seagull.webp?v=3",
  strawberry: "/strawberry.webp?v=2",
};

interface SeriesIconProps {
  value: string;
  emoji?: string;
  className?: string;
}

export function SeriesIcon({ value, emoji, className = "h-4 w-4" }: SeriesIconProps) {
  const src = SERIES_ICON_SRC[value];
  if (src) {
    return <img src={src} alt="" className={`inline-block object-contain ${className}`} />;
  }

  const fallback = emoji ?? CATEGORIES.find((c) => c.value === value)?.emoji ?? "•";
  return <span className="inline-block leading-none">{fallback}</span>;
}
