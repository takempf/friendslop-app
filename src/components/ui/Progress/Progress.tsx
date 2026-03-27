import { forwardRef, useImperativeHandle, useRef } from "react";
import styles from "./Progress.module.css";

export interface ProgressHandle {
  setValue: (value: number) => void;
}

interface ProgressProps {
  value?: number;
  max?: number;
  variant?: "green" | "blue" | "accent";
  className?: string;
}

/**
 * A thin progress/meter bar. Exposes a `setValue` imperative handle for
 * high-frequency updates (e.g. audio VU meters) that bypass React re-renders.
 */
export const Progress = forwardRef<ProgressHandle, ProgressProps>(
  function Progress({ value = 0, max = 1, variant = "green", className }, ref) {
    const fillRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      setValue(v: number) {
        if (fillRef.current) {
          fillRef.current.style.width = `${Math.min(1, v / max) * 100}%`;
        }
      },
    }));

    return (
      <div
        className={[styles.root, styles[variant], className]
          .filter(Boolean)
          .join(" ")}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          ref={fillRef}
          className={styles.fill}
          style={{ width: `${Math.min(1, value / max) * 100}%` }}
        />
      </div>
    );
  },
);
