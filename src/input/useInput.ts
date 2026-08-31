import { useState, useEffect } from "react";
import { InputManager } from "./InputManager";
import { KeyboardMouseSource } from "./sources/KeyboardMouseSource";
import { GamepadSource } from "./sources/GamepadSource";
import type { ActiveDevice } from "./actions";

export const inputManager = new InputManager([
  new KeyboardMouseSource(),
  new GamepadSource(),
]);

let isConnected = false;
function ensureInputConnected(): () => void {
  if (typeof window === "undefined" || isConnected) {
    return () => {};
  }
  isConnected = true;
  return inputManager.connect();
}

export function useInput(): InputManager {
  useEffect(() => {
    return ensureInputConnected();
  }, []);

  return inputManager;
}

export function useActiveDevice(): ActiveDevice {
  const [device, setDevice] = useState<ActiveDevice>(() =>
    inputManager.getActiveDevice(),
  );

  useEffect(() => {
    ensureInputConnected();
    return inputManager.subscribeActiveDevice((newDevice) => {
      setDevice(newDevice);
    });
  }, []);

  return device;
}
