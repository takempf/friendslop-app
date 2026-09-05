import { createContext, useContext, useState, type ReactNode } from "react";
import { RangeSession } from "./RangeSession";
const Context = createContext<RangeSession | null>(null);
export function FiringRangeProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => new RangeSession());
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useRangeSession() {
  const session = useContext(Context);
  if (!session) throw new Error("FiringRangeProvider is required");
  return session;
}
