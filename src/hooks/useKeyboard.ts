import { useEffect, useRef } from "react";
import { isTextInputActive, subscribeToTextInput } from "@/input/textInputMode";

export const useKeyboard = (): React.RefObject<{ [key: string]: boolean }> => {
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
    const unsub = subscribeToTextInput((active: boolean): void => {
      if (active) {
        for (const key of Object.keys(keys.current)) {
          keys.current[key] = false;
        }
      }
    });

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isTextInputActive()) return;
      if (Object.prototype.hasOwnProperty.call(keys.current, e.code)) {
        keys.current[e.code] = true;
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (isTextInputActive()) return;
      if (Object.prototype.hasOwnProperty.call(keys.current, e.code)) {
        keys.current[e.code] = false;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return (): void => {
      unsub();
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return keys;
};
