import { api } from "@/api";

const NOTES_URL = "/api/v1/notes/";

// Persist hand-dragged note positions. Batched: pass every moved note at once.
export async function saveNotePositions(
  updates: { id: number; x: number; y: number }[]
): Promise<void> {
  if (updates.length === 0) return;
  await api.post(`${NOTES_URL}positions/`, { updates });
}

// Clear every saved position so the graph falls back to its automatic layout.
export async function resetNotePositions(): Promise<void> {
  await api.post(`${NOTES_URL}positions/`, { reset: true });
}
