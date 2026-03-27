import { useState, useEffect } from "react";

export function usePointerLock() {
  const [locked, setLocked] = useState(false);

  const setPointerLockOnElement = (targetElement: HTMLElement) => {
    // Request pointer lock synchronously within the user gesture handler.
    // async/await would defer the fallback into a microtask, which Firefox
    // may reject as outside the user-activation context.
    try {
      const promise = targetElement.requestPointerLock({
        unadjustedMovement: true,
      });
      if (promise instanceof Promise) {
        // unadjustedMovement not supported — fall back immediately
        promise.catch(() => targetElement.requestPointerLock());
      }
    } catch (e) {
      console.log(e);
      targetElement.requestPointerLock();
    }
  };

  useEffect(() => {
    const onChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);

  return {
    locked,
    setPointerLockOnElement,
  };
}
