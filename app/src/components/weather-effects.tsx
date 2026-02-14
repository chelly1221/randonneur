"use client";

import { useMemo } from "react";
import { useTheme } from "@/components/theme-provider";

// Deterministic pseudo-random for consistent SSR/client rendering
function seeded(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function WeatherEffects() {
  const { theme } = useTheme();

  const particles = useMemo(() => {
    const count = theme === "snowy" ? 45 : theme === "rainy" ? 60 : 25;
    return Array.from({ length: count }, (_, i) => ({
      x: seeded(i * 7 + 1) * 100,
      y: seeded(i * 7 + 2) * 100,
      delay: seeded(i * 7 + 3) * 10,
      duration: 4 + seeded(i * 7 + 4) * 8,
      size: 2 + seeded(i * 7 + 5) * 3,
      opacity: 0.3 + seeded(i * 7 + 6) * 0.7,
    }));
  }, [theme]);

  if (theme !== "snowy" && theme !== "rainy" && theme !== "windy") return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {particles.map((p, i) => {
        const isWind = theme === "windy";
        const isRain = theme === "rainy";

        return (
          <span
            key={i}
            className={
              theme === "snowy"
                ? "weather-particle-snow"
                : isRain
                  ? "weather-particle-rain"
                  : "weather-particle-wind"
            }
            style={{
              [isWind ? "top" : "left"]: `${p.x}%`,
              animationDelay: `${-p.delay}s`,
              animationDuration: `${isRain ? p.duration * 0.5 : p.duration}s`,
              width: isRain ? "1px" : isWind ? `${30 + p.size * 15}px` : `${p.size}px`,
              height: isRain ? `${12 + p.size * 4}px` : `${p.size}px`,
              opacity: p.opacity,
            }}
          />
        );
      })}
    </div>
  );
}
