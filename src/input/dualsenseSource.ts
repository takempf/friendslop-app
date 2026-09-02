import { DualSenseHidSource } from "./sources/DualSenseHidSource";

/**
 * Single WebHID DualSense instance, shared by the input manager (which samples
 * it) and the Controls UI (which pairs, calibrates, and reads its status).
 * It lives here rather than in `useInput` so the UI is not importing a hook
 * module just to reach the device.
 */
export const dualSenseHidSource = new DualSenseHidSource();
