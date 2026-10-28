/**
 * Converts unexpected runtime, network, and database errors into safe copy for
 * operators. Deliberate API validation messages are preserved so the user can
 * still correct an input without seeing implementation details.
 */
export function userFriendlyError(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';

  if (!message || looksTechnical(message)) return fallback;
  return message.length > 260 ? fallback : message;
}

function looksTechnical(message: string): boolean {
  return /(?:ReferenceError|TypeError|SyntaxError|RangeError|Cannot access|is not defined|undefined is not|\bnull\b|stack trace| at [^ ]+\(|failed to fetch|network request failed|JSON parse|SQLSTATE|PGRST|postgres|supabase|column .* does not exist|ECONN|ERR_[A-Z_]+|\b5\d\d\b)/i.test(message);
}
