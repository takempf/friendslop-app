import { useState, useEffect } from "react";
import { InputManager } from "./InputManager";
import { KeyboardMouseSource } from "./sources/KeyboardMouseSource";
import { GamepadSource } from "./sources/GamepadSource";
import { dualSenseHidSource } from "./dualsenseSource";
import type { ActiveDevice } from "./actions";

import { aimModulation } from "./aimModulation";
import { aimState } from "@/targeting/aimState";
import { resolveSlowdown } from "@/targeting/assistPolicy";
import { gameConfig } from "@/config";

// Composition root: This is the ONLY place where input and targeting meet.
// GamepadSource queries the aim assist layer's slowdown via this injected accessor,
// which resolves the targeting layer's policy into the input layer's value type.
const getAimModulation = (): typeof aimModulation => {
  aimModulation.slowdown = resolveSlowdown(aimState, gameConfig);
  return aimModulation;
};

dualSenseHidSource.setAimModulationAccessor(getAimModulation);

export const inputManager: InputManager = new InputManager([
  new KeyboardMouseSource(),
  new GamepadSource({
    getAimModulation,
    // A DualSense held over WebHID is sampled by its own source instead.
    getIsHidClaimActive: () => dualSenseHidSource.ownsDevice(),
  }),
  dualSenseHidSource,
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
    return inputManager.subscribeActiveDevice((newDevice: ActiveDevice) => {
      setDevice(newDevice);
    });
  }, []);

  return device;
}
