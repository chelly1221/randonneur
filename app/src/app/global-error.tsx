"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body>
        <div style={{ display: "flex", minHeight: "60vh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", textAlign: "center" }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1.5rem", fontWeight: "bold" }}>
            문제가 발생했습니다
          </h2>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1.5rem", borderRadius: "0.5rem", background: "#1a237e", color: "white", border: "none", cursor: "pointer" }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
