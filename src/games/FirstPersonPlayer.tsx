import { PlayerController } from "@/components/3d/PlayerController/PlayerController";
import { useBasketballBehavior } from "./basketball/useBasketballBehavior";

/** Game-specific composition; the shared player knows no sport rules. */
export function FirstPersonPlayer({ active }: { active: boolean }) {
  const basketball = useBasketballBehavior();
  return <PlayerController active={active} behaviors={{ basketball }} />;
}
