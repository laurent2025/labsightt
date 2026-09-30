/** @vitest-environment jsdom */

import React, { useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { useFocusTrap } from './useFocusTrap';

function TrapHarness() {
  const [count, setCount] = useState(0);
  const panelRef = useFocusTrap<HTMLDivElement>(true, () => {});

  return (
    <div ref={panelRef}>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        trigger rerender {count}
      </button>
      <input aria-label="email" defaultValue="" />
    </div>
  );
}

describe('useFocusTrap', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('does not reattach document listeners on rerender', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    act(() => {
      root.render(<TrapHarness />);
    });

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).not.toHaveBeenCalled();

    const trigger = container.querySelector('button');
    expect(trigger).not.toBeNull();

    act(() => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
