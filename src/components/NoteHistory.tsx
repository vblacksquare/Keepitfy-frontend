
import { useEffect, useState } from "react";
import { HistoryIcon, RotateCcwIcon, Loader2Icon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { NoteVersion } from "@/composables/notes";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return formatDistanceToNow(d, { addSuffix: true });
}

function shapeCount(content: unknown): number {
  return Array.isArray(content) ? content.length : 0;
}

export interface NoteHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: number | null;
  fetchVersions: (id: number) => Promise<NoteVersion[]>;
  onRestore: (id: number, versionId: number) => Promise<unknown>;
}

export default function NoteHistory({
  open,
  onOpenChange,
  noteId,
  fetchVersions,
  onRestore,
}: NoteHistoryProps) {
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || noteId == null) return;
    let cancelled = false;
    setLoading(true);
    fetchVersions(noteId)
      .then((v) => { if (!cancelled) setVersions(v); })
      .catch(() => { if (!cancelled) setVersions([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, noteId, fetchVersions]);

  const handleRestore = async (versionId: number) => {
    if (noteId == null) return;
    setRestoringId(versionId);
    try {
      await onRestore(noteId, versionId);
      onOpenChange(false);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4" /> Version history
          </DialogTitle>
          <DialogDescription>
            Every save is snapshotted. Restore any earlier version of this note.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] -mx-2 px-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No versions yet.</div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {versions.map((v, i) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-col overflow-hidden">
                    <span className="flex items-center gap-2 text-sm font-medium truncate">
                      <span className="truncate">{v.title || "Untitled note"}</span>
                      {i === 0 && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Latest</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground" title={new Date(v.created_at).toLocaleString()}>
                      {formatDate(v.created_at)} · {shapeCount(v.content)} items
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoringId !== null}
                    onClick={() => handleRestore(v.id)}
                  >
                    {restoringId === v.id ? (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    ) : (
                      <RotateCcwIcon className="size-3.5" />
                    )}
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
