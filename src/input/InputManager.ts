import type { InputSource } from "./InputSource";
import {
  BUTTON_ACTIONS,
  createEmptyFrame,
  type ButtonAction,
  type InputFrame,
  type ActiveDevice,
} from "./actions";

/**
 * Maximum frame delta passed to input sources (~30 fps).
 * Clamping prevents hitches (GC pauses, tab switching, shader compilation)
 * from producing huge deltas that whip the camera across the screen in a single frame.
 */
export const MAX_FRAME_DT = 1 / 30;

export class InputManager {
  private sources: InputSource[] = [];
  private currentFrame: InputFrame = createEmptyFrame();
  private prevButtons: Record<ButtonAction, boolean> =
    createEmptyFrame().buttons;

  private activeDevice: ActiveDevice = "keyboard";
  private readonly deviceListeners = new Set<(device: ActiveDevice) => void>();

  constructor(sources: InputSource[] = []) {
    this.sources = sources;
  }

  public registerSource(source: InputSource): void {
    this.sources.push(source);
  }

  public connect(): () => void {
    const unsubs = this.sources.map((s) => s.connect());
    return (): void => {
      unsubs.forEach((unsub) => unsub());
    };
  }

  public update(dt: number): void {
    const clampedDt = Math.min(Math.max(dt, 0), MAX_FRAME_DT);

    // 1. Snapshot previous buttons for edge detection
    for (const action of BUTTON_ACTIONS) {
      this.prevButtons[action] = this.currentFrame.buttons[action];
    }

    // 2. Clear current frame
    this.currentFrame.moveX = 0;
    this.currentFrame.moveY = 0;
    this.currentFrame.lookYaw = 0;
    this.currentFrame.lookPitch = 0;
    for (const action of BUTTON_ACTIONS) {
      this.currentFrame.buttons[action] = false;
    }

    // 3. Sample and merge all sources
    for (const source of this.sources) {
      const sourceFrame = createEmptyFrame();
      source.sample(sourceFrame, clampedDt);

      let hasActivity = false;

      // Buttons - logical OR
      for (const action of BUTTON_ACTIONS) {
        if (sourceFrame.buttons[action]) {
          this.currentFrame.buttons[action] = true;
          hasActivity = true;
        }
      }

      // Look - sum
      if (sourceFrame.lookYaw !== 0 || sourceFrame.lookPitch !== 0) {
        this.currentFrame.lookYaw += sourceFrame.lookYaw;
        this.currentFrame.lookPitch += sourceFrame.lookPitch;
        if (
          Math.abs(sourceFrame.lookYaw) > 0.0001 ||
          Math.abs(sourceFrame.lookPitch) > 0.0001
        ) {
          hasActivity = true;
        }
      }

      // Move - sum
      if (sourceFrame.moveX !== 0 || sourceFrame.moveY !== 0) {
        this.currentFrame.moveX += sourceFrame.moveX;
        this.currentFrame.moveY += sourceFrame.moveY;
        if (
          Math.abs(sourceFrame.moveX) > 0.05 ||
          Math.abs(sourceFrame.moveY) > 0.05
        ) {
          hasActivity = true;
        }
      }

      if (hasActivity) {
        if (source.id === "keyboard") {
          this.setActiveDevice("keyboard");
        } else if (source.id === "gamepad" || source.id === "dualsense") {
          this.setActiveDevice("gamepad");
        }
      }
    }

    // 4. Clamp move vector to unit length
    const moveLen = Math.hypot(
      this.currentFrame.moveX,
      this.currentFrame.moveY,
    );
    if (moveLen > 1) {
      this.currentFrame.moveX /= moveLen;
      this.currentFrame.moveY /= moveLen;
    }
  }

  public getFrame(): Readonly<InputFrame> {
    return this.currentFrame;
  }

  public pressed(action: ButtonAction): boolean {
    return this.currentFrame.buttons[action];
  }

  public justPressed(action: ButtonAction): boolean {
    return this.currentFrame.buttons[action] && !this.prevButtons[action];
  }

  public justReleased(action: ButtonAction): boolean {
    return !this.currentFrame.buttons[action] && this.prevButtons[action];
  }

  public getActiveDevice(): ActiveDevice {
    return this.activeDevice;
  }

  public setActiveDevice(device: ActiveDevice): void {
    if (this.activeDevice === device) return;
    this.activeDevice = device;
    this.deviceListeners.forEach((listener) => listener(device));
  }

  public subscribeActiveDevice(
    listener: (device: ActiveDevice) => void,
  ): () => void {
    this.deviceListeners.add(listener);
    return (): void => {
      this.deviceListeners.delete(listener);
    };
  }

  public reset(): void {
    this.currentFrame = createEmptyFrame();
    for (const action of BUTTON_ACTIONS) {
      this.prevButtons[action] = false;
    }
    for (const source of this.sources) {
      source.reset();
    }
  }
}
