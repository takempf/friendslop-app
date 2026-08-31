import type { InputFrame } from "./actions";

export interface InputSource {
  readonly id: string;
  /** Attach listeners; returns teardown. */
  connect(): () => void;
  /** Write this source's contribution into `frame`. Once per rendered frame. */
  sample(frame: InputFrame, dt: number): void;
  /** Drop all held state - text input opened, window blurred, menu opened. */
  reset(): void;
}
