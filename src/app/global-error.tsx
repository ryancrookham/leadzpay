"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body
        style={{
          padding: 40,
          fontFamily: "monospace",
          background: "#212121",
          color: "#fff",
        }}
      >
        <h2>Something went wrong</h2>
        <pre style={{ color: "#E8822A", whiteSpace: "pre-wrap" }}>
          {error.message}
        </pre>
        <pre style={{ color: "#888", fontSize: 12, whiteSpace: "pre-wrap" }}>
          {error.stack}
        </pre>
        {error.digest && (
          <p style={{ color: "#666", fontSize: 12 }}>Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: 20,
            padding: "8px 16px",
            cursor: "pointer",
            background: "#E8822A",
            border: "none",
            borderRadius: 6,
            color: "#000",
            fontWeight: "bold",
          }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
