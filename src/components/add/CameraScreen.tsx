"use client";

// Live rear-camera viewfinder (screenshot 1). Falls back to the phone's own
// camera via <input capture> when permission is denied or getUserMedia is
// missing. After the shutter, the frame freezes while the read runs.
import { useEffect, useRef, useState } from "react";
import { captureVideoFrame, prepareImage, toDataUrl, type PreparedImage } from "@/lib/image";
import { Corners, PhoneHeader } from "./PhoneFrame";

type CamState = "starting" | "live" | "fallback";

const SHUTTER =
  "grid h-20 w-20 place-items-center rounded-full border-4 border-ink bg-app disabled:opacity-45";

export function CameraScreen({
  mode,
  reading,
  error,
  deliveryCount,
  onCapture,
  onTypeInstead,
  onClose,
  onBack,
}: {
  mode: "label" | "date";
  reading: boolean;
  error: string | null;
  deliveryCount: number;
  onCapture: (image: PreparedImage) => void;
  onTypeInstead: () => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const [camState, setCamState] = useState<CamState>(supported ? "starting" : "fallback");
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const dateMode = mode === "date";

  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          await video.play().catch(() => undefined);
        }
        setCamState("live");
      })
      .catch(() => {
        if (!cancelled) setCamState("fallback");
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported]);

  function capture(image: PreparedImage) {
    setShot(toDataUrl(image));
    setLocalError(null);
    onCapture(image);
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video || busy || reading) return;
    setBusy(true);
    try {
      capture(await captureVideoFrame(video));
    } catch {
      setCamState("fallback");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || reading) return;
    setBusy(true);
    try {
      capture(await prepareImage(file));
    } catch {
      setLocalError("That photo couldn't be opened. Try taking it again.");
    } finally {
      setBusy(false);
    }
  }

  const frozen = reading && shot;
  const message = error ?? localError;

  return (
    <>
      <PhoneHeader action={dateMode ? { label: "Back", onClick: onBack } : { label: "Close", onClick: onClose }} />

      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[28px] bg-[#e7e2d7]">
        {camState !== "fallback" ? (
          <video ref={videoRef} playsInline muted autoPlay aria-label="Camera viewfinder" className="h-full w-full object-cover" />
        ) : !frozen ? (
          <div className="absolute inset-0 grid place-items-center p-8 text-center text-muted">
            Tap the button below to open your camera.
          </div>
        ) : null}
        {frozen ? (
          // eslint-disable-next-line @next/next/no-img-element -- in-memory data URL, never stored
          <img src={shot} alt="The photo you just took" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <Corners />
        {camState === "starting" ? (
          <div role="status" className="absolute inset-0 grid place-items-center text-muted">
            Opening the camera…
          </div>
        ) : null}
        {reading ? (
          <div role="status" className="absolute inset-x-0 bottom-0 flex justify-center pb-6">
            <span className="rounded-full bg-ink/80 px-4 py-2 text-sm font-medium text-white motion-safe:animate-pulse">
              {dateMode ? "Reading the date…" : "Reading the label…"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold leading-snug">
          {dateMode ? "Show the date on the label" : "Show the item's name and the date on the label"}
        </h2>
        <p className="mt-1 text-muted">
          {dateMode ? "Just the date. We keep the name and amount you already have." : "Hold steady. We read it for you."}
        </p>
      </div>

      {message ? (
        <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-sm text-red">
          {message}
        </p>
      ) : null}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center pb-2">
        <div>
          {!dateMode ? (
            <button type="button" onClick={onTypeInstead} className="min-h-11 text-[15px] font-medium text-green">
              Type it instead
            </button>
          ) : null}
        </div>
        {camState === "fallback" ? (
          <label className={`${SHUTTER} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-green`}>
            <span className="sr-only">Take photo</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onFile} disabled={reading || busy} />
            <span aria-hidden className="h-[62px] w-[62px] rounded-full bg-ink" />
          </label>
        ) : (
          <button type="button" aria-label="Take photo" onClick={shoot} disabled={reading || busy || camState !== "live"} className={SHUTTER}>
            <span aria-hidden className="h-[62px] w-[62px] rounded-full bg-ink" />
          </button>
        )}
        <div />
      </div>

      {deliveryCount > 0 ? (
        <p className="text-center text-sm text-muted">
          This delivery: {deliveryCount} item{deliveryCount === 1 ? "" : "s"} saved
        </p>
      ) : null}
    </>
  );
}
