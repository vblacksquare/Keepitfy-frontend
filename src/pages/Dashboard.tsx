
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2Icon } from "lucide-react";

import { SidebarProvider } from "@/components/ui/sidebar";
import NotesSidebar from "@/components/NotesSidebar";
import NoteCanvas from "@/components/NoteCanvas";
import NoteHistory from "@/components/NoteHistory";
import NoteTags from "@/components/NoteTags";
import NoteParents from "@/components/NoteParents";
import NoteAppearance from "@/components/NoteAppearance";
import { useNotesContext } from "@/providers/NotesProvider";
import { useAuth } from "@/providers/AuthProvider";
import type { Shape } from "@/composables/editor";


export default function Dashboard() {
  const {
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
  } = useNotesContext();

  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [historyOpen, setHistoryOpen] = useState(false);

  // Honor a ?note=<id> deep-link (e.g. from the graph page): select that note
  // once, then strip the param so a later manual switch isn't overridden.
  const appliedNoteParam = useRef(false);
  useEffect(() => {
    if (appliedNoteParam.current) return;
    const raw = searchParams.get("note");
    if (raw == null) return;
    const id = Number(raw);
    if (Number.isFinite(id)) setActiveId(id);
    appliedNoteParam.current = true;
    setSearchParams({}, { replace: true });
  }, [searchParams, setActiveId, setSearchParams]);

  const handleShapesChange = useCallback(
    (shapes: Shape[]) => {
      if (activeId != null) saveShapes(activeId, shapes);
    },
    [activeId, saveShapes]
  );

  const handleRename = useCallback(
    (title: string) => {
      if (activeId != null) void renameNote(activeId, title);
    },
    [activeId, renameNote]
  );

  return (
    <SidebarProvider>
      <NotesSidebar
        notes={notes}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={() => void createNote()}
        onDelete={(id) => void deleteNote(id)}
        onOpenTree={() => navigate("/graph")}
        onLogout={() => void logout()}
      />

      <main className="flex-1 relative">
        {loading || !activeNote ? (
          <div className="flex h-screen items-center justify-center text-muted-foreground">
            <Loader2Icon className="size-6 animate-spin" />
          </div>
        ) : (
          <NoteCanvas
            // Remount on note switch or restore so the editor reloads content
            // and resets its undo/redo history cleanly.
            key={`${activeNote.id}-${activeNote.updated_at}`}
            noteId={activeNote.id}
            title={activeNote.title}
            initialShapes={activeNote.content ?? []}
            onShapesChange={handleShapesChange}
            onRename={handleRename}
            onOpenHistory={() => setHistoryOpen(true)}
            onOpenGraph={() => navigate("/graph")}
            onDeleteNote={() => void deleteNote(activeNote.id)}
            saving={saving}
            appearance={
              <NoteAppearance
                icon={activeNote.icon ?? ""}
                color={activeNote.color ?? ""}
                onChange={(a) => void updateAppearance(activeNote.id, a)}
              />
            }
            relations={
              <NoteTags
                tags={activeNote.tags ?? []}
                allTags={allTags}
                onTagsChange={(names) => void updateTags(activeNote.id, names)}
              />
            }
            parents={
              <NoteParents
                noteId={activeNote.id}
                parents={activeNote.parents ?? []}
                allNotes={notes}
                onParentsChange={(parents) => void updateParents(activeNote.id, parents)}
              />
            }
          />
        )}
      </main>

      <NoteHistory
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        noteId={activeId}
        fetchVersions={fetchVersions}
        onRestore={restoreVersion}
      />
    </SidebarProvider>
  );
}
