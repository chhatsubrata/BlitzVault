type AuthStatusBannerProps = {
  title: string;
  description?: string;
  hint?: string;
};

export function AuthStatusBanner({ title, description, hint }: AuthStatusBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-medium border border-indigo-200 bg-indigo-50/80 px-6 py-10 text-center dark:border-indigo-900/50 dark:bg-indigo-950/30"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600 dark:border-indigo-700 dark:border-t-indigo-400"
        aria-hidden
      />
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
        {description ? (
          <p className="text-sm text-default-500">{description}</p>
        ) : null}
        {hint ? <p className="text-xs text-default-400">{hint}</p> : null}
      </div>
    </div>
  );
}
