
import { useEffect, useState } from "react"
import { Stage, Layer, Line, Rect } from "react-konva";

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
  TrashIcon,
  Scale
} from "lucide-react"

import {
  Button
} from "@/components/ui/button"


import { useEditor } from "@/composables/editor"
import { getComputedRgba } from "@/utils"

export default function Dashboard() {
  const { 
    stageRef,
    tool, isDragging, lines,
    isDrawing, selectedBounds,
    normalizedRect, scale,
    changeTool, handleMouseDown, 
    handleWheel
  } = useEditor();

  return (
    <div className="w-screen h-screen overflow-hidden">
      <div className="absolute left-2 top-5 z-10 p-2">
        <div className="flex">
          <p className="inline-block text-3xl font-bold leading-[0.9] m-0 bg-secondary/60 backdrop-blur-xs bg-clip-text">
            Note name
          </p>

          <div className="flex-1"></div>

        </div>

        <div className="flex gap-2">
          <p className="text-l font-bold text-muted-foreground leading-[0.9] m-0 bg-primary/60 backdrop-blur-xs bg-clip-text">#ebalo</p>
          <p className="text-l font-bold text-muted-foreground leading-[0.9] m-0 bg-primary/60 backdrop-blur-xs bg-clip-text">#hui</p>
          <p className="text-l font-bold text-muted-foreground leading-[0.9] m-0 bg-primary/60 backdrop-blur-xs bg-clip-text">#вся-хуйня</p>
        </div>

      </div>

      <div className="absolute top-1/2 -translate-y-1/2 right-5 z-10 flex flex-col gap-1 p-2 bg-primary-foreground/60 dropborder rounded-xl shadow-lg">
        <Button size="icon-lg" variant="outline" onClick={() => {changeTool('hand')}} className={`${tool == 'hand' ? '!bg-secondary-foreground/20' : 1}`}>
          <HandIcon />
        </Button>

        <Button size="icon-lg" variant="outline" onClick={() => {changeTool('select')}} className={`${tool == 'select' ? '!bg-secondary-foreground/20' : 1}`}>
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

        <Button size="icon-lg" variant="outline" onClick={() => {changeTool('brush')}} className={`${tool == 'brush' ? '!bg-secondary-foreground/20' : 1}`}>
          <PencilIcon />
        </Button>

        <Button size="icon-lg" variant="outline" onClick={() => {changeTool('eraser')}} className={`${tool == 'eraser' ? '!bg-secondary-foreground/20' : 1}`}>
          <TrashIcon />
        </Button>

      </div>

      <Stage
        ref={stageRef}
        width={5000}
        height={5000}
        draggable={isDragging}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}

        style={{
          cursor: isDragging ? 'grabbing' : 'default' 
        }}
      >
        <Layer>
          {selectedBounds && (
            <Rect
              x={selectedBounds.x - (20 / scale)}
              y={selectedBounds.y - (20 / scale)}
              width={selectedBounds.width + (40 / scale)}
              height={selectedBounds.height + (40 / scale)}
              stroke={getComputedRgba("--primary")}
              dash={[4 / scale, 4 / scale]}
              listening={false}
            />
          )}

          {lines.map(line => (
            <Line
              key={line.id}
              points={line.points}
              strokeWidth={5}
              tension={0.5}

              stroke="red"
              lineCap="round"
              lineJoin="round"
            />
          ))}

          {tool == "select" && isDrawing && normalizedRect && (
            <Rect
              x={normalizedRect.x}
              y={normalizedRect.y}
              width={normalizedRect.width}
              height={normalizedRect.height}
              fill={getComputedRgba("--primary", 0.15)}
              stroke={getComputedRgba("--primary")}
              dash={[4 / scale, 4 / scale]}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}