import type { JSX, MouseEvent, KeyboardEvent } from "react";
import styles from "./Switch.module.css";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  className,
  ariaLabel,
}: SwitchProps): JSX.Element {
  const handleClick = (): void => {
    if (disabled) return;
    onChange(!checked);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const handleSegmentClick = (
    value: boolean,
    e: MouseEvent<HTMLSpanElement>,
  ): void => {
    e.stopPropagation();
    if (disabled) return;
    onChange(value);
  };

  const rootClass = [styles.switch, className].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={rootClass}
      data-checked={checked ? "true" : undefined}
    >
      <span className={styles.thumb} aria-hidden="true" />
      <span
        className={`${styles.label} ${!checked ? styles.labelActive : ""}`}
        onClick={(e): void => handleSegmentClick(false, e)}
        aria-hidden="true"
      >
        OFF
      </span>
      <span
        className={`${styles.label} ${checked ? styles.labelActive : ""}`}
        onClick={(e): void => handleSegmentClick(true, e)}
        aria-hidden="true"
      >
        ON
      </span>
    </button>
  );
}
