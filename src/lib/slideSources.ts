/**
 * How a specimen's scanned images are described to a technologist.
 *
 * A specimen may be uploaded as one photograph or several, and every finding
 * carries which image it came from. The review panel and the report both have to
 * name those images, and a name that is blank or is a raw database id tells the
 * technologist nothing about what they are looking at.
 *
 * Pure functions so the wording is testable without rendering the panel.
 */

/** Image ref used for the specimen's own photograph, when it has no id of its own. */
export const PRIMARY_IMAGE_REF = 'primary';

/**
 * The image refs an analysis read, specimen first then by id.
 *
 * Ordering matters because the fallback names are ordinal — "the second image" —
 * so the same specimen must always number its images the same way across
 * reloads and between the panel and the report.
 */
export function orderImageRefs(refs: string[]): string[] {
  const unique = Array.from(new Set(refs));
  return unique.sort((a, b) => {
    if (a === b) return 0;
    if (a === PRIMARY_IMAGE_REF) return -1;
    if (b === PRIMARY_IMAGE_REF) return 1;
    return a.localeCompare(b);
  });
}

/**
 * A human name for an image ref.
 *
 * Prefers the name the image was uploaded under. Falls back to
 * `Specimen image` for the primary, `Unnamed image` for a blank ref, and a
 * ordinal for anything else — never the raw id, which is an internal string
 * and not information a technologist can act on.
 */
export function imageRefLabel(ref: string, names: Record<string, string> = {}, ordered: string[] = []): string {
  const uploaded = names[ref];
  if (uploaded && uploaded.trim()) return uploaded.trim();
  if (ref === PRIMARY_IMAGE_REF) return 'Specimen image';
  if (!ref) return 'Unnamed image';

  const position = ordered.indexOf(ref) + 1;
  return position > 0 ? `Source image ${position}` : ref;
}

/**
 * The heading over the quantification table.
 *
 * The table states counts per examined field, so the heading has to say both how
 * many photographs were scanned and how many fields that is spread over. A
 * specimen uploaded as four images and read across ten fields is a different
 * statement from one image over ten fields, and the old heading showed only the
 * second half.
 */
export function quantificationHeading(imageCount: number, fieldsExamined: number): string {
  if (imageCount <= 0) return `${fieldsExamined} Examined Field${fieldsExamined === 1 ? '' : 's'}`;
  return `${imageCount} Image${imageCount === 1 ? '' : 's'} Scanned · ${fieldsExamined} Examined Field${fieldsExamined === 1 ? '' : 's'}`;
}

/**
 * The heading over the targets list.
 *
 * A filtered view shows "visible of total" so the number cannot be mistaken for
 * how many targets the specimen holds; an unfiltered one shows the count alone.
 */
export function targetsHeading(visible: number, total: number, isFiltered: boolean): string {
  if (!isFiltered) return `${visible}`;
  return `${visible} of ${total}`;
}

/** The label for the "all images" option of the source filter. */
export function allSourcesOptionLabel(
  imageCount: number,
  total: number,
  primaryRef: string | undefined,
  names: Record<string, string>,
  ordered: string[]
): string {
  if (imageCount > 1) return `All images (${total})`;
  const label = primaryRef ? imageRefLabel(primaryRef, names, ordered) : 'All images';
  return `${label} (${total})`;
}
