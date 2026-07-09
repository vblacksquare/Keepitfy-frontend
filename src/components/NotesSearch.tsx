import { useEffect, useState } from "react";
import { FileTextIcon, TagIcon } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { NoteMeta } from "@/composables/notes";

export interface NotesSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: NoteMeta[];
  onSelect: (id: number) => void;
}

// Command-palette search over notes, matching on both title and tag names.
// Opens via the sidebar button or ⌘K / Ctrl+K.
export default function NotesSearch({ open, onOpenChange, notes, onSelect }: NotesSearchProps) {
  // Global ⌘K / Ctrl+K shortcut to toggle the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const choose = (id: number) => {
    onSelect(id);
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search notes"
      description="Search your notes by title or tag."
    >
      <Command>
      <CommandInput placeholder="Search by title or tag…" />
      <CommandList>
        <CommandEmpty>No notes found.</CommandEmpty>
        <CommandGroup heading="Notes">
          {notes.map((note) => {
            const tagNames = (note.tags ?? []).map((t) => t.name);
            // cmdk filters by `value`; fold the tags in so a tag query matches.
            const value = `${note.title || "Untitled note"} ${tagNames.join(" ")}`;
            return (
              <CommandItem key={note.id} value={value} onSelect={() => choose(note.id)}>
                <FileTextIcon className="text-muted-foreground" />
                <span className="flex-1 truncate">{note.title || "Untitled note"}</span>
                {tagNames.length > 0 && (
                  <span className="flex shrink-0 items-center gap-1 overflow-hidden">
                    {tagNames.slice(0, 3).map((name) => (
                      <span
                        key={name}
                        className="flex items-center gap-1 rounded-full border border-border bg-background px-1.5 text-[10px] text-muted-foreground"
                      >
                        <TagIcon className="size-2.5 opacity-60" />
                        {name}
                      </span>
                    ))}
                    {tagNames.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{tagNames.length - 3}</span>
                    )}
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
