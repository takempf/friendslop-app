import { setConsoleFunction } from "three";

const SUPPRESSED_CONSOLE_WARNINGS: readonly string[] = [
  "using deprecated parameters for the initialization function",
  "Clock: This module has been deprecated",
  "PCFSoftShadowMap has been deprecated",
];

export function initWarningFilters(): void {
  setConsoleFunction(
    (type: string, message: string, ...params: unknown[]): void => {
      if (
        type === "warn" &&
        SUPPRESSED_CONSOLE_WARNINGS.some((pattern) => message.includes(pattern))
      ) {
        return;
      }

      if (type === "error") {
        console.error(message, ...params);
      } else if (type === "warn") {
        console.warn(message, ...params);
      } else {
        console.log(message, ...params);
      }
    },
  );

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]): void => {
    const firstArg = args[0];
    if (
      typeof firstArg === "string" &&
      SUPPRESSED_CONSOLE_WARNINGS.some((pattern) => firstArg.includes(pattern))
    ) {
      return;
    }
    originalWarn(...args);
  };
}
