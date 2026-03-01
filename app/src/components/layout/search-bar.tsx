"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";

interface SearchResult {
  courses: {
    id: string;
    name: string;
    distanceKm: number;
    region: string | null;
  }[];
  reviews: {
    id: string;
    content: string;
    courseId: string;
    courseName: string;
    userName: string;
  }[];
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        if (!query) setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [query]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.trim().length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const hasResults = results && (results.courses.length > 0 || results.reviews.length > 0);

  function handleToggle() {
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleClose() {
    setQuery("");
    setOpen(false);
    setExpanded(false);
  }

  return (
    <div ref={ref} className="relative">
      {expanded ? (
        <div className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1">
          <Search className="h-3.5 w-3.5 text-white/50" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색..."
            className="w-32 bg-transparent text-xs text-white placeholder-white/40 outline-none"
          />
          <button onClick={handleClose}>
            <X className="h-3 w-3 text-white/50 hover:text-white" />
          </button>
        </div>
      ) : (
        <button
          onClick={handleToggle}
          className="rounded-md p-2 text-white/70 hover:text-white transition-colors"
        >
          <Search className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-t-border bg-t-surface shadow-xl">
          {loading ? (
            <div className="p-3 text-center text-xs text-t-muted">검색 중...</div>
          ) : !hasResults ? (
            <div className="p-3 text-center text-xs text-t-muted">결과가 없습니다.</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {results!.courses.length > 0 && (
                <div>
                  <p className="px-3 pt-2 text-[10px] font-medium text-t-muted uppercase">코스</p>
                  {results!.courses.map((c) => (
                    <Link
                      key={c.id}
                      href={`/courses/${c.id}`}
                      onClick={() => { setOpen(false); setQuery(""); }}
                      className="block px-3 py-2 text-sm hover:bg-t-hover"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-xs text-t-muted">
                        {c.distanceKm}km {c.region && `· ${c.region}`}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {results!.reviews.length > 0 && (
                <div className="border-t border-t-border">
                  <p className="px-3 pt-2 text-[10px] font-medium text-t-muted uppercase">후기</p>
                  {results!.reviews.map((r) => (
                    <Link
                      key={r.id}
                      href={`/courses/${r.courseId}`}
                      onClick={() => { setOpen(false); setQuery(""); }}
                      className="block px-3 py-2 text-sm hover:bg-t-hover"
                    >
                      <span className="text-xs text-t-muted">{r.courseName}</span>
                      <p className="text-xs truncate">{r.content.replace(/<[^>]+>/g, "").slice(0, 80)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
