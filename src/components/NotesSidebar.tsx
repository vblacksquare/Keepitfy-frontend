
import { useState } from "react";
import { PlusIcon, Trash2Icon, LogOutIcon, TagIcon, SearchIcon, NetworkIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import NotesSearch from "@/components/NotesSearch";
import { noteIcon, noteColor } from "@/composables/noteAppearance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { NoteMeta } from "@/composables/notes";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Relative ("3 hours ago") reads faster than an absolute timestamp in a list.
  return `Edited ${formatDistanceToNow(d, { addSuffix: true })}`;
}

export interface NotesSidebarProps {
  notes: NoteMeta[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onOpenTree?: () => void;
  graphActive?: boolean;
  onLogout?: () => void;
}

export default function NotesSidebar({
  notes,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onOpenTree,
  graphActive,
  onLogout,
}: NotesSidebarProps) {
  // The note pending deletion drives a single shared confirmation dialog,
  // instead of a blocking native confirm() per row.
  const [pendingDelete, setPendingDelete] = useState<NoteMeta | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-1 px-2 py-1 group-data-[collapsible=icon]:px-0">
          <span className="text-xl font-bold group-data-[collapsible=icon]:hidden">Keepitify</span>
          {onOpenTree && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenTree}
                  aria-pressed={graphActive}
                  className={`ml-auto grid size-8 shrink-0 place-items-center rounded-md transition-colors group-data-[collapsible=icon]:hidden ${
                    graphActive
                      ? "bg-primary/15 text-primary hover:bg-primary/20"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <NetworkIcon className="size-4" />
                  <span className="sr-only">{graphActive ? "Back to editor" : "Note graph"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {graphActive ? "Back to editor" : "Note graph"}
              </TooltipContent>
            </Tooltip>
          )}
          <SidebarTrigger
            className={`group-data-[collapsible=icon]:mx-auto ${onOpenTree ? "" : "ml-auto"}`}
            title="Toggle sidebar"
          />
        </div>
        <button
          onClick={() => setSearchOpen(true)}
          title="Search notes"
          className="mx-1 flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground group-data-[collapsible=icon]:mx-0 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
        >
          <SearchIcon className="size-4 shrink-0" />
          <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">Search notes…</span>
          <Kbd className="group-data-[collapsible=icon]:hidden">⌘K</Kbd>
        </button>
        {/* When collapsed to icons, surface the graph toggle as its own icon row
            since the header shows only the sidebar trigger. */}
        {onOpenTree && (
          <button
            onClick={onOpenTree}
            title={graphActive ? "Back to editor" : "View note graph"}
            className={`mx-0 hidden size-8 place-items-center rounded-md transition-colors group-data-[collapsible=icon]:grid ${
              graphActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <NetworkIcon className="size-4" />
            <span className="sr-only">{graphActive ? "Back to editor" : "Note graph"}</span>
          </button>
        )}
      </SidebarHeader>

      <NotesSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        notes={notes}
        onSelect={onSelect}
      />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
            Notes
            {notes.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {notes.length}
              </Badge>
            )}
          </SidebarGroupLabel>
          <SidebarGroupAction title="New note" onClick={onCreate}>
            <PlusIcon /> <span className="sr-only">New note</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {notes.length === 0 && (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  <p>No notes yet.</p>
                  <Button variant="link" size="sm" className="mt-1 h-auto p-0" onClick={onCreate}>
                    Create your first note
                  </Button>
                </div>
              )}
              {notes.map((note) => {
                const NoteIcon = noteIcon(note.icon);
                const accent = noteColor(note.color);
                return (
                <SidebarMenuItem key={note.id}>
                  <SidebarMenuButton
                    isActive={note.id === activeId}
                    onClick={() => onSelect(note.id)}
                    tooltip={note.title || "Untitled note"}
                    className="h-auto py-2 group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!py-2"
                  >
                    <NoteIcon style={accent ? { color: accent } : undefined} />
                    <div className="flex flex-col items-start overflow-hidden">
                      <span className="truncate w-full">{note.title || "Untitled note"}</span>
                      <span className="text-[11px] text-muted-foreground truncate w-full">
                        {formatDate(note.updated_at)}
                      </span>
                      {note.tags && note.tags.length > 0 && (
                        <span
                          className="mt-1.5 flex w-full flex-nowrap gap-1 overflow-hidden"
                          // Fade the row out at the right edge so clipped tags
                          // trail off gracefully instead of hard-cutting.
                          style={{
                            maskImage:
                              "linear-gradient(to right, black calc(100% - 1.5rem), transparent)",
                            WebkitMaskImage:
                              "linear-gradient(to right, black calc(100% - 1.5rem), transparent)",
                          }}
                        >
                          {note.tags.map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="secondary"
                              className="h-[18px] shrink-0 gap-1 rounded-full border border-border bg-background pl-1.5 pr-2 text-[10px] font-normal text-muted-foreground"
                            >
                              <TagIcon className="size-2.5 opacity-60" />
                              {tag.name}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </div>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    showOnHover
                    title="Delete note"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(note);
                    }}
                  >
                    <Trash2Icon />
                    <span className="sr-only">Delete note</span>
                  </SidebarMenuAction>
                </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Button
          variant="ghost"
          title="New note"
          className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={onCreate}
        >
          <PlusIcon /> <span className="group-data-[collapsible=icon]:hidden">New note</span>
        </Button>
        {onLogout && (
          <Button
            variant="ghost"
            title="Log out"
            className="w-full justify-start text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            onClick={onLogout}
          >
            <LogOutIcon /> <span className="group-data-[collapsible=icon]:hidden">Log out</span>
          </Button>
        )}
      </SidebarFooter>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title || "Untitled note"}” will be permanently deleted. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
    </TooltipProvider>
  );
}
