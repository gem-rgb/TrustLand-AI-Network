'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a1f44] text-white flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <h1 className="text-2xl font-bold mb-3">Application Error</h1>
          <p className="text-sm text-white/70 mb-4">
            Something went wrong while loading TrustLand.
          </p>
          <p className="text-xs text-white/40 mb-5 break-all">{error.message}</p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
