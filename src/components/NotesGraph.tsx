import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NetworkIcon,
  ZoomInIcon,
  ZoomOutIcon,
  TagIcon,
  SearchIcon,
  ChevronDownIcon,
  CheckIcon,
  XIcon,
  RotateCcwIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getNotePreview } from "@/composables/notePreviews";
import { noteIcon, noteColor } from "@/composables/noteAppearance";
import { saveNotePositions, resetNotePositions } from "@/composables/graphCanvas";
import type { NoteMeta } from "@/composables/notes";

export interface NotesGraphProps {
  notes: NoteMeta[];
  activeId: number | null;
  onSelect: (id: number) => void;
}

// Layout constants (graph-space units, before pan/zoom).
const NODE_W = 196;
const NODE_H = 148;
const PREVIEW_H = 92;
const H_GAP = 44;
const V_GAP = 72;
const PADDING = 72;
const RADIUS = 12;
// Extra breathing room between disconnected trees, so each reads as its own
// island rather than merging with its neighbours. Larger than the intra-tree
// gaps on purpose.
const COMP_GAP = 140;
// Spacing of the drafting-paper dot grid, in graph-space units.
const GRID_SIZE = 28;

interface Placed {
  note: NoteMeta;
  x: number;
  y: number;
  depth: number;
}

// Edges are stored by note id (not by Placed ref) so their endpoints can follow
// live positions while a node or a whole tree is being dragged.
interface Edge {
  from: number; // parent id
  to: number; // child id
}

// Split notes into weakly-connected components (each an "island" / tree). Two
// notes are connected if one is a parent of the other, regardless of direction,
// so a whole family tree ends up in a single component. Union-find keeps this
// near-linear even for large graphs.
function components(notes: NoteMeta[]): NoteMeta[][] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r)! !== r) r = parent.get(r)!;
    // Path compression.
    while (parent.get(x)! !== r) {
      const next = parent.get(x)!;
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const n of notes) parent.set(n.id, n.id);
  for (const n of notes) {
    for (const pid of n.parents ?? []) {
      if (byId.has(pid)) union(n.id, pid);
    }
  }

  const groups = new Map<number, NoteMeta[]>();
  for (const n of notes) {
    const root = find(n.id);
    const g = groups.get(root) ?? [];
    g.push(n);
    groups.set(root, g);
  }
  return [...groups.values()];
}

// A layered (top-down) layout of one component's parent→child DAG, in local
// coordinates (top-left at 0,0). Depth is the longest path from any root, so
// every edge points strictly downward and children always sit below their
// parents. Cycles are broken by a visited guard.
function layoutComponent(notes: NoteMeta[]): { placed: Placed[]; width: number; height: number } {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const existingParents = (n: NoteMeta) => (n.parents ?? []).filter((p) => byId.has(p));

  const depthCache = new Map<number, number>();
  const inProgress = new Set<number>();
  const depthOf = (id: number): number => {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (inProgress.has(id)) return 0; // cycle — treat as root-ish
    inProgress.add(id);
    const parents = existingParents(byId.get(id)!);
    const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map((p) => depthOf(p)));
    inProgress.delete(id);
    depthCache.set(id, d);
    return d;
  };

  const levels = new Map<number, NoteMeta[]>();
  let maxDepth = 0;
  for (const n of notes) {
    const d = depthOf(n.id);
    maxDepth = Math.max(maxDepth, d);
    const bucket = levels.get(d) ?? [];
    bucket.push(n);
    levels.set(d, bucket);
  }
  for (const bucket of levels.values()) {
    bucket.sort((a, b) =>
      (a.title || "Untitled note").localeCompare(b.title || "Untitled note")
    );
  }

  let widest = 0;
  for (const bucket of levels.values()) widest = Math.max(widest, bucket.length);
  const rowWidth = widest * NODE_W + (widest - 1) * H_GAP;

  const placed: Placed[] = [];
  for (let d = 0; d <= maxDepth; d++) {
    const bucket = levels.get(d) ?? [];
    const levelWidth = bucket.length * NODE_W + (bucket.length - 1) * H_GAP;
    const startX = (rowWidth - levelWidth) / 2;
    bucket.forEach((note, i) => {
      placed.push({
        note,
        x: startX + i * (NODE_W + H_GAP),
        y: d * (NODE_H + V_GAP),
        depth: d,
      });
    });
  }

  const width = rowWidth;
  const height = (maxDepth + 1) * NODE_H + maxDepth * V_GAP;
  return { placed, width, height };
}

// Full layout: each disconnected tree is laid out on its own, then the islands
// are shelf-packed left→right, wrapping onto a new row once a target width is
// exceeded. The target aims for a roughly square overall footprint (√area) so
// the graph doesn't stretch into one endless horizontal strip.
function layout(notes: NoteMeta[]): {
  placed: Placed[];
  edges: Edge[];
  compOf: Map<number, number>;
  width: number;
  height: number;
} {
  const comps = components(notes)
    .map((c) => layoutComponent(c))
    // Tallest first packs more tightly and keeps big trees visually grouped.
    .sort((a, b) => b.height - a.height || b.width - a.width);

  const totalArea = comps.reduce((s, c) => s + (c.width + COMP_GAP) * (c.height + COMP_GAP), 0);
  const widestComp = comps.reduce((m, c) => Math.max(m, c.width), 0);
  // Never wrap narrower than the widest single tree (it must fit on one shelf).
  const targetWidth = Math.max(widestComp, Math.sqrt(totalArea) * 1.3);

  const placed: Placed[] = [];
  const placedById = new Map<number, Placed>();
  // Which tree each note belongs to — used to drag a whole tree as a unit.
  const compOf = new Map<number, number>();
  let shelfX = 0;
  let shelfY = 0;
  let shelfHeight = 0;
  let maxRowWidth = 0;

  comps.forEach((comp, ci) => {
    if (shelfX > 0 && shelfX + comp.width > targetWidth) {
      // Wrap to a new shelf.
      shelfY += shelfHeight + COMP_GAP;
      shelfX = 0;
      shelfHeight = 0;
    }
    const offX = PADDING + shelfX;
    const offY = PADDING + shelfY;
    for (const p of comp.placed) {
      const moved: Placed = {
        note: p.note,
        x: offX + p.x,
        y: offY + p.y,
        depth: p.depth,
      };
      placed.push(moved);
      placedById.set(p.note.id, moved);
      compOf.set(p.note.id, ci);
    }
    shelfX += comp.width + COMP_GAP;
    shelfHeight = Math.max(shelfHeight, comp.height);
    maxRowWidth = Math.max(maxRowWidth, shelfX - COMP_GAP);
  });

  const edges: Edge[] = [];
  const byId = new Map(notes.map((n) => [n.id, n]));
  for (const n of notes) {
    if (!placedById.has(n.id)) continue;
    for (const pid of n.parents ?? []) {
      if (!byId.has(pid)) continue;
      if (placedById.has(pid)) edges.push({ from: pid, to: n.id });
    }
  }

  const width = maxRowWidth + PADDING * 2;
  const height = shelfY + shelfHeight + PADDING * 2;
  return { placed, edges, compOf, width, height };
}

// A downward cubic-bezier connector from a parent's bottom edge to a child's top,
// computed from live positions so it follows nodes as they're dragged.
function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

interface Chip {
  text: string;
  x: number;
  w: number;
  icon: boolean; // tag chips carry an icon; the "+N" overflow chip does not
}

// Pack tag chips into a single row that fits the node width, collapsing the
// overflow into a "+N" chip. Widths are approximated from character count
// since SVG can't measure text without a DOM pass.
function layoutChips(tags: { name: string }[], maxWidth: number): Chip[] {
  const chips: Chip[] = [];
  const gap = 5;
  const PAD = 23; // left pad + icon + gap + right pad
  const CHAR = 5.2;
  const OVERFLOW_W = 24; // width of a "+N" chip
  let x = 0;
  for (let i = 0; i < tags.length; i++) {
    const avail = maxWidth - x;
    let text = truncate(tags[i].name, 12);
    let w = PAD + text.length * CHAR;
    if (w > avail) {
      // Doesn't fit as-is. If there's room to truncate a first chip sensibly,
      // clip its text to fit; otherwise collapse the rest into a "+N" chip so
      // nothing ever spills past the card edge.
      const maxChars = Math.floor((avail - PAD) / CHAR);
      if (chips.length === 0 && maxChars >= 3) {
        text = truncate(tags[i].name, maxChars);
        w = PAD + text.length * CHAR;
      } else {
        chips.push({ text: `+${tags.length - i}`, x, w: OVERFLOW_W, icon: false });
        break;
      }
    }
    chips.push({ text, x, w, icon: true });
    x += w + gap;
  }
  return chips;
}

export default function NotesGraph({ notes, activeId, onSelect }: NotesGraphProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  // Tag filter: when any tags are picked, only notes carrying at least one of
  // them stay in the graph (and, transitively, their edges).
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  // Title search: substring match, combined with the tag filter (AND).
  const [query, setQuery] = useState("");
  // Search within the tag picker popover (helps when there are many tags).
  const [tagQuery, setTagQuery] = useState("");

  const allTags = useMemo(() => {
    const names = new Set<string>();
    for (const n of notes) for (const t of n.tags ?? []) names.add(t.name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const toggleTag = (name: string) =>
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (selectedTags.size === 0 && q === "") return notes;
    return notes.filter((n) => {
      const tagOk =
        selectedTags.size === 0 || (n.tags ?? []).some((t) => selectedTags.has(t.name));
      const titleOk = q === "" || (n.title || "Untitled note").toLowerCase().includes(q);
      return tagOk && titleOk;
    });
  }, [notes, selectedTags, query]);

  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  // Pan gesture state (middle-mouse drag; left-drag is reserved for marquee
  // selection). We capture the pointer only once a real drag starts.
  const gesture = useRef<{
    startX: number; startY: number; ox: number; oy: number;
    down: boolean; moved: boolean; captured: boolean; pointerId: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Multi-selection (via marquee or clicking selected nodes) and its live box.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marquee = useRef<{
    startX: number; startY: number; base: Set<number>; additive: boolean;
    moved: boolean; captured: boolean; pointerId: number;
  } | null>(null);

  const { placed, edges, compOf, width, height } = useMemo(() => layout(visibleNotes), [visibleNotes]);

  // Hand-placed positions, keyed by note id (graph-space coords). These take
  // precedence over the computed layout, so hand-placed nodes/trees stay put
  // across re-layouts. Seeded from the server's saved positions (see below) and
  // updated live while dragging. Stale ids (filtered-out notes) are ignored.
  const [positions, setPositions] = useState<Map<number, { x: number; y: number }>>(new Map());
  // Seed each note's saved position exactly once, so a Reset (which clears
  // `positions`) isn't immediately undone by re-seeding from the still-loaded
  // note objects. Newly-appearing notes still get seeded when they show up.
  const seeded = useRef<Set<number>>(new Set());
  useEffect(() => {
    let changed = false;
    const next = new Map(positions);
    for (const n of notes) {
      if (seeded.current.has(n.id)) continue;
      seeded.current.add(n.id);
      if (n.graph_x != null && n.graph_y != null) {
        next.set(n.id, { x: n.graph_x, y: n.graph_y });
        changed = true;
      }
    }
    if (changed) setPositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  // Base (computed) position of each visible node, before any drag override.
  const base = useMemo(
    () => new Map(placed.map((p) => [p.note.id, { x: p.x, y: p.y }])),
    [placed]
  );
  const posOf = useCallback(
    (id: number) => positions.get(id) ?? base.get(id) ?? { x: 0, y: 0 },
    [positions, base]
  );

  // Node/tree drag state. Like the pan gesture, we only commit to a drag once
  // movement passes a threshold, so a plain click still selects the note.
  const drag = useRef<{
    ids: number[]; // the node, or every node in its tree (Shift-drag)
    startX: number; startY: number;
    origin: Map<number, { x: number; y: number }>; // positions at drag start
    moved: boolean; captured: boolean; pointerId: number; id: number;
  } | null>(null);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || width === 0 || height === 0) return;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / width, rect.height / height, 1);
    setView({
      x: (rect.width - width * scale) / 2,
      y: (rect.height - height * scale) / 2,
      scale,
    });
  }, [width, height]);

  // Re-fit whenever the laid-out extent changes — on first load and whenever the
  // tag filter changes the visible set. `fit` is memoized on width/height, so
  // this doesn't disturb the user's manual pan/zoom during normal interaction.
  useEffect(() => {
    if (placed.length === 0) return;
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, [placed.length, fit]);

  // Wheel handling, matching the editor's model: plain wheel / two-finger swipe
  // pans; Ctrl/Cmd + wheel zooms toward the cursor. On a Mac trackpad a pinch
  // gesture arrives as a wheel event with ctrlKey set, so this also handles
  // two-finger pinch-zoom. React registers `wheel` as a passive listener, which
  // would block preventDefault() (letting the browser zoom the whole page), so
  // we attach a native non-passive listener instead.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setView((v) => {
          const factor = 1 - e.deltaY * 0.008; // match the editor's zoom feel
          const scale = Math.min(Math.max(v.scale * factor, 0.2), 2.5);
          const k = scale / v.scale;
          return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    svg.addEventListener("wheel", onWheelNative, { passive: false });
    return () => svg.removeEventListener("wheel", onWheelNative);
    // Re-run once the svg actually mounts: it only renders after notes load
    // (placed.length > 0), so an empty-deps effect would run before svgRef is set.
  }, [placed.length]);

  // Screen-space (svg-relative) bounding box of a node, for marquee hit-testing.
  const nodeScreenBox = useCallback((id: number) => {
    const p = posOf(id);
    return {
      x: view.x + p.x * view.scale,
      y: view.y + p.y * view.scale,
      w: NODE_W * view.scale,
      h: NODE_H * view.scale,
    };
  }, [posOf, view]);

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const sx = e.clientX - (rect?.left ?? 0);
    const sy = e.clientY - (rect?.top ?? 0);
    if (e.button === 1) {
      // Middle-mouse: pan the canvas.
      gesture.current = {
        startX: e.clientX, startY: e.clientY, ox: view.x, oy: view.y,
        down: true, moved: false, captured: false, pointerId: e.pointerId,
      };
      return;
    }
    if (e.button !== 0) return;
    // Left-drag on empty canvas: rubber-band selection. Shift keeps the current
    // selection and adds to it; otherwise a fresh drag replaces it.
    marquee.current = {
      startX: sx, startY: sy,
      base: e.shiftKey ? new Set(selected) : new Set(),
      additive: e.shiftKey, moved: false, captured: false, pointerId: e.pointerId,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g && g.down) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) > 4) {
        g.moved = true;
        try { (e.currentTarget as Element).setPointerCapture(g.pointerId); g.captured = true; } catch { /* noop */ }
      }
      if (g.moved) setView((v) => ({ ...v, x: g.ox + dx, y: g.oy + dy }));
      return;
    }
    const m = marquee.current;
    if (!m) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const cx = e.clientX - (rect?.left ?? 0);
    const cy = e.clientY - (rect?.top ?? 0);
    if (!m.moved && Math.hypot(cx - m.startX, cy - m.startY) > 4) {
      m.moved = true;
      try { (e.currentTarget as Element).setPointerCapture(m.pointerId); m.captured = true; } catch { /* noop */ }
    }
    if (!m.moved) return;
    const box = {
      x: Math.min(m.startX, cx), y: Math.min(m.startY, cy),
      w: Math.abs(cx - m.startX), h: Math.abs(cy - m.startY),
    };
    setMarqueeRect(box);
    // Nodes whose screen box intersects the marquee become selected.
    const next = new Set(m.base);
    for (const p of placed) {
      const b = nodeScreenBox(p.note.id);
      const hit = b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y;
      if (hit) next.add(p.note.id);
    }
    setSelected(next);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g) {
      g.down = false;
      if (g.captured) (e.currentTarget as Element).releasePointerCapture?.(g.pointerId);
      gesture.current = null;
      return;
    }
    const m = marquee.current;
    if (!m) return;
    if (m.captured) (e.currentTarget as Element).releasePointerCapture?.(m.pointerId);
    // A plain click on empty canvas (no drag) clears the selection.
    if (!m.moved && !m.additive) setSelected(new Set());
    marquee.current = null;
    setMarqueeRect(null);
  };

  const zoom = (factor: number) =>
    setView((v) => ({ ...v, scale: Math.min(Math.max(v.scale * factor, 0.2), 2.5) }));

  // ---- Node / tree dragging ----
  // Shift-drag moves the whole tree; dragging a selected node moves the whole
  // selection; otherwise a single note moves. A drag that never crosses the
  // threshold falls through to a select on pointerup.
  const onNodePointerDown = (e: React.PointerEvent, id: number) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // don't let the canvas start a marquee
    const ids = e.shiftKey
      ? placed.filter((p) => compOf.get(p.note.id) === compOf.get(id)).map((p) => p.note.id)
      : selected.has(id) && selected.size > 1
      ? [...selected]
      : [id];
    const origin = new Map(ids.map((nid) => [nid, posOf(nid)]));
    drag.current = {
      ids, id, origin,
      startX: e.clientX, startY: e.clientY,
      moved: false, captured: false, pointerId: e.pointerId,
    };
  };
  const onNodePointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const rawX = e.clientX - d.startX;
    const rawY = e.clientY - d.startY;
    if (!d.moved && Math.hypot(rawX, rawY) > 4) {
      d.moved = true;
      try {
        (e.currentTarget as Element).setPointerCapture(d.pointerId);
        d.captured = true;
      } catch {
        // capture unsupported — dragging still works, just less robustly
      }
    }
    if (!d.moved) return;
    // Convert the screen-space delta into graph-space (undo the zoom).
    const dx = rawX / view.scale;
    const dy = rawY / view.scale;
    setPositions((prev) => {
      const next = new Map(prev);
      for (const nid of d.ids) {
        const o = d.origin.get(nid)!;
        next.set(nid, { x: o.x + dx, y: o.y + dy });
      }
      return next;
    });
  };
  const onNodePointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.captured) (e.currentTarget as Element).releasePointerCapture?.(d.pointerId);
    const wasClick = !d.moved;
    const id = d.id;
    drag.current = null;
    if (wasClick) {
      onSelect(id); // a plain click selects / opens the note
      return;
    }
    // Persist the final positions of everything that moved.
    const dx = (e.clientX - d.startX) / view.scale;
    const dy = (e.clientY - d.startY) / view.scale;
    const updates = d.ids.map((nid) => {
      const o = d.origin.get(nid)!;
      return { id: nid, x: o.x + dx, y: o.y + dy };
    });
    void saveNotePositions(updates);
  };

  // ---- Reset layout ----
  const resetLayout = () => {
    setPositions(new Map());
    void resetNotePositions();
  };
  const hasCustomLayout = positions.size > 0;

  const filtering = selectedTags.size > 0 || query.trim() !== "";

  return (
    <div className="relative h-full w-full overflow-hidden overscroll-none bg-muted/20">
      {/* Unified top toolbar: identity + count, title search, and a tag filter
          that lives in a popover so it scales to many tags. Active tag filters
          surface as removable chips so the current filter is visible at a glance. */}
      <div className="absolute left-4 right-4 top-4 z-10 flex items-center gap-1.5 rounded-xl border bg-background/85 p-1.5 shadow-sm backdrop-blur">
        {/* Identity + count */}
        <div className="flex shrink-0 items-center gap-1.5 pl-1 pr-1 text-sm font-medium">
          <NetworkIcon className="size-4 text-muted-foreground" />
          <span className="hidden sm:inline">Graph</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {filtering ? `${visibleNotes.length}/${notes.length}` : notes.length}
          </span>
        </div>

        <div className="h-5 w-px shrink-0 bg-border" />

        {/* Title search */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes by title…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
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

        {allTags.length > 0 && (
          <>
            <div className="h-5 w-px shrink-0 bg-border" />

            {/* Active tag chips (removable), horizontally scrollable if many */}
            {selectedTags.size > 0 && (
              <div className="flex min-w-0 max-w-[40%] items-center gap-1 overflow-x-auto">
                {[...selectedTags].map((name) => (
                  <span
                    key={name}
                    className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                  >
                    <TagIcon className="size-2.5 opacity-80" />
                    {name}
                    <button
                      onClick={() => toggleTag(name)}
                      title="Remove tag"
                      className="-mr-0.5 grid size-3.5 place-items-center rounded-full hover:bg-primary-foreground/20"
                    >
                      <XIcon className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tag picker popover */}
            <Popover onOpenChange={(o) => { if (!o) setTagQuery(""); }}>
              <PopoverTrigger asChild>
                <button className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <TagIcon className="size-3.5" />
                  <span className="hidden sm:inline">Tags</span>
                  {selectedTags.size > 0 && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {selectedTags.size}
                    </Badge>
                  )}
                  <ChevronDownIcon className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 overflow-hidden p-0">
                <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
                  <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    placeholder="Filter tags…"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <div className="flex flex-col p-1">
                    {allTags
                      .filter((n) => n.toLowerCase().includes(tagQuery.trim().toLowerCase()))
                      .map((name) => {
                        const on = selectedTags.has(name);
                        return (
                          <button
                            key={name}
                            onClick={() => toggleTag(name)}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                          >
                            <span
                              className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border ${
                                on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                              }`}
                            >
                              {on && <CheckIcon className="size-3" />}
                            </span>
                            <TagIcon className="size-3 shrink-0 text-muted-foreground" />
                            <span className="truncate">{name}</span>
                          </button>
                        );
                      })}
                    {allTags.filter((n) => n.toLowerCase().includes(tagQuery.trim().toLowerCase())).length === 0 && (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">No tags found.</div>
                    )}
                  </div>
                </div>
                {selectedTags.size > 0 && (
                  <div className="border-t p-1">
                    <button
                      onClick={() => setSelectedTags(new Set())}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      Clear {selectedTags.size} selected
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      {/* Interaction hint */}
      {placed.length > 0 && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden rounded-lg border bg-background/80 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur sm:block">
          Drag to move · <span className="font-medium">Shift-drag</span> a tree · drag empty space to select
        </div>
      )}

      {/* Reset the hand-placed layout (destructive — clears all saved positions).
          Always shown for discoverability; disabled when there's nothing to reset. */}
      <div className="absolute bottom-16 right-4 z-10 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={!hasCustomLayout}
              title={hasCustomLayout ? "Reset layout — clears all saved positions" : "No moved notes to reset"}
            >
              <RotateCcwIcon className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset layout?</AlertDialogTitle>
              <AlertDialogDescription>
                All hand-placed note positions will be cleared and the graph will
                return to its automatic layout. This can’t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={resetLayout}
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Zoom panel — mirrors the editor's bottom-right control. */}
      <TooltipProvider delayDuration={300}>
        <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-lg border bg-background/90 p-1.5 shadow-sm backdrop-blur">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>
                <ZoomOutIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Zoom out</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={fit} className="min-w-12 rounded-md py-1 text-xs font-medium tabular-nums hover:bg-muted">
                {Math.round(view.scale * 100)}%
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Reset zoom</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Zoom in" onClick={() => zoom(1.2)}>
                <ZoomInIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Zoom in</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      <svg
        ref={svgRef}
        className="h-full w-full cursor-default touch-none select-none overscroll-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Drafting-paper backdrop: an infinite dotted grid that pans and scales
            with the canvas (via patternTransform) so it reads like real graph
            paper stretching under the notes. Sits outside the content transform
            and fills the whole viewport. */}
        <defs>
          <pattern
            id="paper-dots"
            width={GRID_SIZE}
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
          >
            <circle
              cx={GRID_SIZE / 2}
              cy={GRID_SIZE / 2}
              r={1.1}
              fill="var(--muted-foreground)"
              fillOpacity={0.35}
            />
          </pattern>
          {/* Coarser grid lines every 5 cells for that engineering-paper feel. */}
          <pattern
            id="paper-grid"
            width={GRID_SIZE * 5}
            height={GRID_SIZE * 5}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
          >
            <path
              d={`M ${GRID_SIZE * 5} 0 L 0 0 0 ${GRID_SIZE * 5}`}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.1}
              strokeWidth={1}
            />
          </pattern>
        </defs>
        <rect x={0} y={0} width="100%" height="100%" fill="url(#paper-grid)" />
        <rect x={0} y={0} width="100%" height="100%" fill="url(#paper-dots)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {/* Edges first so nodes render on top; endpoints follow live positions. */}
          {edges.map((e, i) => {
            const a = posOf(e.from);
            const b = posOf(e.to);
            const lit = hovered === e.from || hovered === e.to;
            return (
              <path
                key={i}
                d={edgePath(a, b)}
                fill="none"
                stroke={lit ? "var(--primary)" : "var(--border)"}
                strokeWidth={lit ? 2 : 1.25}
                className="transition-colors"
              />
            );
          })}

          {placed.map((p) => {
            const isSel = selected.has(p.note.id);
            const active = hovered === p.note.id || activeId === p.note.id || isSel;
            const preview = getNotePreview(p.note.id);
            const tags = p.note.tags ?? [];
            const chips = layoutChips(tags, NODE_W - 24);
            const clipId = `clip-${p.note.id}`;
            const NoteIcon = noteIcon(p.note.icon);
            const accent = noteColor(p.note.color);
            const pos = posOf(p.note.id);
            return (
              <g
                key={p.note.id}
                transform={`translate(${pos.x} ${pos.y})`}
                className="cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => onNodePointerDown(e, p.note.id)}
                onPointerMove={onNodePointerMove}
                onPointerUp={onNodePointerUp}
                onMouseEnter={() => setHovered(p.note.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <defs>
                  <clipPath id={clipId}>
                    <rect width={NODE_W} height={NODE_H} rx={RADIUS} />
                  </clipPath>
                </defs>

                <g clipPath={`url(#${clipId})`}>
                  {/* Card body */}
                  <rect width={NODE_W} height={NODE_H} fill="var(--card)" />
                  {/* Preview area */}
                  <rect width={NODE_W} height={PREVIEW_H} fill="var(--muted)" />
                  {preview ? (
                    <image
                      href={preview}
                      width={NODE_W}
                      height={PREVIEW_H}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  ) : (
                    <text
                      x={NODE_W / 2}
                      y={PREVIEW_H / 2 + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fill="var(--muted-foreground)"
                      style={{ userSelect: "none" }}
                    >
                      No preview
                    </text>
                  )}
                  {/* Divider */}
                  <line
                    x1={0}
                    y1={PREVIEW_H}
                    x2={NODE_W}
                    y2={PREVIEW_H}
                    stroke="var(--border)"
                    strokeWidth={1}
                  />

                  {/* Icon + title */}
                  <foreignObject x={12} y={PREVIEW_H + 12} width={16} height={16}>
                    <NoteIcon
                      size={16}
                      color={accent ?? "var(--card-foreground)"}
                    />
                  </foreignObject>
                  <text
                    x={34}
                    y={PREVIEW_H + 24}
                    fontSize={13}
                    fontWeight={600}
                    fill="var(--card-foreground)"
                    style={{ userSelect: "none" }}
                  >
                    {truncate(p.note.title || "Untitled note", 23)}
                  </text>

                  {/* Tag chips */}
                  <g transform={`translate(12 ${PREVIEW_H + 34})`}>
                    {chips.map((c, ci) => (
                      <g key={ci} transform={`translate(${c.x} 0)`}>
                        <rect width={c.w} height={16} rx={8} fill="var(--muted)" />
                        {c.icon ? (
                          <>
                            <svg
                              x={6}
                              y={4}
                              width={8}
                              height={8}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--muted-foreground)"
                              strokeWidth={2.2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
                              <circle cx="7.5" cy="7.5" r="1.5" fill="var(--muted-foreground)" stroke="none" />
                            </svg>
                            <text
                              x={17}
                              y={11}
                              fontSize={9}
                              fill="var(--muted-foreground)"
                              style={{ userSelect: "none" }}
                            >
                              {c.text}
                            </text>
                          </>
                        ) : (
                          <text
                            x={c.w / 2}
                            y={11}
                            textAnchor="middle"
                            fontSize={9}
                            fill="var(--muted-foreground)"
                            style={{ userSelect: "none" }}
                          >
                            {c.text}
                          </text>
                        )}
                      </g>
                    ))}
                  </g>
                </g>

                {/* Border on top of the clipped content — selection always wins
                    so multi-selected nodes read clearly even with an accent. */}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={RADIUS}
                  fill="none"
                  stroke={isSel ? "var(--primary)" : accent ?? (active ? "var(--primary)" : "var(--border)")}
                  strokeWidth={isSel ? 2.5 : active ? 2.5 : accent ? 2 : 1}
                  className="transition-colors"
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Marquee selection box (screen-space overlay). */}
      {marqueeRect && (
        <div
          className="pointer-events-none absolute z-10 rounded-sm border border-primary bg-primary/10"
          style={{ left: marqueeRect.x, top: marqueeRect.y, width: marqueeRect.w, height: marqueeRect.h }}
        />
      )}

      {placed.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <NetworkIcon className="size-8 opacity-40" />
          <p className="text-sm">
            {notes.length === 0
              ? "No notes to graph yet."
              : "No notes match your filters."}
          </p>
        </div>
      )}
    </div>
  );
}
