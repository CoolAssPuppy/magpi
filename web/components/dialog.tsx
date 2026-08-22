"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A modal, on the platform's own dialog element.
 *
 * showModal gives focus trapping, the inert background, Escape, and the top
 * layer for nothing. Every hand-rolled modal reimplements those four badly,
 * and usually forgets the third.
 */
export function Dialog({
  trigger,
  title,
  children,
  defaultOpen = false,
}: {
  /** The control that opens it. Rendered as given. */
  trigger: (open: () => void) => ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
  defaultOpen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // showModal throws if it is already open, and the element is the source of
    // truth for whether it is.
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <>
      {trigger(() => setIsOpen(true))}
      <dialog
        ref={ref}
        aria-label={title}
        onClose={close}
        // A click on the backdrop lands on the dialog itself, never a child.
        onClick={(event) => {
          if (event.target === ref.current) close();
        }}
        className="rounded-round border-border bg-background text-ink backdrop:bg-invert-ground/50 max-w-[92vw] border p-0"
      >
        {isOpen ? (
          <div className="gap-xl p-2xl flex flex-col">
            <div className="gap-lg flex items-start justify-between">
              <h2 className="font-display text-md font-medium">{title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="font-display text-ink-muted hover:text-ink text-sm"
              >
                Close
              </button>
            </div>
            {children(close)}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
