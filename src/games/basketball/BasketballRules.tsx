import { createContext, useContext, useRef } from "react";

const Context = createContext<React.RefObject<Map<number, number>> | null>(
  null,
);
export function BasketballRules({ children }: { children: React.ReactNode }) {
  const shotPoints = useRef(new Map<number, number>());
  return <Context.Provider value={shotPoints}>{children}</Context.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useBasketballShotPoints() {
  const value = useContext(Context);
  if (!value) throw new Error("BasketballRules is missing");
  return value;
}
