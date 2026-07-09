import { useNavigate } from "react-router-dom";

import { SidebarProvider } from "@/components/ui/sidebar";
import NotesSidebar from "@/components/NotesSidebar";
import NotesGraph from "@/components/NotesGraph";
import { useNotesContext } from "@/providers/NotesProvider";
import { useAuth } from "@/providers/AuthProvider";

// The note graph on its own route. It reuses the sidebar so navigation stays
// consistent with the editor; selecting any note deep-links back to the editor
// via `/?note=<id>`.
export default function GraphPage() {
  const { notes, activeId, createNote, deleteNote } = useNotesContext();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const openNote = (id: number) => navigate(`/?note=${id}`);

  return (
    <SidebarProvider>
      <NotesSidebar
        notes={notes}
        activeId={activeId}
        onSelect={openNote}
        onCreate={() => {
          void (async () => {
            const id = await createNote();
            openNote(id);
          })();
        }}
        onDelete={(id) => void deleteNote(id)}
        onOpenTree={() => navigate("/")}
        graphActive
        onLogout={() => void logout()}
      />

      <main className="flex-1 relative">
        <NotesGraph notes={notes} activeId={activeId} onSelect={openNote} />
      </main>
    </SidebarProvider>
  );
}
