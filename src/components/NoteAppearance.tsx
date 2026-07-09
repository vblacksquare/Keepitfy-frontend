import { CheckIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  NOTE_COLORS,
  NOTE_ICON_KEYS,
  noteColor,
  noteIcon,
} from "@/composables/noteAppearance";

export interface NoteAppearanceProps {
  icon: string;
  color: string;
  onChange: (appearance: { icon?: string; color?: string }) => void;
}

// Trigger button (shows the current icon tinted with the current color) plus a
// popover to pick a different icon and accent color for the note.
export default function NoteAppearance({ icon, color, onChange }: NoteAppearanceProps) {
  const CurrentIcon = noteIcon(icon);
  const accent = noteColor(color);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Change note icon & color"
          aria-label="Change note icon and color"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-background/40 transition-colors hover:bg-accent"
        >
          <CurrentIcon className="size-4" style={accent ? { color: accent } : undefined} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 overflow-hidden p-3">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Icon</p>
        <div className="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto pr-1">
          {NOTE_ICON_KEYS.map((key) => {
            const Icon = noteIcon(key);
            const selected = key === icon || (!icon && key === "FileText");
            return (
              <button
                key={key}
                type="button"
                title={key}
                onClick={() => onChange({ icon: key })}
                className={`grid size-8 place-items-center rounded-md transition-colors hover:bg-accent ${
                  selected ? "bg-accent ring-1 ring-primary/50" : ""
                }`}
              >
                <Icon className="size-4" style={accent ? { color: accent } : undefined} />
              </button>
            );
          })}
        </div>

        <p className="mb-1.5 mt-3 text-xs font-medium text-muted-foreground">Color</p>
        <div className="flex flex-wrap gap-1.5">
          {NOTE_COLORS.map((c) => {
            const selected = c.value === (color ?? "");
            return (
              <button
                key={c.value || "default"}
                type="button"
                title={c.label}
                onClick={() => onChange({ color: c.value })}
                className={`grid size-7 place-items-center rounded-full border transition-transform hover:scale-110 ${
                  selected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border"
                }`}
                style={c.value ? { backgroundColor: c.value } : undefined}
              >
                {!c.value && <span className="text-[10px] text-muted-foreground">A</span>}
                {selected && c.value && <CheckIcon className="size-3.5 text-white" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
