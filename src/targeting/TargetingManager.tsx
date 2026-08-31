import type { JSX } from "react";
import { useTargeting } from "./useTargeting";

export function TargetingManager(): JSX.Element | null {
  useTargeting();
  return null;
}
