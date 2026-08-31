import type { InputSource } from "./InputSource";
import {
  BUTTON_ACTIONS,
  type ButtonAction,
  type InputFrame,
  type ActiveDevice,
} from "./actions";

function createEmptyFrame(): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    lookYaw: 0,
    lookPitch: 0,
    buttons: {
      jump: false,
      interact: false,
      chargeThrow: false,
      sprint: false,
      crouch: false,
      menu: false,
    },
  };
}

export class InputManager {
  private sources: InputSource[] = [];
  private currentFrame: InputFrame = createEmptyFrame();
  private prevButtons: Record<ButtonAction, boolean> = {
    jump: false,
    interact: false,
    chargeThrow: false,
    sprint: false,
    crouch: false,
    menu: false,
  };

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
      source.sample(sourceFrame, dt);

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

      if (
        hasActivity &&
        (source.id === "keyboard" || source.id === "gamepad")
      ) {
        this.setActiveDevice(source.id as ActiveDevice);
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
