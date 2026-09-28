export function Placeholder({ page }: { page: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-card sm:p-8">
        <h1 className="font-heading text-xl font-bold text-accent">{page}</h1>
        <p className="mt-3 text-sm text-muted">
          Scaffolding de la nueva arquitectura (Vite + React + TypeScript + Tailwind).
          Todavía sin UI real.
        </p>
      </div>
    </div>
  );
}
