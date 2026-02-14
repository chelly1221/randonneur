"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { THEMES, type ThemeId } from "@/lib/theme";

const themeIcons: Record<ThemeId | "auto", string> = {
  auto: "A",
  dawn: "\u{1F305}",   // sunrise
  day: "\u{2600}",     // sun
  sunset: "\u{1F307}", // sunset
  night: "\u{1F319}",  // crescent moon
  snowy: "\u{2744}",   // snowflake
  rainy: "\u{1F327}",  // rain
  windy: "\u{1F4A8}",  // wind
};

export function ThemeSelector() {
  const { mode, setMode, theme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const currentIcon = mode === "auto" ? themeIcons[theme] : themeIcons[mode];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-sm hover:bg-white/10 transition-colors"
        title="하늘 테마"
      >
        <span className="text-base leading-none">{currentIcon}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-36 rounded-md border border-t-border bg-t-surface py-1 shadow-lg">
          {/* Auto option */}
          <button
            onClick={() => { setMode("auto"); setOpen(false); }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
              mode === "auto" ? "bg-t-hover text-t-accent font-medium" : "text-t-text hover:bg-t-hover"
            }`}
          >
            <span className="w-5 text-center text-xs font-bold">A</span>
            <span>자동</span>
          </button>

          <div className="my-1 border-t border-t-divider" />

          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setMode(t.id); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                mode === t.id ? "bg-t-hover text-t-accent font-medium" : "text-t-text hover:bg-t-hover"
              }`}
            >
              <span className="w-5 text-center">{themeIcons[t.id]}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
