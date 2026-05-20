
import { useRef, useState, useEffect, useMemo } from "react";
import type Konva from "konva";


type Tool = "hand" | "brush" | "eraser" | "select";
type ActionType = "paint"


interface Geometry {
  x: number
  y: number
  width: number
  height: number
}

interface LineData {
  id: number
  tool: Tool;
  points: number[];
  width: number
  height: number
  x: number
  y: number
}

interface Action {
  type: ActionType
  data: any
}


function normalizeRect(r: Geometry) {
  const x = Math.min(r.x, r.x + r.width);
  const y = Math.min(r.y, r.y + r.height);
  return {
    x,
    y,
    width: Math.abs(r.width),
    height: Math.abs(r.height),
  };
}


function getLineBounds(points: number[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}


function isShapeInsideRect(shape: any, rect: any) {
  const sLeft = shape.x;
  const sTop = shape.y;
  const sRight = shape.x + shape.width;
  const sBottom = shape.y + shape.height;

  const rLeft = rect.x;
  const rTop = rect.y;
  const rRight = rect.x + rect.width;
  const rBottom = rect.y + rect.height;

  const interLeft = Math.max(sLeft, rLeft);
  const interTop = Math.max(sTop, rTop);
  const interRight = Math.min(sRight, rRight);
  const interBottom = Math.min(sBottom, rBottom);

  const interWidth = Math.max(0, interRight - interLeft);
  const interHeight = Math.max(0, interBottom - interTop);

  const intersectionArea = interWidth * interHeight;

  const shapeArea = shape.width * shape.height;

  if (shapeArea === 0) return false;

  const ratio = intersectionArea / shapeArea;

  return ratio > 0.2;
}

function isPointInsideRect(point: any, rect: any) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function getSelectedBounds(lines: LineData[], selectedIds: number[]) {
  const selected = lines.filter(l => selectedIds.includes(l.id));
  if (selected.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const line of selected) {
    const b = getLineBounds(line.points);

    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  return {
    x: minX - 20,
    y: minY - 20,
    width: maxX - minX + 40,
    height: maxY - minY + 40,
  };
}

export const useEditor = () => {
  const stageRef = useRef<any>(null);

  const [lines, setLines] = useState<LineData[]>([]);
  const [tool, setTool] = useState<Tool>("hand");

  const history = useRef<Action[]>([]);
  const historyPlace = useRef<number>(0);

  const moveStart = useRef<any>(null);
  const isDrawing = useRef<boolean>(false);

  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectionRect, setSelectionRect] = useState<Geometry | null>(null);
  const normalizedRect = selectionRect ? normalizeRect(selectionRect) : null;

  const selectedBounds = useMemo(() => {
    return getSelectedBounds(lines, selectedIds);
  }, [lines, selectedIds]);

  const changeTool = (tool_name: Tool) => {
    setTool(() => {
      return tool_name;
    });
  };

  const applyAction = (action: Action) => {
    if (historyPlace.current !== 0){
      history.current = history.current.slice(0, history.current.length + historyPlace.current)
      historyPlace.current = 0
    }

    history.current = [...history.current, action]
  }

  const undo = () => {
    historyPlace.current -= 1;

    if (history.current.length < Math.abs(historyPlace.current)){
      historyPlace.current = -history.current.length
      return
    }

    const action = history.current[history.current.length + historyPlace.current]

    switch (action.type) {
      case "paint":
        setLines(prev => {
          const newLines = prev.slice(0, -1)
          return newLines
        })

        break
    }
  }

  const redo = () => {
    if (historyPlace.current == 0){
      return
    }

    const action = history.current[history.current.length + historyPlace.current]

    switch (action.type) {
      case "paint":
        setLines(prev => {
          return [...prev, action.data]
        })

        break
    }

    historyPlace.current += 1;

    if (historyPlace.current > 0){
      historyPlace.current = 0
      return
    }

  }

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    isDrawing.current = true;

    if (tool === 'hand') {
      setIsDragging(true);
      stage.startDrag();
      return;
    }
    else if (tool == "select") {
      const transform = stage.getAbsoluteTransform().copy().invert();
      const point = stage.getPointerPosition();

      if (point){
        const relativePoint = transform.point(point);

        if (selectedBounds && isPointInsideRect(relativePoint, selectedBounds)){
          moveStart.current = relativePoint;
          return
        }

        setSelectionRect({
          x: relativePoint.x,
          y: relativePoint.y,
          width: 0,
          height: 0
        })
        setSelectedIds([]);
      }
    }
    else if (tool == "brush") {
      const transform = stage.getAbsoluteTransform().copy().invert();
      const pos = stage.getPointerPosition();

      if (pos) {
        const relativePos = transform.point(pos);

        const newLine: LineData = {
          id: lines.length == 0 ? 0 : lines[lines.length-1].id + 1,
          tool,
          points: [relativePos.x, relativePos.y],
          x: relativePos.x,
          y: relativePos.y,
          width: 1,
          height: 1
        }
        
        setLines(prev => {
          const updated = [...prev, newLine]
          return updated
        })
      }
    }

    isDrawing.current = true;
  };

  const handleMouseUp = () => {
    if (tool == "brush"){
      const lastLine = lines[lines.length - 1]
      lines[lines.length - 1] = {...lastLine, ...getLineBounds(lastLine.points)}

      applyAction({
        type: "paint",
        data: lastLine
      })
    }
    else if (tool == "select"){
      if (moveStart.current){
        moveStart.current = null;
      } else if (selectionRect){
        const selected = lines.filter((line) =>
          isShapeInsideRect(line, normalizedRect)
        ).map(line => line.id);

        setSelectedIds(selected);
      }

      setSelectionRect(null);
    }

    isDrawing.current = false;
    setIsDragging(false);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDrawing.current) return;

    const stage = stageRef.current.getStage();
    if (!stage) return;

    const transform = stage.getAbsoluteTransform().copy().invert();
    const point = {x: e.clientX, y: e.clientY}

    if (!point) return;

    const relativePoint = transform.point(point);

    if (tool == "hand"){

    }
    else if (tool == "select"){
      if (moveStart.current) {
        const stage = stageRef.current.getStage();
        if (!stage) return;

        const point = stage.getPointerPosition();
        if (!point) return;

        const dx = relativePoint.x - moveStart.current.x;
        const dy = relativePoint.y - moveStart.current.y;

        setLines(prev =>
          prev.map(line => {
            if (!selectedIds.includes(line.id)) return line;

            return {
              ...line,
              points: line.points.map((p, i) =>
                i % 2 === 0 ? p + dx : p + dy
              ),
            };
          })
        );

        moveStart.current = relativePoint;
      } else {
        setSelectionRect(prev => {
          if (!prev) return prev;

          const rect = {
            x: prev.x,
            y: prev.y,
            width: relativePoint.x - prev.x,
            height: relativePoint.y - prev.y,
          };

          return rect;
        });
      }
    }
    else if (tool == "brush"){
      const relativePoint = transform.point(point);
      
      setLines((prevLines) => {
        if (prevLines.length === 0) return prevLines;
        const newLines = [...prevLines];
        const lastLine = { ...newLines[newLines.length - 1] };
        
        lastLine.points = lastLine.points.concat([relativePoint.x, relativePoint.y]);
        newLines[newLines.length - 1] = lastLine;

        return newLines;
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        redo();
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault()
        undo()
      }
      else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  });

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = e.target.getStage();
    if (!stage) return;

    const isZooming = e.evt.ctrlKey || e.evt.metaKey;

    if (isZooming) {
      const oldScale = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldScale,
        y: (pointer.y - stage.y()) / oldScale,
      };

      const factor = 1 - e.evt.deltaY * 0.008;
      const newScale = oldScale * factor;
      const boundedScale = Math.max(0.1, Math.min(10, newScale));

      stage.scale({ x: boundedScale, y: boundedScale });

      const newPos = {
        x: pointer.x - mousePointTo.x * boundedScale,
        y: pointer.y - mousePointTo.y * boundedScale,
      };

      stage.position(newPos);
    } else {
      stage.position({
        x: stage.x() - e.evt.deltaX,
        y: stage.y() - e.evt.deltaY,
      });
    }
  };

  return {
    stageRef,
    lines,
    isDragging, isDrawing, 
    selectionRect, selectedBounds, selectedIds, normalizedRect,
    tool, 
    changeTool,
    handleMouseDown, handleMouseUp, handleMouseMove,
    handleWheel,
    redo, undo,
  }
}
