// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { Switch } from "./Switch";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Switch component", () => {
  it("renders both OFF and ON labels", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onChange = vi.fn();

    await act(async () => {
      root.render(createElement(Switch, { checked: false, onChange }));
    });

    const button = container.querySelector("button[role='switch']");
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("OFF");
    expect(button?.textContent).toContain("ON");
    expect(button?.getAttribute("aria-checked")).toBe("false");
    expect(button?.getAttribute("data-checked")).toBeNull();
  });

  it("reflects checked state with data-checked attribute", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onChange = vi.fn();

    await act(async () => {
      root.render(createElement(Switch, { checked: true, onChange }));
    });

    const button = container.querySelector("button[role='switch']");
    expect(button?.getAttribute("aria-checked")).toBe("true");
    expect(button?.getAttribute("data-checked")).toBe("true");
  });
});
