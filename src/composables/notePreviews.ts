// Client-side thumbnail cache for note canvases.
//
// The backend has no preview field, so we snapshot the Konva layer to a small
// PNG on save and stash it in localStorage keyed by note id. The graph view
// reads these back to show a thumbnail on each node. Transparent PNGs let the
// node's own background show through empty canvas areas, which keeps the look
// clean without baking in a colour.

const key = (id: number) => `note-preview:${id}`;

export function getNotePreview(id: number): string | null {
  try {
    return localStorage.getItem(key(id));
  } catch {
    return null;
  }
}

export function setNotePreview(id: number, dataUrl: string): void {
  try {
    localStorage.setItem(key(id), dataUrl);
  } catch {
    // Quota exceeded or storage unavailable — a missing preview is harmless.
  }
}

export function removeNotePreview(id: number): void {
  try {
    localStorage.removeItem(key(id));
  } catch {
    // ignore
  }
}
