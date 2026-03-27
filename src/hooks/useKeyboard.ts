import { useEffect, useRef } from "react";

export const useKeyboard = () => {
  const keys = useRef<{ [key: string]: boolean }>({
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    KeyE: false,
    KeyQ: false,
    Space: false,
    ShiftLeft: false,
    KeyC: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (Object.prototype.hasOwnProperty.call(keys.current, e.code)) {
        keys.current[e.code] = true;
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (Object.prototype.hasOwnProperty.call(keys.current, e.code)) {
        keys.current[e.code] = false;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return keys;
};
