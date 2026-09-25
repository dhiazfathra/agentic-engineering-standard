/** `<origin>/r/<id>`, the shape the viewer and the library both copy. */
export function rewindLink(id: string): string {
  return `${location.origin}/r/${id}`;
}

/** Copies a Rewind's link to the clipboard. Throws on failure. */
export async function copyRewindLink(id: string): Promise<void> {
  await navigator.clipboard.writeText(rewindLink(id));
}
