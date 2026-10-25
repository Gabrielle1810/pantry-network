// QR code as an SVG path, generated on the server with the `qrcode` encoder.
// We render the module matrix ourselves (no innerHTML) so the poster page only
// ever outputs <svg><path/></svg> built from numbers.
import QRCode from "qrcode";

export interface QrSvg {
  /** Modules per side (without the quiet zone). */
  size: number;
  /** SVG path: one 1x1 square per dark module. */
  path: string;
}

export function qrSvg(text: string): QrSvg {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, path };
}

/** The public student URL for a campus token (token is random, never the campus id). */
export function studentUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/s/${token}`;
}
