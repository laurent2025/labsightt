import React from 'react';
import { SearchX, Inbox, AlertCircle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

/**
 * Shimmering placeholder used while a list loads.
 *
 * A skeleton that matches the shape of the content it replaces is markedly less
 * jarring than a spinner, because the layout does not jump when data arrives.
 */
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800 ${className}`}>
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent motion-reduce:animate-none" />
  </div>
);

/** Placeholder rows shaped like the patient/reports tables. */
export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 4
}) => (
  <div className="space-y-2 p-4" role="status" aria-busy="true" aria-label="Loading records">
    <span className="sr-only">Loading records...</span>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-3">
        {Array.from({ length: columns }).map((__, c) => (
          <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-1/4' : c === 1 ? 'w-1/3' : 'flex-1'}`} />
        ))}
      </div>
    ))}
  </div>
);

export const CardSkeleton: React.FC<{ className?: string }> = ({ className = 'h-28' }) => (
  <div role="status" aria-busy="true" aria-label="Loading">
    <span className="sr-only">Loading...</span>
    <Skeleton className={className} />
  </div>
);

/**
 * Empty state. Distinguishes "nothing exists yet" from "your filter matched
 * nothing", because those need different actions from the operator.
 */
export const EmptyState: React.FC<{
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  tone?: 'neutral' | 'error';
}> = ({ title, description, icon, action, tone = 'neutral' }) => (
  <div
    className={`flex flex-col items-center justify-center text-center px-6 py-12 ${
      tone === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'
    }`}
  >
    <div
      className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${
        tone === 'error'
          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
      }`}
    >
      {icon ?? (tone === 'error' ? <AlertCircle className="w-5 h-5" /> : <Inbox className="w-5 h-5" />)}
    </div>
    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</p>
    <p className="text-xs mt-1 max-w-sm leading-relaxed">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/** Nothing matched the current search term. */
export const NoResultsState: React.FC<{ term: string; onClear?: () => void }> = ({
  term,
  onClear
}) => (
  <EmptyState
    icon={<SearchX className="w-5 h-5" />}
    title="No matching records"
    description={
      <>
        Nothing matches <span className="font-mono text-slate-700 dark:text-slate-300">"{term}"</span>.
        Patient names are stored encrypted, so name search matches a full name exactly. Search by
        patient number for a partial match.
      </>
    }
    action={
      onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Clear search
        </button>
      )
    }
  />
);

/** Server-backed pagination control. */
export const Pagination: React.FC<{
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  label?: string;
}> = ({ total, limit, offset, onChange, label = 'records' }) => {
  if (total <= limit) return null;

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  const first = offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <nav
      className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs"
      aria-label="Pagination"
    >
      <span className="text-slate-500 dark:text-slate-400 font-mono">
        {first}–{last} of {total} {label}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-slate-100 dark:hover:not-disabled:bg-slate-800"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 font-mono text-slate-600 dark:text-slate-300">
          {page} / {pages}
        </span>
        <button
          type="button"
          onClick={() => onChange(offset + limit)}
          disabled={offset + limit >= total}
          className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:not-disabled:bg-slate-100 dark:hover:not-disabled:bg-slate-800"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};

/** Full-panel error with a retry affordance. */
export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({
  message,
  onRetry
}) => (
  <EmptyState
    tone="error"
    title="Could not load this data"
    description={message}
    action={
      onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )
    }
  />
);
