"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useActionState, useState } from "react";

import { IDLE } from "@/lib/actions/state";

import { reorderPagesAction, togglePageAction } from "./actions";

export interface PageRow {
  slug: string;
  name: string;
  source: string;
  enabled: boolean;
  /** Set when a provider this page needs cannot answer. */
  warning: string | null;
}

export interface PageListProps {
  rows: PageRow[];
  selected: string;
  onSelect(slug: string): void;
}

/**
 * Drag to reorder, and a switch per page.
 *
 * The order is submitted as one field carrying every slug, because a partial
 * order is not an order: the badge draws whatever it is handed, and two
 * half-applied writes would show it a list with a gap in it.
 */
export function PageList({ rows, selected, onSelect }: PageListProps) {
  const [order, setOrder] = useState(() => rows.map((row) => row.slug));
  const [, submitOrder] = useActionState(reorderPagesAction, IDLE);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Reorderable by keyboard as well, because a list you can only drag is a
    // list some people cannot use at all.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    const next = arrayMove(order, from, to);
    setOrder(next);

    const form = new FormData();
    form.set("order", next.join(","));
    submitOrder(form);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ul className="gap-sm flex flex-col">
          {order.map((slug) => {
            const row = bySlug.get(slug);
            if (!row) return null;
            return (
              <SortableRow
                key={slug}
                row={row}
                isSelected={slug === selected}
                onSelect={() => onSelect(slug)}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  row,
  isSelected,
  onSelect,
}: {
  row: PageRow;
  isSelected: boolean;
  onSelect(): void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.slug,
  });
  const [, toggle] = useActionState(togglePageAction, IDLE);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        isSelected
          ? "gap-md rounded-panel border-accent bg-raised px-md py-md flex items-center border"
          : "gap-md rounded-panel border-border bg-surface px-md py-md flex items-center border"
      }
      data-dragging={isDragging ? "true" : undefined}
    >
      <button
        type="button"
        aria-label={`Reorder ${row.name}`}
        className="shrink-0 cursor-grab"
        {...attributes}
        {...listeners}
      >
        <GrabGlyph />
      </button>

      <button type="button" onClick={onSelect} className="gap-3xs flex flex-1 flex-col items-start">
        <span className="font-display text-base">{row.name}</span>
        <span className={row.warning ? "text-critical text-xs" : "text-ink-faint text-xs"}>
          {row.warning ?? row.source}
        </span>
      </button>

      <form action={toggle} className="shrink-0">
        <input type="hidden" name="page_slug" value={row.slug} />
        <input type="hidden" name="enabled" value={row.enabled ? "false" : "true"} />
        <button
          type="submit"
          role="switch"
          aria-checked={row.enabled}
          aria-label={`${row.enabled ? "Turn off" : "Turn on"} ${row.name}`}
          className={
            row.enabled
              ? "h-xl w-4xl rounded-pill bg-accent px-3xs flex items-center justify-end"
              : "h-xl w-4xl rounded-pill bg-border-strong px-3xs flex items-center justify-start"
          }
        >
          <span className="size-lg rounded-pill bg-raised" />
        </button>
      </form>
    </li>
  );
}

/** Two folded planes, from the same geometry as the homepage bird. */
function GrabGlyph() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
      <path d="M0 0 L10 3 L0 6 Z" fill="var(--color-ink-muted)" />
      <path d="M0 10 L10 13 L0 16 Z" fill="var(--color-ink-muted)" />
    </svg>
  );
}
