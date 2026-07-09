import { useEffect, useMemo, useRef, useState } from "react";
import { TagIcon, PlusIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/api";
import type { Tag } from "@/composables/notes";

const TAGS_SIMILAR_URL = "/api/v1/tags/similar/";

export interface NoteTagsProps {
  tags: Tag[];
  allTags: Tag[];
  onTagsChange: (names: string[]) => void;
}

// Inline tag editor shown under the note title: existing tags as removable
// chips plus an input with live (server-backed) suggestions.
export default function NoteTags({ tags, allTags, onTagsChange }: NoteTagsProps) {
  const [tagDraft, setTagDraft] = useState("");
  const [tagFocused, setTagFocused] = useState(false);
  const [remote, setRemote] = useState<Tag[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const tagNames = useMemo(() => tags.map((t) => t.name), [tags]);

  // Resolve a typed name to an already-existing tag (case-insensitively) so a
  // tag with the same name is reused instead of the backend spawning a
  // duplicate for a differently-cased spelling. Falls back to the raw name.
  const canonicalName = (raw: string) => {
    const lower = raw.toLowerCase();
    const match = [...remote, ...allTags].find(
      (t) => t.name.toLowerCase() === lower
    );
    return match?.name ?? raw;
  };

  const addTag = (raw: string) => {
    const name = canonicalName(raw.trim());
    if (!name || tagNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      setTagDraft("");
      return;
    }
    onTagsChange([...tagNames, name]);
    setTagDraft("");
  };

  const removeTag = (name: string) => {
    onTagsChange(tagNames.filter((n) => n !== name));
  };

  // While typing, ask the server for similar tags (debounced). With no query we
  // fall back to the locally-known tags so focusing the field still suggests.
  useEffect(() => {
    const query = tagDraft.trim();
    if (!query) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(TAGS_SIMILAR_URL, { params: { q: query } });
        if (!cancelled) setRemote(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setRemote([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tagDraft]);

  // Suggestions to show in the dropdown. With no query we show the user's known
  // tags (from every note). While typing we merge the server's "similar" matches
  // with a local substring filter over allTags — so a tag created on another
  // note is always suggestable even if the remote lookup is slow or unavailable.
  // Already-applied tags are filtered out.
  const draft = tagDraft.trim();
  const suggestions = useMemo(() => {
    if (!draft) {
      return allTags.filter((t) => !tagNames.includes(t.name));
    }
    const lower = draft.toLowerCase();
    const local = allTags.filter((t) => t.name.toLowerCase().includes(lower));
    // Dedupe by name, keeping the server's ranking (remote first).
    const byName = new Map<string, Tag>();
    [...remote, ...local].forEach((t) => byName.set(t.name.toLowerCase(), t));
    return [...byName.values()].filter((t) => !tagNames.includes(t.name));
  }, [draft, remote, allTags, tagNames]);

  // Offer to create a brand-new tag when the draft matches nothing existing.
  const canCreate =
    draft.length > 0 &&
    !tagNames.includes(draft) &&
    !suggestions.some((s) => s.name.toLowerCase() === draft.toLowerCase());

  const showDropdown = tagFocused && (suggestions.length > 0 || canCreate);

  // Delay clearing focus so a click on a suggestion registers before the
  // dropdown unmounts.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collapse to the first few chips while idle; reveal the rest on focus so the
  // title area stays compact for heavily-tagged notes.
  const COLLAPSED_LIMIT = 3;
  const collapsed = !tagFocused && tags.length > COLLAPSED_LIMIT;
  const visibleTags = collapsed ? tags.slice(0, COLLAPSED_LIMIT) : tags;
  const hiddenCount = tags.length - visibleTags.length;

  // When focusing reveals extra rows, float the chip row in an absolute overlay
  // so the header's in-flow height never changes — otherwise the growing row
  // would shove the focused input down and the browser would scroll the whole
  // header up ("jumping"). A reserved min-height keeps the footprint stable.
  const overlay = tagFocused && tags.length > COLLAPSED_LIMIT;

  return (
    <div className="relative min-h-7">
      {/* Cap the width so the (expanded) chip row wraps just before the centered
          top toolbar instead of running underneath it. */}
      <div
        className={`flex items-center gap-1.5 max-w-[calc(50vw-14rem)] ${
          overlay
            ? "flex-wrap absolute left-0 top-0 z-30 -m-1.5 rounded-2xl bg-primary-foreground/85 p-1.5 shadow-lg ring-1 ring-border/50 backdrop-blur-md"
            : // Only clip while idle (to truncate the nowrap chip row). When the
              // field is focused the suggestion dropdown drops below this row, so
              // clipping here would hide it — and with ≤3 chips nothing overflows.
              `flex-nowrap ${tagFocused ? "overflow-visible" : "overflow-hidden"}`
        }`}
      >
      {visibleTags.map((t) => (
        <Badge
          key={`t-${t.id}`}
          variant="secondary"
          className="shrink-0 gap-1 pl-2 pr-1 py-0.5 font-normal rounded-full shadow-sm transition-colors"
        >
          <TagIcon className="size-3 opacity-70" />
          {t.name}
          <button
            className="ml-0.5 grid place-items-center rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            title="Remove tag"
            onClick={() => removeTag(t.name)}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}

      {/* Collapsed overflow: click to reveal the rest. */}
      {hiddenCount > 0 && (
        <button
          onClick={() => inputRef.current?.focus()}
          className="shrink-0 rounded-full bg-secondary/70 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
          title="Show all tags"
        >
          +{hiddenCount}
        </button>
      )}

      {/* Tag input with live suggestions */}
      <div className="relative shrink-0">
        <div className="flex items-center gap-1.5 rounded-full border border-dashed border-border/70 bg-background/40 px-2.5 py-1 text-muted-foreground transition-colors focus-within:border-primary/50 focus-within:bg-background/70">
          <TagIcon className="size-3" />
          <input
            ref={inputRef}
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onFocus={() => {
              if (blurTimer.current) clearTimeout(blurTimer.current);
              setTagFocused(true);
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setTagFocused(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagDraft);
              }
              if (e.key === "Escape") {
                setTagDraft("");
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Add a tag…"
            aria-label="Add a tag"
            className="h-4 w-24 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70 focus:w-32 transition-[width]"
          />
        </div>

        {showDropdown && (
          <div className="absolute left-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-xl border bg-popover/95 p-1 shadow-xl backdrop-blur-md">
            {canCreate && (
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(tagDraft)}
              >
                <PlusIcon className="size-3.5" /> Create “{draft}”
              </button>
            )}
            {suggestions.length > 0 && (
              <div className="max-h-44 overflow-y-auto">
                {suggestions.map((t) => (
                  <button
                    key={t.id}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(t.name)}
                  >
                    <TagIcon className="size-3.5 opacity-70" /> {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
