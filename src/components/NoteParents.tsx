import { useMemo, useState } from "react";
import { XIcon, Link2Icon, CheckIcon, CornerLeftUpIcon, ChevronDownIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { NoteMeta } from "@/composables/notes";

export interface NoteParentsProps {
  noteId: number;
  parents: number[];
  allNotes: NoteMeta[];
  onParentsChange: (parents: number[]) => void;
}

// Parent-link editor, pinned to the canvas's top-right corner. Collapsed to a
// compact trigger; the parent list and picker live inside a popover so the
// panel isn't permanently expanded over the canvas.
export default function NoteParents({
  noteId,
  parents,
  allNotes,
  onParentsChange,
}: NoteParentsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // A note may not be its own parent.
  const candidates = useMemo(
    () => allNotes.filter((n) => n.id !== noteId),
    [allNotes, noteId]
  );

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return candidates;
    return candidates.filter((n) =>
      (n.title || "Untitled note").toLowerCase().includes(q)
    );
  }, [candidates, query]);

  const parentSet = useMemo(() => new Set(parents), [parents]);

  const toggleParent = (id: number) => {
    const next = parentSet.has(id)
      ? parents.filter((p) => p !== id)
      : [...parents, id];
    onParentsChange(next);
  };

  const parentNotes = useMemo(
    () => candidates.filter((n) => parentSet.has(n.id)),
    [candidates, parentSet]
  );

  if (candidates.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-full border border-border/60 bg-primary-foreground/70 px-3 text-xs shadow-lg backdrop-blur-md hover:bg-primary-foreground/90"
        >
          <CornerLeftUpIcon className="size-3.5 text-muted-foreground" />
          Parents
          {parentNotes.length > 0 && (
            <span className="rounded-full bg-secondary px-1.5 text-[10px] leading-4 text-secondary-foreground">
              {parentNotes.length}
            </span>
          )}
          <ChevronDownIcon
            className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 overflow-hidden rounded-xl p-0">
        {/* Current parents */}
        {parentNotes.length > 0 && (
          <div className="border-b p-1.5">
            <div className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Linked
            </div>
            <div className="flex flex-col gap-0.5">
              {parentNotes.map((p) => (
                <div
                  key={`p-${p.id}`}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
                >
                  <Link2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{p.title || "Untitled note"}</span>
                  <button
                    className="grid place-items-center rounded-full p-0.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                    title="Remove parent"
                    onClick={() => toggleParent(p.id)}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Picker */}
        <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes by title…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              title="Clear search"
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
        <div className="p-1.5">
          <div className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Link a parent
          </div>
          <div className="max-h-56 overflow-y-auto">
            <div className="flex flex-col gap-0.5">
              {filteredCandidates.map((n) => {
                const checked = parentSet.has(n.id);
                return (
                  <button
                    key={n.id}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => toggleParent(n.id)}
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {checked && <CheckIcon className="size-3" />}
                    </span>
                    <span className="truncate">{n.title || "Untitled note"}</span>
                  </button>
                );
              })}
              {filteredCandidates.length === 0 && (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No notes found.
                </div>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
