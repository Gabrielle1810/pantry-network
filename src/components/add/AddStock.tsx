"use client";

// Add stock entry point. Picks the flow by device CAPABILITY (PF.1), not the
// user agent: coarse pointer + small viewport + a camera → camera flow;
// anything else → the typed form only (no camera, no upload, no picture).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { detectPhone } from "@/lib/device";
import type { DeliveryLine, ReviewDraft, SavedSummary } from "@/lib/intake";
import { PhoneAddFlow } from "./PhoneAddFlow";
import { TypedAddForm } from "./TypedAddForm";
import { DeliveryList, SavedPanel } from "./Saved";
import { newKey } from "./api";

type Device = "unknown" | "phone" | "desktop";

function hasCameraInput(): Promise<boolean> {
  const md = navigator.mediaDevices;
  if (!md?.enumerateDevices) return Promise.resolve(false);
  return md
    .enumerateDevices()
    .then((devices) => devices.some((d) => d.kind === "videoinput"))
    .catch(() => Boolean(md.getUserMedia));
}

export function AddStock({
  today,
  prefill,
  campusName,
}: {
  today: string;
  prefill: Partial<ReviewDraft> | null;
  campusName: string;
}) {
  const [device, setDevice] = useState<Device>("unknown");

  useEffect(() => {
    let cancelled = false;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const viewportWidth = window.innerWidth;
    hasCameraInput().then((camera) => {
      if (!cancelled) setDevice(detectPhone({ coarsePointer, viewportWidth, hasCameraInput: camera }) ? "phone" : "desktop");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (device === "unknown") {
    return (
      <p role="status" className="text-muted">
        Getting Add stock ready…
      </p>
    );
  }
  if (device === "phone") return <PhoneAddFlow today={today} prefill={prefill} />;
  return <DesktopAdd prefill={prefill} campusName={campusName} />;
}

function DesktopAdd({ prefill, campusName }: { prefill: Partial<ReviewDraft> | null; campusName: string }) {
  const router = useRouter();
  const [key, setKey] = useState(() => newKey());
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  const [delivery, setDelivery] = useState<DeliveryLine[]>([]);
  const [usePrefill, setUsePrefill] = useState(true);
  const restocking = prefill && usePrefill ? prefill.name : null;

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Add stock</h1>
        <p className="text-[15px] text-muted">
          {restocking
            ? `Restocking ${restocking} at ${campusName}.`
            : `Type what arrived at ${campusName}. On a phone, Add stock opens the camera.`}
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,320px)]">
        {saved ? (
          <SavedPanel
            summary={saved}
            onAddAnother={() => {
              setSaved(null);
              setUsePrefill(false);
              setKey(newKey());
            }}
          />
        ) : (
          <TypedAddForm
            key={key}
            variant="desktop"
            prefill={usePrefill ? prefill : null}
            idempotencyKey={key}
            onSaved={(summary) => {
              setSaved(summary);
              setDelivery((list) => [...list, { name: summary.name, added: summary.added, unit: summary.unit }]);
              router.refresh();
            }}
          />
        )}
        <DeliveryList delivery={delivery} />
      </div>
    </>
  );
}
