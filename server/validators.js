/**
 * Request validation, in one place.
 *
 * The rules for an email address, a patient number, a patient name, and the
 * shape of a stored evidence picture were each written where they were first
 * needed, so they could drift: the same email regex appeared in two sign-up
 * paths, the evidence-picture pattern in two different guards, and a patient
 * number was checked for emptiness without a shared definition of what a
 * valid one is. A route that needs a rule imports it; a rule that changes
 * changes everywhere.
 *
 * These return a human-readable problem string, or null when the value is
 * fine, so a route can write `const problem = validateEmail(value); if (problem)
 * return res.status(400).json({ error: problem });` in one line.
 */

/** A work email address. Local and domain parts may not be empty, and the
 *  domain must carry a dot, so `a@b` is rejected while `a@b.org` is accepted. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A patient identifier: non-empty once trimmed, and not absurdly long. */
const PATIENT_NUMBER_MAX = 64;

/** A patient name: non-empty once trimmed. */
const NAME_MAX = 160;

/** A stored evidence picture: a data URL of a JPEG, PNG, WebP or GIF. */
const EVIDENCE_DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

/**
 * True when a value is a work email address.
 *
 * The address is trimmed and lowercased by the caller; this only checks shape.
 */
export function validateEmail(value) {
  if (typeof value !== 'string') return 'Please enter your work email address.';
  const trimmed = value.trim();
  if (!trimmed) return 'Please enter your work email address.';
  if (!EMAIL_PATTERN.test(trimmed)) return 'Please enter a valid work email address (for example: jane.doe@hospital.org).';
  return null;
}

/**
 * A patient identifier. Required, and meaningful once trimmed.
 */
export function validatePatientNumber(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Please provide the patient ID / MRN to continue.';
  }
  if (value.trim().length > PATIENT_NUMBER_MAX) {
    return `The patient ID must be at most ${PATIENT_NUMBER_MAX} characters.`;
  }
  return null;
}

/**
 * A patient name. Required, and meaningful once trimmed.
 */
export function validatePatientName(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Please provide the full patient name to continue.';
  }
  if (value.trim().length > NAME_MAX) {
    return `The patient name must be at most ${NAME_MAX} characters.`;
  }
  return null;
}

/**
 * A display name for a new account.
 */
export function validateDisplayName(value) {
  if (typeof value !== 'string') return 'Please enter your full name.';
  const trimmed = value.trim();
  if (trimmed.length < 2) return 'Please enter your full name (between 2 and 120 characters).';
  if (trimmed.length > 120) return 'Please enter your full name (between 2 and 120 characters).';
  return null;
}

/**
 * A crop of a slide stored as evidence.
 *
 * The client crops the box before sending it, so a missing or malformed
 * payload means there is nothing to store rather than something to reject.
 * Returns null when the value is fine, or a problem string.
 */
export function validateEvidenceImage(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !EVIDENCE_DATA_URL_PATTERN.test(value)) {
    return 'The saved picture is not a recognised image format.';
  }
  return null;
}

/** The pattern a stored evidence picture must match, for callers that need
 *  the regex itself rather than the message it produces. */
export const EVIDENCE_IMAGE_PATTERN = EVIDENCE_DATA_URL_PATTERN;