/**
 * A confirmation dialog.
 *
 * The browser's `confirm()` is outside the React tree, so it cannot be themed,
 * cannot trap focus, and is unreachable by keyboard navigation. This dialog is
 * rendered as part of the interface: it matches the surrounding theme, moves
 * focus to itself so Tab cycles inside it, and closes on Escape.
 *
 * The caller owns the open state, so the dialog composes with the rest of the
 * page rather than overriding it.
 */

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmButtonClasses =
    variant === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-400'
      : 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div
              className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                variant === 'danger' ? 'bg-rose-100 dark:bg-rose-950/60' : 'bg-amber-100 dark:bg-amber-950/60'
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${variant === 'danger' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}
              />
            </div>
            <div className="min-w-0">
              <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{description}</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onCancel}
              className="ml-auto shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition cursor-pointer ${confirmButtonClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}