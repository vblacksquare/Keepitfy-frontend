
import { memo, useCallback, useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import { Stage, Layer, Line, Rect, Arrow, Ellipse, Text } from "react-konva";

import {
  PencilIcon, HandIcon, MousePointerIcon, SquareIcon, DiamondIcon, CircleIcon,
  MoveRightIcon, MinusIcon, TypeIcon, EraserIcon, Undo2Icon, Redo2Icon,
  CopyIcon, ClipboardPasteIcon, Trash2Icon, BringToFrontIcon, SendToBackIcon,
  ZoomInIcon, ZoomOutIcon, HistoryIcon, NetworkIcon, CheckIcon, Loader2Icon,
  BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon,
  AlignLeftIcon, AlignCenterIcon, AlignRightIcon,
  AlignStartVerticalIcon, AlignCenterVerticalIcon, AlignEndVerticalIcon,
  AlignStartHorizontalIcon, AlignCenterHorizontalIcon, AlignEndHorizontalIcon,
  Link2Icon, GroupIcon, UngroupIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import { Kbd } from "@/components/ui/kbd"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { useEditor, DEFAULT_COLORS, TEXT_FONT_FAMILY, TEXT_LINE_HEIGHT, TOOL_SHORTCUTS, TEXT_FONTS, FONT_SIZE_OPTIONS } from "@/composables/editor"
import type { Shape, Tool } from "@/composables/editor"
import { setNotePreview, removeNotePreview } from "@/composables/notePreviews"
import { getComputedRgba } from "@/utils"


const STROKE_WIDTHS = [1, 2, 4, 6, 8, 10, 14, 18];
const STROKE_COLORS = ["transparent", ...DEFAULT_COLORS];
const FILL_COLORS = STROKE_COLORS;

const DRAW_TOOLS: Tool[] = ["rect", "diamond", "ellipse", "arrow", "line", "brush", "text", "connector"];
const FILL_TOOLS: Tool[] = ["rect", "diamond", "ellipse"];
const WIDTH_TOOLS: Tool[] = ["rect", "diamond", "ellipse", "arrow", "line", "brush", "connector"];

const PANEL = "bg-primary-foreground/70 backdrop-blur-md dropborder rounded-2xl shadow-lg";

function Swatch({ value, active, onClick, title }: { value: string; active: boolean; onClick: () => void; title?: string }) {
  const isNone = value === "transparent";
  return (
    <button
      onClick={onClick}
      title={title ?? value}
      className={`relative size-6 rounded-md border overflow-hidden transition-transform hover:scale-110 ${active ? "ring-2 ring-offset-1 ring-foreground scale-110" : "border-border"}`}
      style={{ backgroundColor: isNone ? "transparent" : value }}
    >
      {isNone && (
        <svg viewBox="0 0 24 24" className="absolute inset-0 size-full text-destructive">
          <line x1="3" y1="21" x2="21" y2="3" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </button>
  );
}

function ChromeButton({
  icon, label, shortcut, side = "bottom", onClick, disabled, active, size = "icon-sm",
}: {
  icon: React.ReactNode; label: string; shortcut?: string; side?: "top" | "bottom" | "left" | "right";
  onClick: () => void; disabled?: boolean; active?: boolean; size?: "icon-sm" | "icon-lg";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size={size} variant="ghost" disabled={disabled} onClick={onClick}
          aria-label={label} aria-pressed={active}
          className={active ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : ""}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>
        {label}{shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

const HANDLE_CURSORS: Record<string, string> = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
};

function getHandles(b: { x: number; y: number; width: number; height: number }) {
  const { x, y, width: w, height: h } = b;
  return [
    { name: "nw", x, y }, { name: "n", x: x + w / 2, y },
    { name: "ne", x: x + w, y }, { name: "e", x: x + w, y: y + h / 2 },
    { name: "se", x: x + w, y: y + h }, { name: "s", x: x + w / 2, y: y + h },
    { name: "sw", x, y: y + h }, { name: "w", x, y: y + h / 2 },
  ];
}

const TOOLS: { tool: Tool; icon: React.ReactNode; title: string }[] = [
  { tool: "hand", icon: <HandIcon />, title: "Hand (pan)" },
  { tool: "select", icon: <MousePointerIcon />, title: "Select" },
  { tool: "rect", icon: <SquareIcon />, title: "Rectangle" },
  { tool: "diamond", icon: <DiamondIcon />, title: "Diamond" },
  { tool: "ellipse", icon: <CircleIcon />, title: "Ellipse" },
  { tool: "arrow", icon: <MoveRightIcon />, title: "Arrow" },
  { tool: "connector", icon: <Link2Icon />, title: "Connector (sticky arrow)" },
  { tool: "line", icon: <MinusIcon />, title: "Line" },
  { tool: "text", icon: <TypeIcon />, title: "Text" },
  { tool: "brush", icon: <PencilIcon />, title: "Pencil" },
  { tool: "eraser", icon: <EraserIcon />, title: "Eraser" },
];

function normalizeBox(s: Shape) {
  return {
    x: Math.min(s.x, s.x + s.width),
    y: Math.min(s.y, s.y + s.height),
    width: Math.abs(s.width),
    height: Math.abs(s.height),
  };
}

function renderShape(shape: Shape, opacity = 1) {
  const common = {
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    opacity,
    lineCap: "round" as const,
    lineJoin: "round" as const,
    listening: false,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
    hitStrokeWidth: 0,
  };

  switch (shape.type) {
    case "brush":
      return <Line key={shape.id} points={shape.points} tension={0.4} {...common} />;

    case "line":
      return <Line key={shape.id} points={shape.points} {...common} />;

    case "arrow":
    case "connector":
      return (
        <Arrow
          key={shape.id}
          points={shape.points}
          fill={shape.stroke}
          pointerLength={Math.max(8, shape.strokeWidth * 2)}
          pointerWidth={Math.max(8, shape.strokeWidth * 2)}
          {...common}
        />
      );

    case "rect": {
      const b = normalizeBox(shape);
      return (
        <Rect
          key={shape.id}
          x={b.x} y={b.y} width={b.width} height={b.height}
          cornerRadius={4} fill={shape.fill} {...common}
        />
      );
    }

    case "diamond": {
      const b = normalizeBox(shape);
      const points = [
        b.x + b.width / 2, b.y,
        b.x + b.width, b.y + b.height / 2,
        b.x + b.width / 2, b.y + b.height,
        b.x, b.y + b.height / 2,
      ];
      return (
        <Line key={shape.id} points={points} closed fill={shape.fill} {...common} />
      );
    }

    case "ellipse": {
      const b = normalizeBox(shape);
      return (
        <Ellipse
          key={shape.id}
          x={b.x + b.width / 2} y={b.y + b.height / 2}
          radiusX={b.width / 2} radiusY={b.height / 2}
          fill={shape.fill} {...common}
        />
      );
    }

    case "text":
      return (
        <Text
          key={shape.id}
          x={shape.x} y={shape.y}
          text={shape.text ?? ""}
          fontSize={shape.fontSize ?? 24}
          fontFamily={shape.fontFamily ?? TEXT_FONT_FAMILY}
          fontStyle={shape.fontStyle ?? "normal"}
          textDecoration={shape.textDecoration ?? ""}
          align={shape.align ?? "left"}
          lineHeight={TEXT_LINE_HEIGHT}
          fill={shape.stroke}
          opacity={opacity}
          listening={false}
          width={shape.align && shape.align !== "left" ? Math.max(shape.width, 10) : undefined}
        />
      );

    default:
      return null;
  }
}

const ShapeNode = memo(function ShapeNode({ shape }: { shape: Shape }) {
  return renderShape(shape);
});


export interface NoteCanvasProps {
  noteId: number;
  title: string;
  initialShapes: Shape[];
  onShapesChange: (shapes: Shape[]) => void;
  onRename: (title: string) => void;
  onOpenHistory: () => void;
  onOpenGraph?: () => void;
  onDeleteNote?: () => void;
  saving: boolean;
  appearance?: React.ReactNode;
  relations?: React.ReactNode;
  parents?: React.ReactNode;
}

export default function NoteCanvas({
  noteId, title, initialShapes, onShapesChange, onRename,
  onOpenHistory, onOpenGraph, onDeleteNote, saving, appearance, relations, parents,
}: NoteCanvasProps) {
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(false);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturePreviewRef = useRef<() => void>(() => {});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleShapesChange = useCallback(
    (next: Shape[]) => {
      onShapesChange(next);
      if (captureTimer.current) clearTimeout(captureTimer.current);
      if (next.length === 0) { removeNotePreview(noteId); return; }
      captureTimer.current = setTimeout(() => capturePreviewRef.current(), 900);
    },
    [onShapesChange, noteId]
  );

  const {
    stageRef, tool, isDragging, shapes, draft,
    isDrawing, selectedBounds, selectedIds, normalizedRect, scale,
    color, fillColor, strokeWidth, fontSize, fontFamily,
    fontStyle, textDecoration, textAlign,
    editingText, contextMenu, connectorSnap,
    canUndo, canRedo,
    changeTool, changeColor, changeFill, changeStrokeWidth, changeFontSize, changeFontFamily,
    changeFontStyle, changeTextDecoration, changeTextAlign,
    handleMouseDown, handleWheel, handleContextMenu, handleDblClick, closeContextMenu,
    undo, redo,
    copySelected, pasteClipboard, deleteSelected, duplicateSelected,
    updateEditingText, commitTextEditing,
    bringToFront, sendToBack, startResize,
    groupSelected, ungroupSelected, alignSelected,
    zoomIn, zoomOut, resetZoom,
  } = useEditor({ initialShapes, onShapesChange: handleShapesChange });

  const capturePreview = useCallback(() => {
    const stage = stageRef.current?.getStage?.() ?? stageRef.current;
    const layer = stage?.getLayers?.()[0];
    const target = layer ?? stage;
    if (!target?.toDataURL) return;
    try {
      const url = target.toDataURL({ mimeType: "image/png", pixelRatio: 0.3 });
      setNotePreview(noteId, url);
    } catch { }
  }, [stageRef, noteId]);

  useEffect(() => { capturePreviewRef.current = capturePreview; }, [capturePreview]);
  useEffect(() => {
    if (initialShapes.length === 0) return;
    const id = setTimeout(() => capturePreviewRef.current(), 500);
    return () => clearTimeout(id);
  }, [initialShapes.length]);
  useEffect(() => () => { if (captureTimer.current) clearTimeout(captureTimer.current); }, []);

  const [titleDraft, setTitleDraft] = useState(title);
  useEffect(() => { setTitleDraft(title); }, [title]);
  const titleRef = useRef<HTMLInputElement>(null);

  const commitTitle = () => {
    const next = titleDraft.trim() || "Untitled note";
    setTitleDraft(next);
    if (next !== title) onRename(next);
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colors = useMemo(() => ({
    primary: getComputedRgba("--primary"),
    primaryFill: getComputedRgba("--primary", 0.15),
    background: getComputedRgba("--background"),
    connectorSnap: getComputedRgba("--primary", 0.3),
  }), []);

  const showHandles = tool === "select" && selectedBounds && selectedIds.length > 0 && !normalizedRect;
  const SELECT_PADDING = 6 / scale;
  const selBox = selectedBounds && {
    x: selectedBounds.x - SELECT_PADDING,
    y: selectedBounds.y - SELECT_PADDING,
    width: selectedBounds.width + SELECT_PADDING * 2,
    height: selectedBounds.height + SELECT_PADDING * 2,
  };

  const setCursor = (value: string) => {
    const stage = stageRef.current?.getStage?.() ?? stageRef.current;
    if (stage) stage.container().style.cursor = value;
  };

  const cursor =
    tool === "hand" ? (isDragging ? "grabbing" : "grab") :
    tool === "select" ? "default" :
    tool === "connector" ? "crosshair" :
    "crosshair";

  const hasSelection = selectedIds.length > 0;
  const hasTextSelection = shapes.some((s) => selectedIds.includes(s.id) && s.type === "text");
  const hasNonTextSelection = shapes.some((s) => selectedIds.includes(s.id) && s.type !== "text");
  const hasMultiSelection = selectedIds.length >= 2;
  const hasGroupableSelection = selectedIds.length >= 2;
  const hasGroupedShapes = shapes.some(s => selectedIds.includes(s.id) && s.groupId != null);
  const showText = tool === "text" || hasTextSelection;
  const showShapeProps = (hasSelection && hasNonTextSelection) || (tool !== "text" && DRAW_TOOLS.includes(tool));
  const showProps = showShapeProps || showText;
  const showFill = hasNonTextSelection || FILL_TOOLS.includes(tool);
  const showWidth = hasNonTextSelection || WIDTH_TOOLS.includes(tool);
  const showEmptyHint = shapes.length === 0 && !draft && !editingText;

  // Toggle formatting helpers
  const toggleBold = useCallback(() => {
    const next = fontStyle === "bold" ? "normal" : fontStyle === "italic" ? "bold italic" : fontStyle === "bold italic" ? "italic" : "bold";
    changeFontStyle(next);
  }, [fontStyle, changeFontStyle]);

  const toggleItalic = useCallback(() => {
    const next = fontStyle === "italic" ? "normal" : fontStyle === "bold" ? "bold italic" : fontStyle === "bold italic" ? "bold" : "italic";
    changeFontStyle(next);
  }, [fontStyle, changeFontStyle]);

  const toggleUnderline = useCallback(() => {
    if (textDecoration === "underline") changeTextDecoration("");
    else changeTextDecoration("underline");
  }, [textDecoration, changeTextDecoration]);

  const toggleStrikethrough = useCallback(() => {
    if (textDecoration === "line-through") changeTextDecoration("");
    else changeTextDecoration("line-through");
  }, [textDecoration, changeTextDecoration]);

  const isBold = fontStyle === "bold" || fontStyle === "bold italic";
  const isItalic = fontStyle === "italic" || fontStyle === "bold italic";

  return (
    <TooltipProvider delayDuration={300}>
    <div ref={containerRef} className="w-full h-screen overflow-hidden relative">
      {/* Title */}
      <div className="absolute left-2 top-4 z-10 flex items-start gap-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            {appearance}
            <input
              ref={titleRef} value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); titleRef.current?.blur(); }
                if (e.key === "Escape") { setTitleDraft(title); titleRef.current?.blur(); }
              }}
              className="text-3xl font-bold tracking-tight leading-[1.05] m-0 bg-transparent outline-none rounded-lg px-1.5 -ml-1.5 hover:bg-secondary/40 focus:bg-secondary/60 focus:ring-2 focus:ring-primary/30 transition-all max-w-[60vw]"
              aria-label="Note title"
            />
          </div>
          {relations}
        </div>
      </div>

      {/* Save status */}
      <div className={`absolute left-5 bottom-5 z-10 flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground ${PANEL}`}>
        {saving ? (
          <><Loader2Icon className="size-3 animate-spin" /> <span>Saving…</span></>
        ) : (
          <><CheckIcon className="size-3 text-emerald-500" /> <span>Saved</span></>
        )}
      </div>

      {/* Parent links */}
      {parents && <div className="absolute right-5 top-4 z-10">{parents}</div>}

      {/* Top toolbar */}
      <div className={`absolute left-1/2 -translate-x-1/2 top-4 z-10 flex gap-1 p-1.5 ${PANEL}`}>
        <ChromeButton icon={<Undo2Icon />} label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={undo} />
        <ChromeButton icon={<Redo2Icon />} label="Redo" shortcut="⌘Y" disabled={!canRedo} onClick={redo} />
        <div className="w-px bg-border mx-1" />
        <ChromeButton icon={<CopyIcon />} label="Copy" shortcut="⌘C" disabled={!hasSelection} onClick={copySelected} />
        <ChromeButton icon={<ClipboardPasteIcon />} label="Paste" shortcut="⌘V" onClick={pasteClipboard} />
        <ChromeButton icon={<Trash2Icon />} label="Delete" shortcut="Del" disabled={!hasSelection} onClick={deleteSelected} />
        <div className="w-px bg-border mx-1" />
        <ChromeButton icon={<BringToFrontIcon />} label="Bring to front" shortcut="]" disabled={!hasSelection} onClick={bringToFront} />
        <ChromeButton icon={<SendToBackIcon />} label="Send to back" shortcut="[" disabled={!hasSelection} onClick={sendToBack} />
        <div className="w-px bg-border mx-1" />
        <ChromeButton
          icon={<GroupIcon />} label="Group" shortcut="⌘G"
          disabled={!hasGroupableSelection} onClick={groupSelected}
        />
        <ChromeButton
          icon={<UngroupIcon />} label="Ungroup" shortcut="⌘⇧G"
          disabled={!hasGroupedShapes} onClick={ungroupSelected}
        />
        <div className="w-px bg-border mx-1" />
        <ChromeButton icon={<HistoryIcon />} label="Version history" onClick={onOpenHistory} />
        {onOpenGraph && <ChromeButton icon={<NetworkIcon />} label="Open note graph" onClick={onOpenGraph} />}
        {onDeleteNote && (
          <>
            <div className="w-px bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" onClick={() => setConfirmDeleteNote(true)}
                  aria-label="Delete note"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Delete note</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Zoom */}
      <div className={`absolute right-5 bottom-5 z-10 flex items-center gap-1 p-1.5 ${PANEL}`}>
        <ChromeButton icon={<ZoomOutIcon />} label="Zoom out" side="top" onClick={zoomOut} />
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={resetZoom} className="min-w-12 text-xs font-medium tabular-nums hover:bg-muted rounded-md py-1">
              {Math.round(scale * 100)}%
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Reset zoom</TooltipContent>
        </Tooltip>
        <ChromeButton icon={<ZoomInIcon />} label="Zoom in" side="top" onClick={zoomIn} />
      </div>

      {/* Left panel: contextual properties */}
      {showProps && (
        <div className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2 p-2 ${PANEL} max-h-[90vh] overflow-y-auto`}>

          {/* Stroke + fill colors */}
          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5 items-center">
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Stroke</span>
              {STROKE_COLORS.map((c) => (
                <Swatch key={c} value={c} active={color === c} onClick={() => changeColor(c)} title={c === "transparent" ? "No stroke" : c} />
              ))}
            </div>
            {showFill && (
              <div className="flex flex-col gap-1.5 items-center">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Fill</span>
                {FILL_COLORS.map((c) => (
                  <Swatch key={c} value={c} active={fillColor === c} onClick={() => changeFill(c)} title={c === "transparent" ? "No fill" : c} />
                ))}
              </div>
            )}
          </div>

          {/* Stroke width */}
          {showWidth && (
            <>
              <div className="h-px bg-border my-0.5" />
              <div className="grid grid-cols-2 gap-1.5 justify-items-center">
                {STROKE_WIDTHS.map((w) => (
                  <button key={w} onClick={() => changeStrokeWidth(w)} title={`Width ${w}`}
                    className={`flex items-center justify-center size-6 rounded-md hover:bg-muted ${strokeWidth === w ? "bg-secondary-foreground/20" : ""}`}>
                    <span className="rounded-full bg-foreground" style={{ width: Math.min(w, 18), height: Math.min(w, 18) }} />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Text formatting */}
          {showText && (
            <>
              {(showShapeProps || showFill || showWidth) && <div className="h-px bg-border my-0.5" />}

              {/* Bold / Italic / Underline / Strikethrough */}
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground text-center">Format</span>
              <div className="grid grid-cols-2 gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={toggleBold}
                      className={`flex items-center justify-center h-7 rounded-md font-bold text-sm hover:bg-muted ${isBold ? "bg-secondary-foreground/20 ring-1 ring-primary/40" : ""}`}
                    >
                      <BoldIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Bold</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={toggleItalic}
                      className={`flex items-center justify-center h-7 rounded-md text-sm italic hover:bg-muted ${isItalic ? "bg-secondary-foreground/20 ring-1 ring-primary/40" : ""}`}
                    >
                      <ItalicIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Italic</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={toggleUnderline}
                      className={`flex items-center justify-center h-7 rounded-md text-sm hover:bg-muted ${textDecoration === "underline" ? "bg-secondary-foreground/20 ring-1 ring-primary/40" : ""}`}
                    >
                      <UnderlineIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Underline</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={toggleStrikethrough}
                      className={`flex items-center justify-center h-7 rounded-md text-sm hover:bg-muted ${textDecoration === "line-through" ? "bg-secondary-foreground/20 ring-1 ring-primary/40" : ""}`}
                    >
                      <StrikethroughIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Strikethrough</TooltipContent>
                </Tooltip>
              </div>

              {/* Text align */}
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground text-center">Align</span>
              <div className="flex gap-1 justify-center">
                {(["left","center","right"] as const).map((a) => (
                  <Tooltip key={a}>
                    <TooltipTrigger asChild>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => changeTextAlign(a)}
                        className={`flex items-center justify-center size-7 rounded-md hover:bg-muted ${textAlign === a ? "bg-secondary-foreground/20 ring-1 ring-primary/40" : ""}`}
                      >
                        {a === "left" ? <AlignLeftIcon className="size-3.5" /> : a === "center" ? <AlignCenterIcon className="size-3.5" /> : <AlignRightIcon className="size-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{a === "left" ? "Left" : a === "center" ? "Center" : "Right"}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Fonts */}
              <div className="h-px bg-border my-0.5" />
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground text-center">Font</span>
              <div className="flex flex-col gap-1">
                {TEXT_FONTS.map((f) => (
                  <button key={f.value} onMouseDown={(e) => e.preventDefault()} onClick={() => changeFontFamily(f.value)}
                    title={f.label} style={{ fontFamily: f.value }}
                    className={`rounded-md px-2 py-1 text-sm text-left leading-none hover:bg-muted ${fontFamily === f.value ? "bg-secondary-foreground/20 ring-1 ring-primary/40" : ""}`}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Font size */}
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground text-center mt-0.5">Size</span>
              <div className="grid grid-cols-4 gap-1 justify-items-center">
                {FONT_SIZE_OPTIONS.map(({ label, value }) => (
                  <button key={value} onMouseDown={(e) => e.preventDefault()} onClick={() => changeFontSize(value)} title={`${label} (${value}px)`}
                    className={`flex items-center justify-center size-7 rounded-md text-xs font-medium hover:bg-muted ${fontSize === value ? "bg-secondary-foreground/20 ring-1 ring-primary/40" : ""}`}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Align objects (multi-select) */}
          {hasMultiSelection && (
            <>
              <div className="h-px bg-border my-0.5" />
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground text-center">Расположение</span>
              <div className="grid grid-cols-3 gap-1 justify-items-center">
                {[
                  { dir: "left" as const, icon: <AlignStartVerticalIcon className="size-3.5" />, label: "По левому краю" },
                  { dir: "centerV" as const, icon: <AlignCenterVerticalIcon className="size-3.5" />, label: "По центру (гор.)" },
                  { dir: "right" as const, icon: <AlignEndVerticalIcon className="size-3.5" />, label: "По правому краю" },
                  { dir: "top" as const, icon: <AlignStartHorizontalIcon className="size-3.5" />, label: "По верхнему краю" },
                  { dir: "centerH" as const, icon: <AlignCenterHorizontalIcon className="size-3.5" />, label: "По центру (верт.)" },
                  { dir: "bottom" as const, icon: <AlignEndHorizontalIcon className="size-3.5" />, label: "По нижнему краю" },
                ].map(({ dir, icon, label }) => (
                  <Tooltip key={dir}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => alignSelected(dir)}
                        className="flex items-center justify-center size-7 rounded-md hover:bg-muted transition-colors"
                      >
                        {icon}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Bottom-center tool palette */}
      <div className={`absolute left-1/2 -translate-x-1/2 bottom-5 z-10 flex items-center gap-1 p-1.5 ${PANEL}`}>
        {TOOLS.map(({ tool: t, icon, title }) => (
          <ChromeButton
            key={t} icon={icon} label={title} shortcut={TOOL_SHORTCUTS[t]}
            side="top" size="icon-lg" active={tool === t} onClick={() => changeTool(t)}
          />
        ))}
      </div>

      {/* Empty-canvas hint */}
      {showEmptyHint && (
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-center text-muted-foreground/70 select-none">
            <PencilIcon className="size-8 opacity-60" />
            <p className="text-sm font-medium">This canvas is empty</p>
            <p className="text-xs">
              Pick a tool below and start drawing — or press{" "}
              <Kbd className="bg-muted">R</Kbd> for a rectangle, <Kbd className="bg-muted">P</Kbd> to sketch.
            </p>
          </div>
        </div>
      )}

      {/* Inline text editor overlay */}
      {editingText && (
        <div style={{ position: "fixed", left: editingText.screenX, top: editingText.screenY, zIndex: 50 }}>
          <textarea
            ref={(el) => {
              textareaRef.current = el;
              if (!el) return;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
              el.style.width = "1ch";
              el.style.width = `${Math.max(el.scrollWidth, editingText.fontSize * scale * 0.7)}px`;
              requestAnimationFrame(() => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
            }}
            value={editingText.value}
            onChange={(e) => {
              updateEditingText(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
              el.style.width = "1ch";
              el.style.width = `${Math.max(el.scrollWidth, editingText.fontSize * scale * 0.7)}px`;
            }}
            onBlur={commitTextEditing}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                commitTextEditing();
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commitTextEditing();
              }
            }}
            style={{
              fontSize: `${editingText.fontSize * scale}px`,
              fontFamily: editingText.fontFamily,
              fontStyle: fontStyle === "italic" || fontStyle === "bold italic" ? "italic" : "normal",
              fontWeight: fontStyle === "bold" || fontStyle === "bold italic" ? "bold" : "normal",
              textDecoration: textDecoration,
              textAlign: textAlign as any,
              color,
              lineHeight: TEXT_LINE_HEIGHT,
              caretColor: color,
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              margin: 0,
              resize: "none",
              overflow: "hidden",
              display: "block",
              whiteSpace: "pre",
              boxShadow: "none",
            }}
          />
        </div>
      )}

      <Stage
        ref={stageRef}
        width={viewport.width}
        height={viewport.height}
        draggable={isDragging}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onDblClick={handleDblClick}
        style={{ cursor }}
      >
        <Layer listening={false}>
          {shapes.map((shape) =>
            editingText && shape.id === editingText.id ? null : (
              <ShapeNode key={shape.id} shape={shape} />
            )
          )}
        </Layer>

        <Layer>
          {draft && renderShape(draft, 0.85)}

          {/* Connector snap highlight */}
          {connectorSnap != null && (() => {
            const snapShape = shapes.find(s => s.id === connectorSnap);
            if (!snapShape) return null;
            const b = {
              x: Math.min(snapShape.x, snapShape.x + snapShape.width),
              y: Math.min(snapShape.y, snapShape.y + snapShape.height),
              width: Math.abs(snapShape.width),
              height: Math.abs(snapShape.height),
            };
            return (
              <Rect
                x={b.x - 6 / scale} y={b.y - 6 / scale}
                width={b.width + 12 / scale} height={b.height + 12 / scale}
                fill={colors.connectorSnap}
                stroke={colors.primary}
                strokeWidth={2 / scale}
                cornerRadius={6 / scale}
                listening={false}
                perfectDrawEnabled={false}
              />
            );
          })()}

          {selBox && (
            <Rect
              x={selBox.x} y={selBox.y} width={selBox.width} height={selBox.height}
              stroke={colors.primary} strokeWidth={1.5 / scale}
              dash={[6 / scale, 4 / scale]} cornerRadius={4 / scale}
              listening={false} perfectDrawEnabled={false}
            />
          )}

          {showHandles && selBox && getHandles(selBox).map((h) => {
            const size = 9 / scale;
            return (
              <Rect
                key={h.name}
                x={h.x - size / 2} y={h.y - size / 2} width={size} height={size}
                fill={colors.background} stroke={colors.primary} strokeWidth={1.5 / scale}
                cornerRadius={2 / scale} perfectDrawEnabled={false}
                onMouseDown={(e) => { e.cancelBubble = true; startResize(h.name, selBox); }}
                onMouseEnter={() => setCursor(HANDLE_CURSORS[h.name])}
                onMouseLeave={() => setCursor("default")}
              />
            );
          })}

          {tool === "select" && isDrawing && normalizedRect && (
            <Rect
              x={normalizedRect.x} y={normalizedRect.y}
              width={normalizedRect.width} height={normalizedRect.height}
              fill={colors.primaryFill} stroke={colors.primary}
              strokeWidth={1 / scale} dash={[4 / scale, 4 / scale]}
              listening={false} perfectDrawEnabled={false}
            />
          )}
        </Layer>
      </Stage>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={closeContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }} />
          <div
            className="fixed z-50 w-56 p-2 bg-popover text-popover-foreground dropborder rounded-xl shadow-xl flex flex-col gap-1 text-sm"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 240),
              top: Math.min(contextMenu.y, window.innerHeight - 360),
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {contextMenu.onShape ? (
              <>
                <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Stroke</div>
                <div className="flex gap-1 px-1 items-center flex-wrap">
                  {STROKE_COLORS.map((c) => (
                    <Swatch key={c} value={c} active={color === c} onClick={() => changeColor(c)} title={c === "transparent" ? "No stroke" : c} />
                  ))}
                </div>
                <div className="px-1 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Fill</div>
                <div className="flex gap-1 px-1 items-center flex-wrap">
                  {FILL_COLORS.map((c) => (
                    <Swatch key={c} value={c} active={fillColor === c} onClick={() => changeFill(c)} title={c === "transparent" ? "No fill" : c} />
                  ))}
                </div>
                <div className="px-1 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Width</div>
                <div className="flex gap-1 px-1 items-center">
                  {STROKE_WIDTHS.map((w) => (
                    <button key={w} onClick={() => changeStrokeWidth(w)} title={`Width ${w}`}
                      className={`flex items-center justify-center size-6 rounded-md hover:bg-muted ${strokeWidth === w ? "bg-secondary-foreground/20" : ""}`}>
                      <span className="rounded-full bg-foreground" style={{ width: Math.min(w, 16), height: Math.min(w, 16) }} />
                    </button>
                  ))}
                </div>
                <div className="h-px bg-border my-1" />
                <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted text-left" onClick={() => { bringToFront(); closeContextMenu(); }}>
                  <BringToFrontIcon className="size-4" /> Bring to front
                </button>
                <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted text-left" onClick={() => { sendToBack(); closeContextMenu(); }}>
                  <SendToBackIcon className="size-4" /> Send to back
                </button>
                <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted text-left" onClick={() => { duplicateSelected(); closeContextMenu(); }}>
                  <CopyIcon className="size-4" /> Duplicate
                </button>
                {selectedIds.length >= 2 && (
                  <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted text-left" onClick={() => { groupSelected(); closeContextMenu(); }}>
                    <GroupIcon className="size-4" /> Group
                  </button>
                )}
                {hasGroupedShapes && (
                  <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted text-left" onClick={() => { ungroupSelected(); closeContextMenu(); }}>
                    <UngroupIcon className="size-4" /> Ungroup
                  </button>
                )}
                <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-destructive/10 text-destructive text-left" onClick={() => { deleteSelected(); closeContextMenu(); }}>
                  <Trash2Icon className="size-4" /> Delete
                </button>
              </>
            ) : (
              <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted text-left" onClick={() => { pasteClipboard(); closeContextMenu(); }}>
                <ClipboardPasteIcon className="size-4" /> Paste
              </button>
            )}
          </div>
        </>
      )}

      {/* Delete note confirmation */}
      <AlertDialog open={confirmDeleteNote} onOpenChange={setConfirmDeleteNote}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              "{title || "Untitled note"}" will be permanently deleted. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { setConfirmDeleteNote(false); onDeleteNote?.(); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
