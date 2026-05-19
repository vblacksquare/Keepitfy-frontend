import { useRef, useState, useEffect } from "react";
import { Stage, Layer, Line, Rect, Transformer } from "react-konva";
import type Konva from "konva";

import {
  PencilIcon,
  HandIcon,
  MousePointerIcon,
  SquareIcon,
  DiamondIcon,
  CircleIcon,
  MoveRightIcon,
  MinusIcon,
  TypeIcon,
  TrashIcon
} from "lucide-react"

import {
  Button
} from "@/components/ui/button"

type Tool = "brush" | "hand" | "eraser" | "select";

type LineType = {
  id: string;
  points: number[];
  stroke: string;
  strokeWidth: number;
  isEraser?: boolean;
};

export default function Dashboard() {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const [tool, setTool] = useState<Tool>("brush");

  const [lines, setLines] = useState<LineType[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [history, setHistory] = useState<LineType[][]>([]);
  const [redoStack, setRedoStack] = useState<LineType[][]>([]);

  const addHistory = (newLines: LineType[]) => {
    setHistory((h) => [...h, lines]);
    setRedoStack([]);
    setLines(newLines);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === "hand") return;

    const stage = stageRef.current;
    if (!stage) return;

    const point = stage.getPointerPosition();
    if (!point) return;

    const id = String(Date.now());

    if (tool === "brush" || tool === "eraser") {
      const newLine: LineType = {
        id,
        points: [point.x, point.y],
        stroke: "white",
        strokeWidth: tool === "eraser" ? 20 : 4,
        isEraser: tool === "eraser",
      };

      setLines((prev) => [...prev, newLine]);
      setIsDrawing(true);
    }
  };

  const handleMouseMove = () => {
    if (!isDrawing) return;
    if (tool !== "brush" && tool !== "eraser") return;

    const stage = stageRef.current;
    if (!stage) return;

    const point = stage.getPointerPosition();
    if (!point) return;

    setLines((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;

      const updated = {
        ...last,
        points: [...last.points, point.x, point.y],
      };

      return [...prev.slice(0, -1), updated];
    });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleUndo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;

      const prev = h[h.length - 1];
      setRedoStack((r) => [...r, lines]);
      setLines(prev);

      return h.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((r) => {
      if (r.length === 0) return r;

      const next = r[r.length - 1];
      setHistory((h) => [...h, lines]);
      setLines(next);

      return r.slice(0, -1);
    });
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    if (!e.evt.ctrlKey) return;

    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const scaleBy = 1.05;
    const oldScale = stage.scaleX();

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    stage.position(newPos);
    stage.batchDraw();
  };

  return (
    <div className="w-screen h-screen overflow-hidden">
      <div className="absolute left-2 top-5 z-10 p-2">
        <div className="flex">
          <p className="inline-block text-3xl font-bold leading-[0.9] m-0 bg-primary/40 backdrop-blur-xs bg-clip-text">
            Note name
          </p>

          <div className="flex-1"></div>

        </div>

        <div className="flex gap-2">
          <p className="text-l font-bold text-muted-foreground">#ebalo</p>
          <p className="text-l font-bold text-muted-foreground">#hui</p>
          <p className="text-l font-bold text-muted-foreground">#вся-хуйня</p>
        </div>

      </div>

      <div className="absolute top-1/2 -translate-y-1/2 right-5 z-10 flex flex-col gap-1 p-2 bg-primary-foreground/60 dropborder rounded-xl shadow-lg">
        <Button size="icon-lg" variant="outline" onClick={() => {setTool('hand')}} className={`${tool == 'hand' ? '!bg-secondary-foreground/20' : 1}`}>
          <HandIcon />
        </Button>

        <Button size="icon-lg" variant="outline">
          <MousePointerIcon />
        </Button>

        <Button size="icon-lg" variant="outline">
          <SquareIcon />
        </Button>

        <Button size="icon-lg" variant="outline">
          <DiamondIcon />
        </Button>

        <Button size="icon-lg" variant="outline">
          <CircleIcon />
        </Button>

        <Button size="icon-lg" variant="outline">
          <MoveRightIcon />
        </Button>

        <Button size="icon-lg" variant="outline">
          <MinusIcon />
        </Button>

        <Button size="icon-lg" variant="outline">
          <TypeIcon />
        </Button>

        <Button size="icon-lg" variant="outline" onClick={() => {setTool('brush')}} className={`${tool == 'brush' ? '!bg-secondary-foreground/20' : 1}`}>
          <PencilIcon />
        </Button>

        <Button size="icon-lg" variant="outline" onClick={() => {setTool('eraser')}} className={`${tool == 'eraser' ? '!bg-secondary-foreground/20' : 1}`}>
          <TrashIcon />
        </Button>

      </div>

      <Stage
        ref={stageRef}
        width={5000}
        height={5000}
        draggable={tool === "hand"}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onMouseLeave={handleMouseDown}
        onPointerLeave={handleMouseDown}
      >
        <Layer>
          {lines.map((line) => (
            <Line
              key={line.id}
              points={line.points}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={
                line.isEraser ? "destination-out" : "source-over"
              }
              onClick={() => {
                if (tool !== "select") return;
                setSelectedId(line.id);
              }}
            />
          ))}

          {selectedId && (
            <Rect
              x={50}
              y={50}
              width={100}
              height={100}
              stroke="blue"
              strokeWidth={2}
              draggable
            />
          )}

          <Transformer ref={transformerRef} />
        </Layer>
      </Stage>
    </div>
  );
}