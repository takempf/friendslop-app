// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KeyboardMouseSource } from "./KeyboardMouseSource";
import { createEmptyFrame } from "../actions";
import { setTextInputActive } from "../textInputMode";

describe("KeyboardMouseSource", () => {
  let source: KeyboardMouseSource;
  let disconnect: () => void;

  beforeEach(() => {
    setTextInputActive(false);
    source = new KeyboardMouseSource();
    disconnect = source.connect();
  });

  afterEach(() => {
    disconnect();
    setTextInputActive(false);
  });

  it("handles W keydown and sets moveY = -1", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }),
    );
    const frame = createEmptyFrame();
    source.sample(frame);
    expect(frame.moveY).toBe(-1);
    expect(frame.moveX).toBe(0);
  });

  it("handles simultaneous W and A keydowns for diagonal input", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyA", bubbles: true }),
    );
    const frame = createEmptyFrame();
    source.sample(frame);
    expect(frame.moveY).toBe(-1);
    expect(frame.moveX).toBe(-1);
  });

  it("clears held state on keyup", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keyup", { code: "KeyW", bubbles: true }),
    );
    const frame = createEmptyFrame();
    source.sample(frame);
    expect(frame.moveY).toBe(0);
  });

  it("maps bound action keys to buttons", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyE", bubbles: true }),
    );
    const frame = createEmptyFrame();
    source.sample(frame);
    expect(frame.buttons.jump).toBe(true);
    expect(frame.buttons.interact).toBe(true);
    expect(frame.buttons.sprint).toBe(false);
  });

  it("resets held keys when text input becomes active", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }),
    );
    setTextInputActive(true);

    const frame = createEmptyFrame();
    source.sample(frame);
    expect(frame.moveY).toBe(0);
  });

  it("ignores unbound keys and does not prevent default on them", () => {
    const event = new KeyboardEvent("keydown", {
      code: "KeyZ",
      cancelable: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    const frame = createEmptyFrame();
    source.sample(frame);
    expect(frame.moveX).toBe(0);
    expect(frame.moveY).toBe(0);
  });
});
