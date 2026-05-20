"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-50 p-6 text-center dark:bg-black">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Something went wrong.
        </h2>
        {error?.message ? (
          <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">{error.message}</p>
        ) : null}
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="h-10 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-100"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
