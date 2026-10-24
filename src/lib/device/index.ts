// Capability-based phone detection (PF.1). Pure function of observable
// capabilities — NOT user-agent sniffing. A device is treated as a "phone"
// (and gets the camera Add-stock flow) only when all three hold: a coarse
// pointer, a small viewport, and a usable camera input. "Type it instead" is
// always available so uncertain cases never block anyone (PF.4).
export interface DeviceEnv {
  /** matchMedia("(pointer: coarse)").matches */
  coarsePointer: boolean;
  /** window.innerWidth (CSS px) */
  viewportWidth: number;
  /** enumerateDevices() reported at least one videoinput */
  hasCameraInput: boolean;
}

/** Max viewport width (CSS px) still considered a phone. */
export const PHONE_MAX_WIDTH = 820;

/** True when Add stock should use the camera flow rather than the typed form. */
export function detectPhone(env: DeviceEnv): boolean {
  return (
    env.coarsePointer &&
    env.viewportWidth <= PHONE_MAX_WIDTH &&
    env.hasCameraInput
  );
}
