import type { InputSource } from "../InputSource";
import type { InputFrame } from "../actions";
import { DEFAULT_KEYBOARD_BINDINGS, type KeyBindings } from "../bindings";
import { isTextInputActive, subscribeToTextInput } from "../textInputMode";

const MAX_DELTA_THRESHOLD = 300;
const DEFAULT_MOUSE_SENSITIVITY = 0.002;

export interface KeyboardMouseSourceOptions {
  bindings?: KeyBindings;
  mouseSensitivity?: number;
}

export class KeyboardMouseSource implements InputSource {
  public readonly id = "keyboard";

  private readonly bindings: KeyBindings;
  private readonly mouseSensitivity: number;
  private readonly heldKeys = new Set<string>();

  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private isFirstMoveAfterLock = true;
  private isSafari = false;

  constructor(options: KeyboardMouseSourceOptions = {}) {
    this.bindings = options.bindings ?? DEFAULT_KEYBOARD_BINDINGS;
    this.mouseSensitivity =
      options.mouseSensitivity ?? DEFAULT_MOUSE_SENSITIVITY;

    if (
      typeof navigator !== "undefined" &&
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    ) {
      this.isSafari = true;
    }
  }

  public connect(): () => void {
    const isBoundKey = (code: string): boolean => {
      if (this.bindings.forward.includes(code)) return true;
      if (this.bindings.backward.includes(code)) return true;
      if (this.bindings.left.includes(code)) return true;
      if (this.bindings.right.includes(code)) return true;
      return Object.values(this.bindings.buttons).some((codes) =>
        codes.includes(code),
      );
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isTextInputActive()) return;
      if (isBoundKey(event.code)) {
        this.heldKeys.add(event.code);
        // Prevent default for gameplay keys like Space or Arrow keys
        if (event.code === "Space") {
          event.preventDefault();
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (isTextInputActive()) return;
      this.heldKeys.delete(event.code);
    };

    const handlePointerLockChange = (): void => {
      if (typeof document !== "undefined" && document.pointerLockElement) {
        this.isFirstMoveAfterLock = true;
      }
      this.heldKeys.delete("Mouse0");
      this.heldKeys.delete("Mouse2");
      this.mouseDeltaX = 0;
      this.mouseDeltaY = 0;
    };

    const handleMouseMove = (event: MouseEvent): void => {
      if (typeof document === "undefined" || !document.pointerLockElement) {
        return;
      }
      if (isTextInputActive()) return;

      if (this.isFirstMoveAfterLock) {
        this.isFirstMoveAfterLock = false;
        return;
      }

      if (
        Math.abs(event.movementX) > MAX_DELTA_THRESHOLD ||
        Math.abs(event.movementY) > MAX_DELTA_THRESHOLD
      ) {
        return;
      }

      const multiplier = this.isSafari ? 2.5 : 1;
      this.mouseDeltaX += (event.movementX || 0) * multiplier;
      this.mouseDeltaY += (event.movementY || 0) * multiplier;
    };

    const handleMouseDown = (event: MouseEvent): void => {
      if (document.pointerLockElement && !isTextInputActive())
        this.heldKeys.add(`Mouse${event.button}`);
    };
    const handleMouseUp = (event: MouseEvent): void => {
      this.heldKeys.delete(`Mouse${event.button}`);
    };
    const handleBlur = (): void => this.reset();
    const unsubTextInput = subscribeToTextInput((active) => {
      if (active) {
        this.reset();
      }
    });

    if (typeof window !== "undefined") {
      window.addEventListener("mousedown", handleMouseDown);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("blur", handleBlur);
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      document.addEventListener("pointerlockchange", handlePointerLockChange);
      document.addEventListener("mousemove", handleMouseMove);
    }

    return (): void => {
      unsubTextInput();
      if (typeof window !== "undefined") {
        window.removeEventListener("mousedown", handleMouseDown);
        window.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("blur", handleBlur);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        document.removeEventListener(
          "pointerlockchange",
          handlePointerLockChange,
        );
        document.removeEventListener("mousemove", handleMouseMove);
      }
    };
  }

  public sample(frame: InputFrame): void {
    if (isTextInputActive()) return;

    let moveX = 0;
    let moveY = 0;

    const hasForward = this.bindings.forward.some((k) => this.heldKeys.has(k));
    const hasBackward = this.bindings.backward.some((k) =>
      this.heldKeys.has(k),
    );
    const hasLeft = this.bindings.left.some((k) => this.heldKeys.has(k));
    const hasRight = this.bindings.right.some((k) => this.heldKeys.has(k));

    if (hasForward) moveY -= 1;
    if (hasBackward) moveY += 1;
    if (hasLeft) moveX -= 1;
    if (hasRight) moveX += 1;

    frame.moveX += moveX;
    frame.moveY += moveY;

    for (const [action, keys] of Object.entries(this.bindings.buttons)) {
      const buttonAction = action as keyof typeof frame.buttons;
      if (keys.some((k) => this.heldKeys.has(k))) {
        frame.buttons[buttonAction] = true;
      }
    }

    if (
      typeof document !== "undefined" &&
      document.pointerLockElement &&
      (this.mouseDeltaX !== 0 || this.mouseDeltaY !== 0)
    ) {
      frame.lookYaw -= this.mouseDeltaX * this.mouseSensitivity;
      frame.lookPitch -= this.mouseDeltaY * this.mouseSensitivity;
      this.mouseDeltaX = 0;
      this.mouseDeltaY = 0;
    }
  }

  public reset(): void {
    this.heldKeys.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.isFirstMoveAfterLock = true;
  }
}
