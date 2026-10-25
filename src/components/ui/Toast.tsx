"use client";

// Toast with an optional Undo. `show` keeps the toast for 10 s when there is an
// Undo (the spec's undo window) and ~3.5 s otherwise. Announced politely.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface ToastState {
  id: number;
  message: string;
  undo?: () => void;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const counter = useRef(0);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback((message: string, opts: { undo?: () => void; ms?: number } = {}) => {
    clearTimeout(timer.current);
    counter.current += 1;
    setToast({ id: counter.current, message, undo: opts.undo });
    timer.current = setTimeout(() => setToast(null), opts.ms ?? (opts.undo ? 10_000 : 3_500));
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const node = toast ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-5 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl bg-primary px-4 py-3 text-white shadow-lg"
    >
      <Icon name="circle-check" size={18} className="flex-none text-[#7fd8a3]" />
      <span className="flex-1 text-sm">{toast.message}</span>
      {toast.undo ? (
        <button
          type="button"
          className="min-h-11 rounded px-2 text-sm font-semibold text-[#7fd8a3] hover:underline"
          onClick={() => {
            const undo = toast.undo;
            hide();
            undo?.();
          }}
        >
          Undo
        </button>
      ) : null}
    </div>
  ) : null;

  return { show, hide, node };
}
