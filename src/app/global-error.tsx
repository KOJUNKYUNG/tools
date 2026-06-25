"use client";

import { useEffect } from "react";

/**
 * Catastrophic boundary — catches errors thrown by the root layout itself.
 * It REPLACES the root layout, so globals.css/fonts are not loaded; everything
 * here is self-contained with inline styles on the monochrome palette. Korean
 * default (locale context is unavailable this far up).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "0 24px",
          textAlign: "center",
          background: "#d9d9da",
          color: "#242324",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>문제가 발생했어요</h1>
        <p style={{ fontSize: 13, color: "#4a494a", margin: 0, maxWidth: "42ch", lineHeight: 1.6 }}>
          예기치 못한 오류가 발생했습니다. 페이지를 새로고침해 주세요.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            height: 36,
            padding: "0 16px",
            borderRadius: 9,
            border: "1px solid #000",
            background: "#000",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
