
import { useCallback, useEffect, useRef, useState } from "react";
import type { Shape } from "@/composables/editor";
import { api } from "@/api";

// A user-scoped label attached to notes.
export interface Tag {
  id: number;
  name: string;
}

// Note metadata as returned by the list endpoint (no heavy content blob).
export interface NoteMeta {
  id: number;
  title: string;
  tags: Tag[];
  parents: number[];
  // Cosmetic appearance: icon is a key resolved via noteAppearance; color is a
  // hex accent (both empty by default).
  icon: string;
  color: string;
  // Hand-placed position on the graph canvas; null means "use auto-layout".
  graph_x: number | null;
  graph_y: number | null;
  updated_at: string;
  created_at: string;
}

// A fully-loaded note, including its canvas shapes.
export interface Note extends NoteMeta {
  content: Shape[];
}

// A point-in-time snapshot from the note's server-side history.
export interface NoteVersion {
  id: number;
  title: string;
  content: Shape[];
  created_at: string;
}

const NOTES_URL = "/api/v1/notes/";
const TAGS_URL = "/api/v1/tags/";

// The list endpoint is paginated; pull a generous page so the sidebar shows
// everything without juggling pages.
function listResults<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

// Backend-backed collection of notes. Each note owns its own canvas (an array of
// shapes); the active note is loaded in full and the editor saves back to it.
export const useNotes = () => {
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load the note list, then ensure there is always something to edit.
  const refreshList = useCallback(async (): Promise<NoteMeta[]> => {
    const res = await api.get(NOTES_URL, { params: { page_size: 100 } });
    const list = listResults<NoteMeta>(res.data);
    setNotes(list);
    return list;
  }, []);

  // The set of tags known across all of the user's notes, for autocomplete.
  const refreshTags = useCallback(async (): Promise<Tag[]> => {
    const res = await api.get(TAGS_URL, { params: { page_size: 200 } });
    const list = listResults<Tag>(res.data);
    setAllTags(list);
    return list;
  }, []);

  // Run exactly once. The didInit guard (rather than an abort flag) is what
  // makes this StrictMode-safe: aborting on cleanup while also blocking the
  // re-run would leave the single surviving run cancelled — stuck loading.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    (async () => {
      try {
        void refreshTags();
        const list = await refreshList();
        if (list.length > 0) {
          // Default to the first note, but never clobber a note the caller has
          // already selected (e.g. a ?note=<id> deep-link applied before this
          // async list fetch resolved) — that would open the wrong note.
          setActiveId((cur) => cur ?? list[0].id);
        } else {
          const res = await api.post(NOTES_URL, { title: "Untitled note", content: [] });
          setNotes([res.data]);
          setActiveId(res.data.id);
        }
      } catch {
        // Leave the workspace empty on failure; the UI shows an empty state.
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshList, refreshTags]);

  // Whenever the active note changes, fetch its full content.
  useEffect(() => {
    if (activeId == null) {
      setActiveNote(null);
      return;
    }
    let cancelled = false;
    setActiveNote(null);
    (async () => {
      try {
        const res = await api.get(`${NOTES_URL}${activeId}/`);
        if (!cancelled) setActiveNote(res.data);
      } catch {
        if (!cancelled) setActiveNote(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  const createNote = useCallback(async () => {
    const res = await api.post(NOTES_URL, { title: "Untitled note", content: [] });
    setNotes((prev) => [res.data, ...prev]);
    setActiveId(res.data.id);
    return res.data.id as number;
  }, []);

  const deleteNote = useCallback(async (id: number) => {
    await api.delete(`${NOTES_URL}${id}/`);
    const remaining = notes.filter((n) => n.id !== id);
    if (remaining.length === 0) {
      // Workspace must never be empty — seed a fresh note.
      const res = await api.post(NOTES_URL, { title: "Untitled note", content: [] });
      setNotes([res.data]);
      setActiveId(res.data.id);
      return;
    }
    setNotes(remaining);
    setActiveId((current) => (current === id ? remaining[0].id : current));
  }, [notes]);

  const renameNote = useCallback(async (id: number, title: string) => {
    const clean = title.trim() || "Untitled note";
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: clean } : n)));
    setActiveNote((prev) => (prev && prev.id === id ? { ...prev, title: clean } : prev));
    await api.patch(`${NOTES_URL}${id}/`, { title: clean });
  }, []);

  // Replace a note's tag set. Tags are addressed by name; the backend creates
  // any that don't yet exist, so we refresh the known-tag list afterwards.
  const updateTags = useCallback(async (id: number, tagNames: string[]) => {
    // Optimistically reflect the new tag set so chips appear instantly. Reuse
    // known tag objects (for their real ids) and synthesize placeholders for
    // brand-new names; the server response reconciles canonical ids below.
    const known = new Map<string, Tag>();
    allTags.forEach((t) => known.set(t.name, t));
    activeNote?.tags?.forEach((t) => known.set(t.name, t));
    const optimistic: Tag[] = tagNames.map(
      (name, i) => known.get(name) ?? { id: -(i + 1), name }
    );

    const prevNotesTags = notes.find((n) => n.id === id)?.tags ?? [];
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, tags: optimistic } : n)));
    setActiveNote((prev) => (prev && prev.id === id ? { ...prev, tags: optimistic } : prev));

    try {
      const res = await api.patch(`${NOTES_URL}${id}/`, { tag_names: tagNames });
      // Only overwrite from the response when it actually carries the tag list;
      // some endpoints omit it on PATCH, and clobbering with [] would wipe the
      // chips we just added.
      const tags: unknown = res.data?.tags;
      if (Array.isArray(tags)) {
        setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, tags } : n)));
        setActiveNote((prev) => (prev && prev.id === id ? { ...prev, tags } : prev));
      }
      void refreshTags();
    } catch (err) {
      // Roll back the optimistic change so the UI matches the server.
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, tags: prevNotesTags } : n)));
      setActiveNote((prev) => (prev && prev.id === id ? { ...prev, tags: prevNotesTags } : prev));
      throw err;
    }
  }, [refreshTags, allTags, activeNote, notes]);

  // Update a note's cosmetic appearance (icon and/or accent color). Applied
  // optimistically so the sidebar/graph update instantly, then reconciled.
  const updateAppearance = useCallback(
    async (id: number, appearance: { icon?: string; color?: string }) => {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...appearance } : n)));
      setActiveNote((prev) => (prev && prev.id === id ? { ...prev, ...appearance } : prev));
      await api.patch(`${NOTES_URL}${id}/`, appearance);
    },
    []
  );

  // Replace a note's parent set (a note may have several parents).
  const updateParents = useCallback(async (id: number, parents: number[]) => {
    const res = await api.patch(`${NOTES_URL}${id}/`, { parents });
    const next: number[] = res.data.parents ?? parents;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, parents: next } : n)));
    setActiveNote((prev) => (prev && prev.id === id ? { ...prev, parents: next } : prev));
  }, []);

  // Debounced autosave of the canvas. Each persisted save creates a server-side
  // history version (the backend de-dupes identical consecutive snapshots).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ id: number; shapes: Shape[] } | null>(null);
  const lastSaved = useRef<Record<number, Shape[]>>({});

  const flushSave = useCallback(async () => {
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    if (lastSaved.current[job.id] === job.shapes) return;
    lastSaved.current[job.id] = job.shapes;
    setSaving(true);
    try {
      await api.patch(`${NOTES_URL}${job.id}/`, { content: job.shapes });
      const now = new Date().toISOString();
      setNotes((prev) => prev.map((n) => (n.id === job.id ? { ...n, updated_at: now } : n)));
    } finally {
      setSaving(false);
    }
  }, []);

  const saveShapes = useCallback((id: number, shapes: Shape[]) => {
    if (lastSaved.current[id] === shapes) return;
    pending.current = { id, shapes };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushSave(); }, 800);
  }, [flushSave]);

  // Flush any pending save when leaving the page.
  useEffect(() => {
    const onUnload = () => { void flushSave(); };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [flushSave]);

  const fetchVersions = useCallback(async (id: number): Promise<NoteVersion[]> => {
    const res = await api.get(`${NOTES_URL}${id}/versions/`);
    return listResults<NoteVersion>(res.data);
  }, []);

  const restoreVersion = useCallback(async (id: number, versionId: number): Promise<Note> => {
    const res = await api.post(`${NOTES_URL}${id}/restore/`, { version: versionId });
    // Drop the cached "last saved" so the restored content is treated as fresh.
    delete lastSaved.current[id];
    setActiveNote(res.data);
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: res.data.title, updated_at: res.data.updated_at } : n)));
    return res.data;
  }, []);

  return {
    notes,
    allTags,
    activeId,
    activeNote,
    loading,
    saving,
    setActiveId,
    createNote,
    deleteNote,
    renameNote,
    updateTags,
    updateParents,
    updateAppearance,
    saveShapes,
    fetchVersions,
    restoreVersion,
  };
};
