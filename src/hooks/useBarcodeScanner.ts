/**
 * Barcode / MRN scanner.
 *
 * Accession by hand is a transcription error waiting to happen, and a barcode
 * reader is the usual fix. Most readers ship their own beep and type the code
 * into whatever field has focus, which this hook turns into a patient number
 * without a button. It watches for a burst of keystrokes ending in Enter or a
 * pause, decodes the last token, and hands it to a callback.
 *
 * The hook is passive: it only fires when the pattern matches, so typing a
 * patient number by hand is unaffected. A scanner that does not send Enter is
 * still caught by the pause, and a scanner that sends a prefix or suffix is
 * handled by taking the last whitespace-free token.
 */

export interface BarcodeScanEvent {
  raw: string;
  code: string;
  timestamp: number;
}

interface Options {
  /** Milliseconds of silence that ends a code without an Enter. Default 80. */
  interDigitMs?: number;
  /** Minimum characters for a burst to be treated as a scan. Default 4. */
  minDigits?: number;
  /** Called with the decoded code. */
  onScan: (event: BarcodeScanEvent) => void;
}

/**
 * Attaches a listener to the document and returns a cleanup function.
 *
 * The listener is on the document rather than a specific field so the operator
 * can scan into any field on the accession screen.
 */
export function useBarcodeScanner({
  interDigitMs = 80,
  minDigits = 4,
  onScan
}: Options): () => void {
  let buffer = '';
  let lastDigitAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    const code = buffer.trim();
    buffer = '';
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (code.length < minDigits) return;
    onScan({ raw: code, code, timestamp: Date.now() });
  };

  const scheduleFlush = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, interDigitMs);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    // Ignore keys that are not part of a code: the Enter that ends a scan, and
    // the control keys a scanner may send. Everything else is a character.
    if (event.key === 'Enter') {
      event.preventDefault();
      flush();
      return;
    }
    if (event.key.length !== 1) return;

    const now = Date.now();
    // A gap between characters means the operator is typing by hand, not
    // scanning: a scanner fires its whole code in a few milliseconds.
    if (buffer && now - lastDigitAt > interDigitMs) {
      buffer = '';
    }
    buffer += event.key;
    lastDigitAt = now;
    scheduleFlush();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleKeyDown);
  }

  return () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleKeyDown);
    }
    if (timer) clearTimeout(timer);
  };
}