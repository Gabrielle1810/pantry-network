"use client";

// Accessible modal dialog. It mounts ONCE when opened and only the open plays an
// animation; anything that changes inside (steppers, chips, selects) updates in
// place, so nothing re-mounts, replays the animation, shifts layout or resets
// scroll (PG.1/PG.2, the prototype's "modal jumps" bug). Focus is trapped,
// Escape and the backdrop close it, and focus returns to what opened it.
import { useEffect, useId, useRef } from "react";
import { Icon } from "./Icon";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  leading,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-ink/35 sm:place-items-center sm:p-4 motion-safe:animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex max-h-[min(92dvh,760px)] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-xl outline-none sm:max-w-[520px] sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          {leading}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold leading-snug">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 flex-none place-items-center rounded-xl text-muted hover:bg-hover hover:text-ink"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        {/* Scroll area keeps its own scroll position while values change. */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Shared button looks for modal footers and cards. */
export const btn = {
  base: "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45",
  plain: "border border-line bg-surface hover:bg-hover",
  dark: "bg-primary text-white hover:bg-[#2a332e]",
  red: "bg-red-btn text-white hover:bg-[#a93226]",
  ghostRed: "text-red hover:bg-red-bg",
} as const;
