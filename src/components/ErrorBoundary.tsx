import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Changing this resets the boundary, e.g. on tab change. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors so a single broken slide view cannot blank the whole
 * workstation. A clinical UI that goes white mid-review is worse than one that
 * reports the failure and keeps the surrounding data reachable.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('LenziAI render failure:', error, info.componentStack);
  }

  private handleReset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-xl p-8 text-center">
        <h2 className="text-sm font-bold text-rose-900 dark:text-rose-200">
          This view failed to render
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 max-w-lg mx-auto leading-relaxed">
          The error below is a rendering fault, not a diagnostic result. No patient data has been
          altered. Switch tabs to continue, or retry this view.
        </p>
        <pre className="mt-4 text-[11px] text-left font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 overflow-x-auto max-h-40">
          {error.name}: {error.message}
        </pre>
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
        >
          Retry this view
        </button>
      </div>
    );
  }
}
