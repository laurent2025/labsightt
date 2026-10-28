/**
 * Keyboard shortcuts for the adjudication workspace.
 *
 * Confirm and reject are the most common actions in a review, and reaching for
 * the mouse each time breaks the rhythm of working through a queue. A handful
 * of keys cover the whole pass:
 *
 *   1 / Enter  confirm the selected detection
 *   2         reject it
 *   J / K     move the selection to the previous / next detection
 *   C         confirm every detection at once
 *   R         release the confirmation of the selected detection
 *   Escape    close an open modal
 *
 * The listener is attached to the document so it survives focus moving between
 * the queue and the confirm button, and it ignores keys typed into a text
 * field so a note being typed is not turned into a confirmation.
 */

import { useEffect } from 'react';

export type ShortcutAction =
  | 'confirm'
  | 'reject'
  | 'next'
  | 'previous'
  | 'confirmAll'
  | 'release'
  | 'close'
  | 'startLabel';

const SHORTCUTS: Record<ShortcutAction, string[]> = {
  confirm: ['1', 'Enter'],
  reject: ['2'],
  next: ['j', 'ArrowDown'],
  previous: ['k', 'ArrowUp'],
  confirmAll: ['c'],
  release: ['r'],
  close: ['Escape'],
  startLabel: ['l']
};

/** The keys a press must match, case-insensitively. */
function normalizeKey(event: KeyboardEvent): string {
  if (event.key === ' ') return 'Space';
  return event.key.toLowerCase();
}

/** True when the event came from a field the user is typing into. */
function isTypingField(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = (target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return target.isContentEditable === true;
}

/**
 * Registers the shortcuts for the lifetime of the component.
 *
 * `onAction` is called with the name of the action the pressed key maps to.
 * Unknown keys are ignored, so this never steals input from other controls.
 */
export function useKeyboardShortcuts(onAction: (action: ShortcutAction) => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingField(event)) return;

      const key = normalizeKey(event);
      for (const [action, keys] of Object.entries(SHORTCUTS) as [ShortcutAction, string[]][]) {
        if (keys.includes(key)) {
          event.preventDefault();
          event.stopPropagation();
          onAction(action);
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onAction]);
}