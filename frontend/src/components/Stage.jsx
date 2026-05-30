// Shared shell for every pipeline stage: number badge, title, lock/grey-out,
// and a spinner overlay while the stage is running.
export default function Stage({ index, title, locked, loading, done, children }) {
  return (
    <section
      className={`relative rounded-xl border p-6 transition-all duration-300 ${
        locked
          ? "border-white/5 bg-white/[0.02] opacity-40 pointer-events-none"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <header className="mb-4 flex items-center gap-3">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${
            done ? "bg-emerald-500/20 text-emerald-300" : "bg-indigo-500/20 text-indigo-300"
          }`}
        >
          {done ? "✓" : index}
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-300">{title}</h2>
      </header>

      {children}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        </div>
      )}
    </section>
  );
}
