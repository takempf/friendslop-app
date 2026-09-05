import { PlayerController } from "@/components/3d/PlayerController/PlayerController";
import { useBasketballBehavior } from "./basketball/useBasketballBehavior";
import { useDiscBehavior } from "./discGolf/useDiscBehavior";

/** Game-specific composition; the shared player knows no sport rules. */
export function FirstPersonPlayer({ active }: { active: boolean }) {
  const basketball = useBasketballBehavior();
  const disc = useDiscBehavior();
  return <PlayerController active={active} behaviors={{ basketball, disc }} />;
}
