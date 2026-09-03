import type { InputSource } from "../InputSource";
import type { InputFrame } from "../actions";
import { DEFAULT_GAMEPAD_BINDINGS, type GamepadBindings } from "../bindings";
import { PadSampler, type PadSnapshot } from "../padSampling";
import { NO_AIM_MODULATION, type AimModulation } from "../aimModulation";
import { isTextInputActive } from "../textInputMode";
import { gameConfig } from "@/config";

export type GamepadConfig = Pick<
  typeof gameConfig,
  | "gamepadEnabled"
  | "gamepadLookSensitivity"
  | "gamepadLookCurve"
  | "gamepadDeadzone"
  | "gamepadInvertY"
>;

export interface GamepadSourceOptions {
  bindings?: GamepadBindings;
  getGamepads?: () => (Gamepad | null)[];
  getConfig?: () => GamepadConfig;
  getAimModulation?: () => AimModulation;
  /** True while another source owns this pad over raw HID; see `isHidOwned`. */
  getIsHidClaimActive?: () => boolean;
}

/**
 * A DualSense claimed over WebHID is sampled by DualSenseHidSource instead.
 * Platforms differ on whether a claimed device stays visible to the Gamepad
 * API, so skipping it here is what stops it being counted twice where it does.
 */
function isHidOwned(pad: Gamepad): boolean {
  // Chrome spells the id out, e.g. "DualSense Wireless Controller (STANDARD
  // GAMEPAD Vendor: 054c Product: 0ce6)". Matching "wireless controller" alone
  // would also catch an Xbox pad, so key off Sony's vendor id and model names.
  return /054c|dualsense|dualshock/i.test(pad.id);
}

export class GamepadSource implements InputSource {
  public readonly id = "gamepad";

  private readonly bindings: GamepadBindings;
  private readonly getGamepads: () => (Gamepad | null)[];
  private readonly getConfig: () => GamepadConfig;
  private readonly getAimModulation: () => AimModulation;
  private readonly getIsHidClaimActive: () => boolean;

  private readonly sampler = new PadSampler();
  private hasWarnedNonStandard = false;
  private activePadSampled = false;

  public hasActivePad(): boolean {
    return this.activePadSampled;
  }

  constructor(options: GamepadSourceOptions = {}) {
    this.bindings = options.bindings ?? DEFAULT_GAMEPAD_BINDINGS;
    this.getGamepads =
      options.getGamepads ??
      ((): (Gamepad | null)[] => {
        if (typeof navigator !== "undefined" && navigator.getGamepads) {
          return Array.from(navigator.getGamepads());
        }
        return [];
      });
    this.getConfig =
      options.getConfig ??
      ((): GamepadConfig => ({
        gamepadEnabled: gameConfig.gamepadEnabled,
        gamepadLookSensitivity: gameConfig.gamepadLookSensitivity,
        gamepadLookCurve: gameConfig.gamepadLookCurve,
        gamepadDeadzone: gameConfig.gamepadDeadzone,
        gamepadInvertY: gameConfig.gamepadInvertY,
      }));
    this.getAimModulation =
      options.getAimModulation ?? ((): AimModulation => NO_AIM_MODULATION);
    this.getIsHidClaimActive =
      options.getIsHidClaimActive ?? ((): boolean => false);
  }

  public connect(): () => void {
    const handleDisconnect = (): void => {
      this.reset();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("gamepaddisconnected", handleDisconnect);
    }

    return (): void => {
      if (typeof window !== "undefined") {
        window.removeEventListener("gamepaddisconnected", handleDisconnect);
      }
    };
  }

  public sample(frame: InputFrame, dt: number): void {
    this.activePadSampled = false;
    if (isTextInputActive()) return;

    const config = this.getConfig();
    if (!config.gamepadEnabled) return;

    const hidClaimActive = this.getIsHidClaimActive();
    const gamepads = this.getGamepads();
    const pad = gamepads.find(
      (p): p is Gamepad =>
        Boolean(p?.connected) && !(hidClaimActive && isHidOwned(p as Gamepad)),
    );
    if (!pad) return;

    if (pad.mapping !== "standard") {
      if (!this.hasWarnedNonStandard) {
        console.warn(
          `[GamepadSource] Unsupported non-standard gamepad mapping: "${pad.mapping}". Only standard mapping is supported.`,
        );
        this.hasWarnedNonStandard = true;
      }
      return;
    }

    this.activePadSampled = true;

    const snapshot: PadSnapshot = {
      axes: pad.axes,
      buttons: pad.buttons.map((b) => (b.pressed ? Math.max(b.value, 1) : b.value)), // prettier-ignore
    };

    this.sampler.sample(
      frame,
      dt,
      snapshot,
      config,
      this.bindings,
      this.getAimModulation(),
    );
  }

  public reset(): void {
    this.activePadSampled = false;
    this.sampler.reset();
  }
}
