"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Navigation, X } from "lucide-react";

interface GeolocationTrackerProps {
  onLocationUpdate: (lngLat: [number, number] | null) => void;
  distanceAlongKm?: number | null;
}

export function GeolocationTracker({
  onLocationUpdate,
  distanceAlongKm,
}: GeolocationTrackerProps) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError("위치 서비스를 사용할 수 없습니다");
      return;
    }

    setActive(true);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        onLocationUpdate([pos.coords.longitude, pos.coords.latitude]);
      },
      (err) => {
        if (err.code === 1) setError("위치 권한이 거부되었습니다");
        else setError("위치를 가져올 수 없습니다");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }, [onLocationUpdate]);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setActive(false);
    onLocationUpdate(null);
  }, [onLocationUpdate]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div className="absolute bottom-3 left-3 z-10">
      {!active ? (
        <button
          onClick={start}
          title="내 위치"
          className="flex h-[29px] w-[29px] items-center justify-center rounded bg-white shadow-[0_0_0_2px_rgba(0,0,0,0.1)] hover:bg-gray-100"
        >
          <Navigation className="h-4 w-4 text-gray-700" />
        </button>
      ) : (
        <div className="flex items-center gap-1.5 rounded bg-white px-2 py-1 shadow-[0_0_0_2px_rgba(0,0,0,0.1)]">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs text-gray-700">
            {distanceAlongKm != null ? `${distanceAlongKm.toFixed(1)} km` : "GPS"}
          </span>
          <button onClick={stop} className="ml-0.5 text-gray-400 hover:text-gray-700">
            <X className="h-3.5 w-3.5" />
          </button>
          {error && (
            <span className="text-[10px] text-red-500 ml-1">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}
