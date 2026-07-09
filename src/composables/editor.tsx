
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import type Konva from "konva";


export type Tool =
  | "hand"
  | "select"
  | "brush"
  | "eraser"
  | "rect"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "text"
  | "connector";

export type PointShapeType = "brush" | "line" | "arrow" | "connector";
export type BoxShapeType = "rect" | "diamond" | "ellipse" | "text";
export type ShapeType = PointShapeType | BoxShapeType;

export const TOOL_SHORTCUTS: Record<Tool, string> = {
  hand: "H",
  select: "V",
  rect: "R",
  diamond: "D",
  ellipse: "O",
  arrow: "A",
  line: "L",
  text: "T",
  brush: "P",
  eraser: "E",
  connector: "C",
};

const KEY_TO_TOOL: Record<string, Tool> = {
  h: "hand",
  v: "select",
  r: "rect",
  d: "diamond",
  o: "ellipse",
  a: "arrow",
  l: "line",
  t: "text",
  p: "brush",
  b: "brush",
  e: "eraser",
  c: "connector",
};

export const DEFAULT_COLORS = [
  "#1e1e1e",
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#f08c00",
  "#9c36b5",
  "#ffffff",
];

export const TEXT_FONT_FAMILY = "Caveat, cursive";
export const TEXT_LINE_HEIGHT = 1.25;
export const DEFAULT_FONT_SIZE = 20;

export const TEXT_FONTS: { label: string; value: string }[] = [
  { label: "Рукопись", value: "Caveat, cursive" },
  { label: "Sans", value: "Inter, system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "'JetBrains Mono', ui-monospace, monospace" },
];

export const FONT_SIZES = [16, 20, 28, 36];
export const FONT_SIZE_OPTIONS: { label: string; value: number }[] = [
  { label: "S", value: 16 },
  { label: "M", value: 20 },
  { label: "L", value: 28 },
  { label: "XL", value: 36 },
];

let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(
  text: string,
  fontSize: number,
  fontFamily: string = TEXT_FONT_FAMILY
): { width: number; height: number } {
  const lines = text.split("\n");
  const height = Math.max(1, lines.length) * fontSize * TEXT_LINE_HEIGHT;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  let width = 0;
  if (measureCtx) {
    measureCtx.font = `${fontSize}px ${fontFamily}`;
    for (const line of lines) {
      width = Math.max(width, measureCtx.measureText(line).width);
    }
  }
  return { width: Math.max(1, Math.ceil(width)), height };
}

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Shape {
  id: number;
  type: ShapeType;
  points: number[];
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textDecoration?: string;
  align?: string;
  groupId?: number;
  startShapeId?: number;
  endShapeId?: number;
}

const POINT_TYPES: ShapeType[] = ["brush", "line", "arrow", "connector"];
function isPointShape(type: ShapeType): boolean {
  return POINT_TYPES.includes(type);
}

function normalizeRect(r: Geometry): Geometry {
  return {
    x: Math.min(r.x, r.x + r.width),
    y: Math.min(r.y, r.y + r.height),
    width: Math.abs(r.width),
    height: Math.abs(r.height),
  };
}

function getLineBounds(points: number[]): Geometry {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxX = Math.max(maxX, points[i]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getShapeBounds(shape: Shape): Geometry {
  if (isPointShape(shape.type) && shape.points.length >= 2) {
    return getLineBounds(shape.points);
  }
  return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
}

function moveShape(shape: Shape, dx: number, dy: number): Shape {
  if (isPointShape(shape.type)) {
    const points = shape.points.map((p, i) => (i % 2 === 0 ? p + dx : p + dy));
    return { ...shape, points, ...getLineBounds(points) };
  }
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
}

function transformShape(shape: Shape, B: Geometry, Bp: Geometry): Shape {
  const sx = B.width === 0 ? 1 : Bp.width / B.width;
  const sy = B.height === 0 ? 1 : Bp.height / B.height;
  const mapX = (x: number) => Bp.x + (x - B.x) * sx;
  const mapY = (y: number) => Bp.y + (y - B.y) * sy;

  if (isPointShape(shape.type)) {
    const points = shape.points.map((p, i) => (i % 2 === 0 ? mapX(p) : mapY(p)));
    return { ...shape, points, ...getLineBounds(points) };
  }

  const next: Shape = {
    ...shape,
    x: mapX(shape.x),
    y: mapY(shape.y),
    width: shape.width * sx,
    height: shape.height * sy,
  };

  if (shape.type === "text") {
    next.fontSize = Math.max(4, (shape.fontSize ?? 24) * sy);
  }

  return next;
}

function getEdgePoint(shape: Shape, targetX: number, targetY: number): { x: number; y: number } {
  const b = isPointShape(shape.type) ? getLineBounds(shape.points) : normalizeRect({ x: shape.x, y: shape.y, width: shape.width, height: shape.height });
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: cx, y: cy };
  const hw = b.width / 2;
  const hh = b.height / 2;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ndx = dx / len;
  const ndy = dy / len;
  let t = Infinity;
  if (Math.abs(ndx) > 0.001) t = Math.min(t, hw / Math.abs(ndx));
  if (Math.abs(ndy) > 0.001) t = Math.min(t, hh / Math.abs(ndy));
  if (!isFinite(t)) return { x: cx, y: cy };
  return { x: cx + ndx * t, y: cy + ndy * t };
}

function refreshConnectors(shapes: Shape[]): Shape[] {
  const hasConnectors = shapes.some(s => s.type === "connector" && (s.startShapeId != null || s.endShapeId != null));
  if (!hasConnectors) return shapes;

  const shapeMap = new Map(shapes.map(s => [s.id, s]));

  return shapes.map(s => {
    if (s.type !== "connector") return s;
    if (s.startShapeId == null && s.endShapeId == null) return s;

    const startShape = s.startShapeId != null ? shapeMap.get(s.startShapeId) : null;
    const endShape = s.endShapeId != null ? shapeMap.get(s.endShapeId) : null;

    const startCenter = startShape
      ? { x: startShape.x + startShape.width / 2, y: startShape.y + startShape.height / 2 }
      : { x: s.points[0] ?? s.x, y: s.points[1] ?? s.y };
    const endCenter = endShape
      ? { x: endShape.x + endShape.width / 2, y: endShape.y + endShape.height / 2 }
      : { x: s.points[2] ?? s.x + s.width, y: s.points[3] ?? s.y + s.height };

    const startPt = startShape ? getEdgePoint(startShape, endCenter.x, endCenter.y) : startCenter;
    const endPt = endShape ? getEdgePoint(endShape, startCenter.x, startCenter.y) : endCenter;

    const pts = [startPt.x, startPt.y, endPt.x, endPt.y];
    return { ...s, points: pts, ...getLineBounds(pts) };
  });
}

function isShapeInsideRect(shape: Shape, rect: Geometry): boolean {
  const b = getShapeBounds(shape);
  const interLeft = Math.max(b.x, rect.x);
  const interTop = Math.max(b.y, rect.y);
  const interRight = Math.min(b.x + b.width, rect.x + rect.width);
  const interBottom = Math.min(b.y + b.height, rect.y + rect.height);
  const interWidth = Math.max(0, interRight - interLeft);
  const interHeight = Math.max(0, interBottom - interTop);
  const intersectionArea = interWidth * interHeight;
  const shapeArea = b.width * b.height;
  if (shapeArea === 0) {
    return interWidth >= 0 && interHeight >= 0 &&
      b.x <= rect.x + rect.width && b.x + b.width >= rect.x &&
      b.y <= rect.y + rect.height && b.y + b.height >= rect.y;
  }
  return intersectionArea / shapeArea > 0.05;
}

function isPointInsideRect(point: { x: number; y: number }, rect: Geometry): boolean {
  return (
    point.x >= rect.x && point.x <= rect.x + rect.width &&
    point.y >= rect.y && point.y <= rect.y + rect.height
  );
}

function isPointOnShape(shape: Shape, point: { x: number; y: number }, tolerance: number): boolean {
  const b = getShapeBounds(shape);
  const padded = { x: b.x - tolerance, y: b.y - tolerance, width: b.width + tolerance * 2, height: b.height + tolerance * 2 };
  return isPointInsideRect(point, padded);
}

function getSelectedBounds(shapes: Shape[], selectedIds: number[]): Geometry | null {
  const selected = shapes.filter((s) => selectedIds.includes(s.id));
  if (selected.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const shape of selected) {
    const b = getShapeBounds(shape);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface EditorOptions {
  noteId?: string | null;
  initialShapes?: Shape[];
  onShapesChange?: (shapes: Shape[]) => void;
}

function maxShapeId(shapes: Shape[]): number {
  return shapes.reduce((max, s) => Math.max(max, s.id), -1);
}

export const useEditor = (options: EditorOptions = {}) => {
  const stageRef = useRef<any>(null);

  const [shapes, setShapes] = useState<Shape[]>(() => options.initialShapes ?? []);
  const [tool, setTool] = useState<Tool>("hand");
  const [color, setColor] = useState<string>(DEFAULT_COLORS[0]);
  const [fillColor, setFillColor] = useState<string>("transparent");
  const [strokeWidth, setStrokeWidth] = useState<number>(5);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  const [fontFamily, setFontFamily] = useState<string>(TEXT_FONTS[0].value);
  const [fontStyle, setFontStyle] = useState<string>("normal");
  const [textDecoration, setTextDecoration] = useState<string>("");
  const [textAlign, setTextAlign] = useState<string>("left");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; onShape: boolean } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectionRect, setSelectionRect] = useState<Geometry | null>(null);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [editingText, setEditingText] = useState<{ id: number; screenX: number; screenY: number; value: string; fontSize: number; fontFamily: string } | null>(null);
  const [connectorSnap, setConnectorSnap] = useState<number | null>(null);
  const [scale, setScale] = useState<number>(1.0);

  const normalizedRect = selectionRect ? normalizeRect(selectionRect) : null;

  const shapesRef = useRef<Shape[]>(shapes);
  const selectedIdsRef = useRef<number[]>(selectedIds);
  const toolRef = useRef<Tool>(tool);
  const colorRef = useRef<string>(color);
  const fillColorRef = useRef<string>(fillColor);
  const strokeWidthRef = useRef<number>(strokeWidth);
  const fontSizeRef = useRef<number>(fontSize);
  const fontFamilyRef = useRef<string>(fontFamily);
  const fontStyleRef = useRef<string>(fontStyle);
  const textDecorationRef = useRef<string>(textDecoration);
  const textAlignRef = useRef<string>(textAlign);
  const draftRef = useRef<Shape | null>(draft);
  const contextMenuRef = useRef<typeof contextMenu>(contextMenu);
  const editingTextRef = useRef<typeof editingText>(editingText);
  const scaleRef = useRef<number>(scale);

  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { fillColorRef.current = fillColor; }, [fillColor]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);
  useEffect(() => { fontFamilyRef.current = fontFamily; }, [fontFamily]);
  useEffect(() => { fontStyleRef.current = fontStyle; }, [fontStyle]);
  useEffect(() => { textDecorationRef.current = textDecoration; }, [textDecoration]);
  useEffect(() => { textAlignRef.current = textAlign; }, [textAlign]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { contextMenuRef.current = contextMenu; }, [contextMenu]);
  useEffect(() => { editingTextRef.current = editingText; }, [editingText]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const isDrawing = useRef<boolean>(false);
  const moveStart = useRef<{ x: number; y: number } | null>(null);
  const moveIds = useRef<number[]>([]);
  const erasedDuringStroke = useRef<boolean>(false);
  const nextId = useRef<number>(maxShapeId(options.initialShapes ?? []) + 1);
  const nextGroupId = useRef<number>(1);
  const clipboard = useRef<Shape[]>([]);
  const resizeRef = useRef<{ handle: string; startBounds: Geometry; startShapes: Record<number, Shape> } | null>(null);
  const selectedBoundsRef = useRef<Geometry | null>(null);
  const connectorStartRef = useRef<{ shapeId: number | null; x: number; y: number } | null>(null);

  const moveRaf = useRef<number | null>(null);
  const pendingMove = useRef<{ x: number; y: number } | null>(null);

  const flushMove = () => {
    moveRaf.current = null;
    const relativePoint = pendingMove.current;
    pendingMove.current = null;
    if (!relativePoint || !moveStart.current) return;
    const dx = relativePoint.x - moveStart.current.x;
    const dy = relativePoint.y - moveStart.current.y;
    if (dx === 0 && dy === 0) return;
    const ids = moveIds.current;
    setShapes((prev) =>
      refreshConnectors(prev.map((s) => (ids.includes(s.id) ? moveShape(s, dx, dy) : s)))
    );
    moveStart.current = relativePoint;
  };

  const allocId = () => nextId.current++;

  const selectedBounds = useMemo(() => getSelectedBounds(shapes, selectedIds), [shapes, selectedIds]);
  useEffect(() => { selectedBoundsRef.current = selectedBounds; }, [selectedBounds]);

  const onShapesChange = options.onShapesChange;
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (skipFirstSave.current) { skipFirstSave.current = false; return; }
    onShapesChange?.(shapes);
  }, [shapes, onShapesChange]);

  const past = useRef<Shape[][]>([]);
  const future = useRef<Shape[][]>([]);
  const pendingSnapshot = useRef<Shape[] | null>(null);
  const [, forceRerender] = useState(0);

  const beginHistory = () => { pendingSnapshot.current = shapesRef.current; };
  const commitHistory = () => {
    if (pendingSnapshot.current && pendingSnapshot.current !== shapesRef.current) {
      past.current.push(pendingSnapshot.current);
      future.current = [];
      forceRerender((n) => n + 1);
    }
    pendingSnapshot.current = null;
  };
  const recordHistory = () => {
    past.current.push(shapesRef.current);
    future.current = [];
    forceRerender((n) => n + 1);
  };

  const undo = useCallback(() => {
    if (past.current.length === 0) return;
    future.current.push(shapesRef.current);
    const prev = refreshConnectors(past.current.pop()!);
    shapesRef.current = prev;
    setShapes(prev);
    setSelectedIds([]);
    forceRerender((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    if (future.current.length === 0) return;
    past.current.push(shapesRef.current);
    const next = refreshConnectors(future.current.pop()!);
    shapesRef.current = next;
    setShapes(next);
    setSelectedIds([]);
    forceRerender((n) => n + 1);
  }, []);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  const changeTool = (toolName: Tool) => {
    setTool(toolName);
    if (toolName !== "select") { setSelectedIds([]); setSelectionRect(null); }
    if (toolName !== "connector") setConnectorSnap(null);
  };

  const changeColor = useCallback((nextColor: string) => {
    setColor(nextColor);
    const ids = selectedIdsRef.current;
    if (ids.length > 0) {
      recordHistory();
      setShapes((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, stroke: nextColor } : s));
    }
  }, []);

  const changeFill = useCallback((fill: string) => {
    setFillColor(fill);
    const ids = selectedIdsRef.current;
    if (ids.length > 0) {
      recordHistory();
      setShapes((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, fill } : s));
    }
  }, []);

  const changeStrokeWidth = useCallback((width: number) => {
    setStrokeWidth(width);
    const ids = selectedIdsRef.current;
    if (ids.length > 0) {
      recordHistory();
      setShapes((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, strokeWidth: width } : s));
    }
  }, []);

  const changeFontSize = useCallback((size: number) => {
    setFontSize(size);
    const editing = editingTextRef.current;
    if (editing) {
      setEditingText((prev) => prev ? { ...prev, fontSize: size } : prev);
      setShapes((prev) => prev.map((s) => s.id === editing.id && s.type === "text" ? { ...s, fontSize: size } : s));
      return;
    }
    const ids = selectedIdsRef.current;
    const hasText = shapesRef.current.some((s) => ids.includes(s.id) && s.type === "text");
    if (hasText) {
      recordHistory();
      setShapes((prev) => prev.map((s) => {
        if (!ids.includes(s.id) || s.type !== "text") return s;
        const { width, height } = measureText(s.text ?? "", size, s.fontFamily);
        return { ...s, fontSize: size, width, height };
      }));
    }
  }, []);

  const changeFontFamily = useCallback((family: string) => {
    setFontFamily(family);
    const editing = editingTextRef.current;
    if (editing) {
      setEditingText((prev) => prev ? { ...prev, fontFamily: family } : prev);
      setShapes((prev) => prev.map((s) => s.id === editing.id && s.type === "text" ? { ...s, fontFamily: family } : s));
      return;
    }
    const ids = selectedIdsRef.current;
    const hasText = shapesRef.current.some((s) => ids.includes(s.id) && s.type === "text");
    if (hasText) {
      recordHistory();
      setShapes((prev) => prev.map((s) => {
        if (!ids.includes(s.id) || s.type !== "text") return s;
        const { width, height } = measureText(s.text ?? "", s.fontSize ?? DEFAULT_FONT_SIZE, family);
        return { ...s, fontFamily: family, width, height };
      }));
    }
  }, []);

  const changeFontStyle = useCallback((style: string) => {
    setFontStyle(style);
    const ids = selectedIdsRef.current;
    if (ids.length > 0) {
      recordHistory();
      setShapes((prev) => prev.map((s) => ids.includes(s.id) && s.type === "text" ? { ...s, fontStyle: style } : s));
    }
  }, []);

  const changeTextDecoration = useCallback((decoration: string) => {
    setTextDecoration(decoration);
    const ids = selectedIdsRef.current;
    if (ids.length > 0) {
      recordHistory();
      setShapes((prev) => prev.map((s) => ids.includes(s.id) && s.type === "text" ? { ...s, textDecoration: decoration } : s));
    }
  }, []);

  const changeTextAlign = useCallback((align: string) => {
    setTextAlign(align);
    const ids = selectedIdsRef.current;
    if (ids.length > 0) {
      recordHistory();
      setShapes((prev) => prev.map((s) => ids.includes(s.id) && s.type === "text" ? { ...s, align } : s));
    }
    const editing = editingTextRef.current;
    if (editing) {
      setShapes((prev) => prev.map((s) => s.id === editing.id && s.type === "text" ? { ...s, align } : s));
    }
  }, []);

  // ---- Clipboard / delete ----
  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    recordHistory();
    setShapes((prev) => prev.filter((s) => !ids.includes(s.id)));
    setSelectedIds([]);
  }, []);

  const copySelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    clipboard.current = shapesRef.current
      .filter((s) => ids.includes(s.id))
      .map((s) => ({ ...s, points: [...s.points] }));
  }, []);

  const pasteClipboard = useCallback(() => {
    if (clipboard.current.length === 0) return;
    const offset = 20;
    const pasted = clipboard.current.map((s) => {
      const moved = moveShape({ ...s, points: [...s.points] }, offset, offset);
      return { ...moved, id: allocId(), groupId: undefined, startShapeId: undefined, endShapeId: undefined };
    });
    recordHistory();
    setShapes((prev) => refreshConnectors([...prev, ...pasted]));
    setSelectedIds(pasted.map((s) => s.id));
    clipboard.current = pasted.map((s) => ({ ...s, points: [...s.points] }));
    setTool("select");
  }, []);

  const cutSelected = useCallback(() => {
    copySelected();
    deleteSelected();
  }, [copySelected, deleteSelected]);

  const duplicateSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    const source = shapesRef.current.filter((s) => ids.includes(s.id));
    if (source.length === 0) return;
    const dupes = source.map((s) => {
      const moved = moveShape({ ...s, points: [...s.points] }, 20, 20);
      return { ...moved, id: allocId(), groupId: undefined, startShapeId: undefined, endShapeId: undefined };
    });
    recordHistory();
    setShapes((prev) => [...prev, ...dupes]);
    setSelectedIds(dupes.map((s) => s.id));
  }, []);

  // ---- Z-order ----
  const bringToFront = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    recordHistory();
    setShapes((prev) => {
      const sel = prev.filter((s) => ids.includes(s.id));
      const rest = prev.filter((s) => !ids.includes(s.id));
      return [...rest, ...sel];
    });
  }, []);

  const sendToBack = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    recordHistory();
    setShapes((prev) => {
      const sel = prev.filter((s) => ids.includes(s.id));
      const rest = prev.filter((s) => !ids.includes(s.id));
      return [...sel, ...rest];
    });
  }, []);

  // ---- Group / Ungroup ----
  const groupSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length < 2) return;
    const gid = nextGroupId.current++;
    recordHistory();
    setShapes((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, groupId: gid } : s));
  }, []);

  const ungroupSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    const groupIds = new Set(
      shapesRef.current.filter(s => ids.includes(s.id) && s.groupId != null).map(s => s.groupId!)
    );
    if (groupIds.size === 0) return;
    recordHistory();
    setShapes((prev) => prev.map((s) =>
      s.groupId != null && groupIds.has(s.groupId) ? { ...s, groupId: undefined } : s
    ));
  }, []);

  // ---- Align selected shapes ----
  const alignSelected = useCallback((direction: "left" | "right" | "top" | "bottom" | "centerH" | "centerV") => {
    const ids = selectedIdsRef.current;
    if (ids.length < 2) return;
    const selected = shapesRef.current.filter(s => ids.includes(s.id));
    const bounds = selected.map(s => getShapeBounds(s));
    const minX = Math.min(...bounds.map(b => b.x));
    const maxX = Math.max(...bounds.map(b => b.x + b.width));
    const minY = Math.min(...bounds.map(b => b.y));
    const maxY = Math.max(...bounds.map(b => b.y + b.height));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    recordHistory();
    setShapes((prev) =>
      refreshConnectors(prev.map(s => {
        if (!ids.includes(s.id)) return s;
        const b = getShapeBounds(s);
        let dx = 0, dy = 0;
        switch (direction) {
          case "left": dx = minX - b.x; break;
          case "right": dx = maxX - (b.x + b.width); break;
          case "top": dy = minY - b.y; break;
          case "bottom": dy = maxY - (b.y + b.height); break;
          case "centerH": dy = centerY - (b.y + b.height / 2); break;
          case "centerV": dx = centerX - (b.x + b.width / 2); break;
        }
        return dx === 0 && dy === 0 ? s : moveShape(s, dx, dy);
      }))
    );
  }, []);

  // ---- Nudge ----
  const nudgeSelected = (dx: number, dy: number) => {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    recordHistory();
    setShapes((prev) => refreshConnectors(prev.map((s) => ids.includes(s.id) ? moveShape(s, dx, dy) : s)));
  };

  // ---- Resize ----
  const startResize = (handle: string, bounds?: Geometry) => {
    const b = bounds ?? selectedBoundsRef.current;
    if (!b) return;
    isDrawing.current = true;
    beginHistory();
    const startShapes: Record<number, Shape> = {};
    for (const s of shapesRef.current) {
      if (selectedIdsRef.current.includes(s.id)) startShapes[s.id] = s;
    }
    resizeRef.current = { handle, startBounds: b, startShapes };
  };

  const applyResize = (point: { x: number; y: number }, keepAspect: boolean) => {
    const data = resizeRef.current;
    if (!data) return;
    const { handle, startBounds: B, startShapes } = data;
    let left = B.x, top = B.y, right = B.x + B.width, bottom = B.y + B.height;
    if (handle.includes("w")) left = point.x;
    if (handle.includes("e")) right = point.x;
    if (handle.includes("n")) top = point.y;
    if (handle.includes("s")) bottom = point.y;
    const MIN = 5 / scale;
    if (right - left < MIN) { if (handle.includes("w")) left = right - MIN; else right = left + MIN; }
    if (bottom - top < MIN) { if (handle.includes("n")) top = bottom - MIN; else bottom = top + MIN; }
    const isCorner = handle.length === 2;
    if (keepAspect && isCorner && B.width > 0 && B.height > 0) {
      const targetW = right - left, targetH = bottom - top, ratio = B.width / B.height;
      let w = targetW, h = targetH;
      if (targetW / targetH > ratio) w = targetH * ratio; else h = targetW / ratio;
      if (handle.includes("w")) left = right - w; else right = left + w;
      if (handle.includes("n")) top = bottom - h; else bottom = top + h;
    }
    const Bp: Geometry = { x: left, y: top, width: right - left, height: bottom - top };
    setShapes((prev) =>
      refreshConnectors(prev.map((s) => startShapes[s.id] ? transformShape(startShapes[s.id], B, Bp) : s))
    );
  };

  // ---- Coordinates ----
  const getRelativePointer = (): { x: number; y: number } | null => {
    const stage = stageRef.current?.getStage?.() ?? stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return stage.getAbsoluteTransform().copy().invert().point(pos);
  };

  const relativeToScreen = (p: { x: number; y: number }): { x: number; y: number } => {
    const stage = stageRef.current?.getStage?.() ?? stageRef.current;
    if (!stage) return p;
    const container = stage.container().getBoundingClientRect();
    const abs = stage.getAbsoluteTransform().copy().point(p);
    return { x: abs.x + container.left, y: abs.y + container.top };
  };

  // ---- Text editing (text tool) ----
  const startTextEditing = (relativePoint: { x: number; y: number }, existing?: Shape) => {
    const fs = existing?.fontSize ?? fontSizeRef.current;
    const ff = existing?.fontFamily ?? fontFamilyRef.current;
    const id = existing?.id ?? allocId();

    if (existing?.fontSize) setFontSize(existing.fontSize);
    if (existing?.fontFamily) setFontFamily(existing.fontFamily);
    if (existing?.fontStyle) setFontStyle(existing.fontStyle);
    if (existing?.textDecoration !== undefined) setTextDecoration(existing.textDecoration ?? "");
    if (existing?.align) setTextAlign(existing.align);

    // Excalidraw places the click point at the vertical middle of the first line
    const topY = relativePoint.y - (fs * TEXT_LINE_HEIGHT) / 2;

    if (!existing) {
      const shape: Shape = {
        id, type: "text", points: [],
        x: relativePoint.x, y: topY,
        width: 10, height: fs * TEXT_LINE_HEIGHT,
        stroke: colorRef.current, strokeWidth: 1,
        fill: colorRef.current, text: "",
        fontSize: fs, fontFamily: ff,
        fontStyle: fontStyleRef.current,
        textDecoration: textDecorationRef.current,
        align: textAlignRef.current,
      };
      recordHistory();
      setShapes((prev) => [...prev, shape]);
    }

    const anchor = existing ? { x: existing.x, y: existing.y } : { x: relativePoint.x, y: topY };
    const screen = relativeToScreen(anchor);
    setEditingText({ id, screenX: screen.x, screenY: screen.y, value: existing?.text ?? "", fontSize: fs, fontFamily: ff });
  };

  const updateEditingText = (value: string) => {
    setEditingText((prev) => prev ? { ...prev, value } : prev);
  };

  const commitTextEditing = () => {
    const editing = editingText;
    setEditingText(null);
    if (!editing) return;

    const value = editing.value;
    setShapes((prev) => {
      if (value.trim() === "") return prev.filter((s) => s.id !== editing.id);
      const target = prev.find((s) => s.id === editing.id);
      const fs = target?.fontSize ?? DEFAULT_FONT_SIZE;
      const { width, height } = measureText(value, fs, target?.fontFamily);
      return prev.map((s) =>
        s.id === editing.id ? { ...s, text: value, width, height, fontStyle: fontStyleRef.current, textDecoration: textDecorationRef.current, align: textAlignRef.current } : s
      );
    });
  };

  // ---- Eraser ----
  const eraseAtPoint = (point: { x: number; y: number }) => {
    const tolerance = (strokeWidthRef.current + 6) / scale;
    const hit = shapesRef.current.filter((s) => isPointOnShape(s, point, tolerance));
    if (hit.length === 0) return;
    const hitIds = new Set(hit.map((s) => s.id));
    erasedDuringStroke.current = true;
    setShapes((prev) => prev.filter((s) => !hitIds.has(s.id)));
  };

  // ---- Connector helpers ----
  const hitShapeForConnector = (point: { x: number; y: number }): Shape | null => {
    const tolerance = Math.max(16, 20 / scale);
    return [...shapesRef.current]
      .filter(s => s.type !== "connector" && s.type !== "brush" && s.type !== "line")
      .reverse()
      .find(s => isPointOnShape(s, point, tolerance)) ?? null;
  };

  // ---- Mouse handling ----
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    if (contextMenuRef.current) setContextMenu(null);
    if (e.evt.button !== 0) return;
    if (editingText) { commitTextEditing(); return; }

    isDrawing.current = true;

    if (tool === "hand") { setIsDragging(true); stage.startDrag(); return; }

    const relativePoint = getRelativePointer();
    if (!relativePoint) return;

    if (tool === "connector") {
      const hitShape = hitShapeForConnector(relativePoint);
      const startX = hitShape ? hitShape.x + hitShape.width / 2 : relativePoint.x;
      const startY = hitShape ? hitShape.y + hitShape.height / 2 : relativePoint.y;
      connectorStartRef.current = { shapeId: hitShape?.id ?? null, x: startX, y: startY };
      const base: Shape = {
        id: allocId(), type: "connector", points: [startX, startY, startX, startY],
        x: startX, y: startY, width: 0, height: 0,
        stroke: colorRef.current, strokeWidth: strokeWidthRef.current,
        fill: "transparent",
        startShapeId: hitShape?.id,
      };
      setDraft(base);
      draftRef.current = base;
      return;
    }

    if (tool === "select") {
      const shiftKey = e.evt.shiftKey;
      if (!shiftKey && selectedBounds && isPointInsideRect(relativePoint, selectedBounds)) {
        beginHistory();
        moveStart.current = relativePoint;
        moveIds.current = [...selectedIdsRef.current];
        return;
      }
      const tolerance = 6 / scale;
      const hit = [...shapesRef.current].reverse().find((s) => isPointOnShape(s, relativePoint, tolerance));
      if (hit) {
        // Expand to group if needed
        let groupShapeIds: number[] = hit.groupId != null
          ? shapesRef.current.filter(s => s.groupId === hit.groupId).map(s => s.id)
          : [hit.id];

        let nextSelected: number[];
        if (shiftKey) {
          const allIn = groupShapeIds.every(id => selectedIdsRef.current.includes(id));
          nextSelected = allIn
            ? selectedIdsRef.current.filter(id => !groupShapeIds.includes(id))
            : [...new Set([...selectedIdsRef.current, ...groupShapeIds])];
        } else {
          nextSelected = groupShapeIds;
        }
        setSelectedIds(nextSelected);
        selectedIdsRef.current = nextSelected;
        if (nextSelected.includes(hit.id)) {
          beginHistory();
          moveStart.current = relativePoint;
          moveIds.current = nextSelected;
        }
        return;
      }
      if (!shiftKey) setSelectedIds([]);
      setSelectionRect({ x: relativePoint.x, y: relativePoint.y, width: 0, height: 0 });
      return;
    }

    if (tool === "eraser") {
      beginHistory();
      erasedDuringStroke.current = false;
      eraseAtPoint(relativePoint);
      return;
    }

    if (tool === "text") {
      isDrawing.current = false;
      startTextEditing(relativePoint);
      return;
    }

    const base: Shape = {
      id: allocId(), type: tool as ShapeType, points: [],
      x: relativePoint.x, y: relativePoint.y, width: 0, height: 0,
      stroke: colorRef.current, strokeWidth: strokeWidthRef.current,
      fill: isPointShape(tool as ShapeType) ? "transparent" : fillColorRef.current,
    };
    if (isPointShape(tool as ShapeType)) base.points = [relativePoint.x, relativePoint.y];
    setDraft(base);
    draftRef.current = base;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDrawing.current) {
      // Hover snap preview for connector tool
      if (toolRef.current === "connector") {
        const relativePoint = getRelativePointer();
        if (relativePoint) {
          const hit = hitShapeForConnector(relativePoint);
          setConnectorSnap(hit?.id ?? null);
        }
      }
      return;
    }

    const relativePoint = getRelativePointer();
    if (!relativePoint) return;
    const currentTool = toolRef.current;

    if (currentTool === "hand") return;
    if (currentTool === "eraser") { eraseAtPoint(relativePoint); return; }

    if (currentTool === "connector") {
      const current = draftRef.current;
      if (!current) return;
      const hit = hitShapeForConnector(relativePoint);
      setConnectorSnap(hit?.id ?? null);
      const endX = hit ? hit.x + hit.width / 2 : relativePoint.x;
      const endY = hit ? hit.y + hit.height / 2 : relativePoint.y;
      const start = connectorStartRef.current;
      const pts = [start?.x ?? current.points[0], start?.y ?? current.points[1], endX, endY];
      const updated = { ...current, points: pts, ...getLineBounds(pts) };
      setDraft(updated);
      draftRef.current = updated;
      return;
    }

    if (currentTool === "select") {
      if (resizeRef.current) { applyResize(relativePoint, e.shiftKey); return; }
      if (moveStart.current) {
        pendingMove.current = relativePoint;
        if (moveRaf.current === null) moveRaf.current = requestAnimationFrame(flushMove);
      } else {
        setSelectionRect((prev) => {
          if (!prev) return prev;
          return { x: prev.x, y: prev.y, width: relativePoint.x - prev.x, height: relativePoint.y - prev.y };
        });
      }
      return;
    }

    const current = draftRef.current;
    if (!current) return;

    let updated: Shape;
    if (current.type === "brush") {
      const n = current.points.length;
      const lastX = current.points[n - 2], lastY = current.points[n - 1];
      const minDist = 2 / scale;
      if (Math.hypot(relativePoint.x - lastX, relativePoint.y - lastY) < minDist) return;
      const points = current.points.concat([relativePoint.x, relativePoint.y]);
      updated = { ...current, points, ...getLineBounds(points) };
    } else if (current.type === "line" || current.type === "arrow") {
      let endX = relativePoint.x, endY = relativePoint.y;
      if (e.shiftKey) {
        const adx = Math.abs(endX - current.points[0]), ady = Math.abs(endY - current.points[1]);
        if (adx > ady) endY = current.points[1]; else endX = current.points[0];
      }
      const points = [current.points[0], current.points[1], endX, endY];
      updated = { ...current, points, ...getLineBounds(points) };
    } else {
      let width = relativePoint.x - current.x, height = relativePoint.y - current.y;
      if (e.shiftKey) {
        const size = Math.max(Math.abs(width), Math.abs(height));
        width = Math.sign(width || 1) * size;
        height = Math.sign(height || 1) * size;
      }
      updated = { ...current, width, height };
    }

    setDraft(updated);
    draftRef.current = updated;
  };

  const handleMouseUp = () => {
    const currentTool = toolRef.current;

    if (currentTool === "hand") { setIsDragging(false); isDrawing.current = false; return; }

    if (currentTool === "eraser") {
      if (erasedDuringStroke.current) commitHistory(); else pendingSnapshot.current = null;
      erasedDuringStroke.current = false;
      isDrawing.current = false;
      return;
    }

    if (currentTool === "connector") {
      const current = draftRef.current;
      if (current) {
        const relativePoint = getRelativePointer();
        const endShape = relativePoint ? hitShapeForConnector(relativePoint) : null;
        const startRef = connectorStartRef.current;
        const pts = current.points;
        const meaningful = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) > 10;
        if (meaningful) {
          const connector: Shape = {
            ...current,
            startShapeId: startRef?.shapeId ?? undefined,
            endShapeId: endShape?.id,
          };
          recordHistory();
          setShapes((prev) => refreshConnectors([...prev, connector]));
        }
      }
      setDraft(null);
      draftRef.current = null;
      connectorStartRef.current = null;
      setConnectorSnap(null);
      isDrawing.current = false;
      return;
    }

    if (currentTool === "select") {
      if (resizeRef.current) {
        commitHistory();
        resizeRef.current = null;
      } else if (moveStart.current) {
        if (moveRaf.current !== null) { cancelAnimationFrame(moveRaf.current); flushMove(); }
        commitHistory();
        moveStart.current = null;
        moveIds.current = [];
      } else if (selectionRect) {
        const rect = normalizeRect(selectionRect);
        const hasArea = rect.width > 2 || rect.height > 2;
        if (hasArea) {
          const selected = shapesRef.current.filter((s) => isShapeInsideRect(s, rect)).map((s) => s.id);
          // Expand to full groups
          const groupIds = new Set(
            shapesRef.current.filter(s => selected.includes(s.id) && s.groupId != null).map(s => s.groupId!)
          );
          const expanded = new Set(selected);
          if (groupIds.size > 0) {
            shapesRef.current.forEach(s => { if (s.groupId != null && groupIds.has(s.groupId)) expanded.add(s.id); });
          }
          setSelectedIds([...expanded]);
        }
      }
      setSelectionRect(null);
      isDrawing.current = false;
      return;
    }

    const current = draftRef.current;
    if (current) {
      const b = getShapeBounds(current);
      const meaningful = current.type === "brush" ? current.points.length >= 4 : b.width !== 0 || b.height !== 0;
      if (meaningful) {
        let finalShape = current;
        if (!isPointShape(current.type)) finalShape = { ...current, ...normalizeRect(current) };
        recordHistory();
        setShapes((prev) => [...prev, finalShape]);
      }
    }
    setDraft(null);
    draftRef.current = null;
    isDrawing.current = false;
  };

  const handleContextMenu = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const relativePoint = getRelativePointer();
    if (!relativePoint) return;
    const tolerance = 6 / scale;
    const hit = [...shapesRef.current].reverse().find((s) => isPointOnShape(s, relativePoint, tolerance));
    if (hit) {
      if (!selectedIdsRef.current.includes(hit.id)) {
        setSelectedIds([hit.id]);
        selectedIdsRef.current = [hit.id];
      }
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, onShape: true });
    } else {
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, onShape: false });
    }
  };

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    if (editingText) return;
    const relativePoint = getRelativePointer();
    if (!relativePoint) return;
    const tolerance = 6 / scale;

    // Double-click on text shape → re-edit it
    const textHit = [...shapesRef.current].reverse().find(
      (s) => s.type === "text" && isPointOnShape(s, relativePoint, tolerance)
    );
    if (textHit) {
      setSelectedIds([]);
      selectedIdsRef.current = [];
      startTextEditing({ x: textHit.x, y: textHit.y }, textHit);
    }
  };

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (typing) return;

      if (mod && e.shiftKey && key === "z") { e.preventDefault(); redo(); }
      else if (mod && key === "z") { e.preventDefault(); undo(); }
      else if (mod && key === "y") { e.preventDefault(); redo(); }
      else if (mod && key === "c") { e.preventDefault(); copySelected(); }
      else if (mod && key === "x") { e.preventDefault(); cutSelected(); }
      else if (mod && key === "v") { e.preventDefault(); pasteClipboard(); }
      else if (mod && key === "d") { e.preventDefault(); duplicateSelected(); }
      else if (mod && key === "g" && e.shiftKey) { e.preventDefault(); ungroupSelected(); }
      else if (mod && key === "g") { e.preventDefault(); groupSelected(); }
      else if (mod && key === "a") {
        e.preventDefault();
        if (toolRef.current === "select") setSelectedIds(shapesRef.current.map((s) => s.id));
      }
      else if (key === "delete" || key === "backspace") { e.preventDefault(); deleteSelected(); }
      else if (key === "]") { e.preventDefault(); bringToFront(); }
      else if (key === "[") { e.preventDefault(); sendToBack(); }
      else if (["arrowup","arrowdown","arrowleft","arrowright"].includes(key)) {
        if (selectedIdsRef.current.length === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        nudgeSelected(
          key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
          key === "arrowup" ? -step : key === "arrowdown" ? step : 0,
        );
      }
      else if (key === "escape") {
        setSelectedIds([]); setSelectionRect(null); setDraft(null);
        draftRef.current = null; setContextMenu(null); setConnectorSnap(null);
      }
      else if (!mod && KEY_TO_TOOL[key]) { e.preventDefault(); changeTool(KEY_TO_TOOL[key]); }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  });

  // ---- Zoom / pan ----
  const zoomTo = useCallback((target: number) => {
    const stage = stageRef.current?.getStage?.() ?? stageRef.current;
    if (!stage) return;
    const clamped = Math.max(0.2, Math.min(4, target));
    const oldScale = stage.scaleX();
    const screen = { x: stage.width() / 2, y: stage.height() / 2 };
    const worldCenter = { x: (screen.x - stage.x()) / oldScale, y: (screen.y - stage.y()) / oldScale };
    stage.scale({ x: clamped, y: clamped });
    stage.position({ x: screen.x - worldCenter.x * clamped, y: screen.y - worldCenter.y * clamped });
    setScale(clamped);
  }, []);

  const zoomIn = useCallback(() => zoomTo(scale * 1.2), [zoomTo, scale]);
  const zoomOut = useCallback(() => zoomTo(scale / 1.2), [zoomTo, scale]);
  const resetZoom = useCallback(() => {
    const stage = stageRef.current?.getStage?.() ?? stageRef.current;
    if (!stage) return;
    stage.scale({ x: 1, y: 1 }); stage.position({ x: 0, y: 0 }); setScale(1);
  }, []);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const isZooming = e.evt.ctrlKey || e.evt.metaKey;
    if (isZooming) {
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
      const factor = 1 - e.evt.deltaY * 0.008;
      const newScale = oldScale * factor;
      if (newScale < 0.5 || newScale > 2) return;
      setScale(newScale);
      const boundedScale = Math.max(0.1, Math.min(10, newScale));
      stage.scale({ x: boundedScale, y: boundedScale });
      stage.position({ x: pointer.x - mousePointTo.x * boundedScale, y: pointer.y - mousePointTo.y * boundedScale });
    } else {
      stage.position({ x: stage.x() - e.evt.deltaX, y: stage.y() - e.evt.deltaY });
    }
  };

  return {
    stageRef, shapes, draft, isDragging, isDrawing, selectionRect,
    selectedBounds, selectedIds, normalizedRect, tool, scale,
    color, fillColor, strokeWidth, fontSize, fontFamily,
    fontStyle, textDecoration, textAlign,
    editingText, contextMenu, connectorSnap,
    canUndo, canRedo,
    changeTool, changeColor, changeFill, changeStrokeWidth, changeFontSize, changeFontFamily,
    changeFontStyle, changeTextDecoration, changeTextAlign,
    handleMouseDown, handleMouseUp, handleMouseMove, handleContextMenu,
    handleDblClick, closeContextMenu, handleWheel,
    redo, undo, deleteSelected, copySelected, pasteClipboard, cutSelected, duplicateSelected,
    updateEditingText, commitTextEditing,
    bringToFront, sendToBack, startResize,
    groupSelected, ungroupSelected, alignSelected,
    zoomIn, zoomOut, resetZoom,
  };
};
