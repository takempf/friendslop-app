import { describe, it, expect } from "vitest";
import { BUTTON_ACTIONS } from "./actions";
import {
  DEFAULT_KEYBOARD_BINDINGS,
  DEFAULT_GAMEPAD_BINDINGS,
} from "./bindings";

describe("bindings", () => {
  it("defines both a keyboard and a gamepad binding for every ButtonAction", () => {
    for (const action of BUTTON_ACTIONS) {
      const kbBinding = DEFAULT_KEYBOARD_BINDINGS.buttons[action];
      expect(kbBinding).toBeDefined();
      expect(kbBinding.length).toBeGreaterThan(0);

      const gpBinding = DEFAULT_GAMEPAD_BINDINGS.buttons[action];
      expect(gpBinding).toBeDefined();
      expect(typeof gpBinding).toBe("number");
    }
  });

  it("does not bind any gamepad button index more than once", () => {
    const indices = Object.values(DEFAULT_GAMEPAD_BINDINGS.buttons);
    const uniqueIndices = new Set(indices);
    expect(uniqueIndices.size).toBe(indices.length);
  });
});
