import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import { useNotes } from "@/composables/notes";

// The whole notes workspace (list, tags, active note, autosave) lives in one
// hook instance. Hoisting it into a context — mounted once above both the editor
// and the graph route — means switching between "/" and "/graph" reuses the same
// state instead of each page re-running useNotes() and re-fetching, which caused
// a load-spinner flash on every switch.
type NotesContextValue = ReturnType<typeof useNotes>;

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const value = useNotes();
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotesContext(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) {
    throw new Error("useNotesContext must be used within a NotesProvider");
  }
  return ctx;
}
