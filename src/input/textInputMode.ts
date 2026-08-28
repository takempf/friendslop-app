type TextInputListener = (active: boolean) => void;

let textInputActive = false;
const listeners = new Set<TextInputListener>();

export const isTextInputActive = (): boolean => textInputActive;

export const setTextInputActive = (active: boolean): void => {
  if (textInputActive === active) return;
  textInputActive = active;
  listeners.forEach((listener) => listener(active));
};

export const subscribeToTextInput = (
  listener: TextInputListener,
): (() => void) => {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
};
