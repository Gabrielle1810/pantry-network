// In-browser image preparation (R4). Split so the logic is testable in Node:
// computeTargetDimensions and isWithinUploadLimit are pure; prepareImage is a
// thin browser-only wrapper around <canvas> (verified manually on a phone, not
// unit-tested, because canvas does not exist in Vitest's Node environment).

/** Longest side allowed after resize (R4.1). */
export const MAX_LONGEST_SIDE = 1280;
/** JPEG quality for re-encode (R4.2). */
export const JPEG_QUALITY = 0.8;
/** Hard upload cap enforced before upload (R4.6 / the vision endpoint's 2 MB). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export interface TargetDimensions {
  width: number;
  height: number;
}

/**
 * Compute the resized dimensions so the longest side is at most
 * MAX_LONGEST_SIDE, preserving aspect ratio (R4.1). Images already within the
 * limit are returned unchanged. Pure and unit-tested.
 */
export function computeTargetDimensions(
  width: number,
  height: number,
  maxLongestSide: number = MAX_LONGEST_SIDE,
): TargetDimensions {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxLongestSide) return { width, height };
  const scale = maxLongestSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** True when a prepared image is within the upload limit (R4.6). Pure. */
export function isWithinUploadLimit(bytes: number, limit: number = MAX_UPLOAD_BYTES): boolean {
  return bytes >= 0 && bytes <= limit;
}

export interface PreparedImage {
  /** base64 JPEG with no data: prefix, ready to POST. */
  base64: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Browser-only: decode the file, draw it onto a canvas scaled to
 * computeTargetDimensions, export JPEG (strips EXIF/GPS), and return base64 +
 * byte size. Steps quality down once if the result exceeds the upload limit
 * (R4.6). Never uploads the original bytes (R4.3). Not unit-tested (no canvas
 * in Node); verified on a phone.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = drawScaled(bitmap, bitmap.width, bitmap.height);
  bitmap.close?.();
  return encodeCanvas(canvas);
}

/**
 * Browser-only: grab the current frame of a live <video> viewfinder, scaled to
 * the same limits and re-encoded the same way as prepareImage (R4.1-R4.4).
 */
export async function captureVideoFrame(video: HTMLVideoElement): Promise<PreparedImage> {
  if (!video.videoWidth || !video.videoHeight) throw new Error("Camera not ready");
  return encodeCanvas(drawScaled(video, video.videoWidth, video.videoHeight));
}

/** Data URL for showing a prepared image in memory (never stored). */
export function toDataUrl(image: PreparedImage): string {
  return `data:image/jpeg;base64,${image.base64}`;
}

function drawScaled(source: CanvasImageSource, srcW: number, srcH: number): HTMLCanvasElement {
  const { width, height } = computeTargetDimensions(srcW, srcH);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<PreparedImage> {
  const { width, height } = canvas;
  async function exportAt(quality: number): Promise<{ base64: string; bytes: number }> {
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        quality,
      ),
    );
    const buf = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    return { base64, bytes: blob.size };
  }

  let out = await exportAt(JPEG_QUALITY);
  if (!isWithinUploadLimit(out.bytes)) {
    out = await exportAt(0.6); // one quality step-down (R4.6)
  }

  return { base64: out.base64, width, height, bytes: out.bytes };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
