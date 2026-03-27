import { Slider as BaseSlider } from "@base-ui/react/slider";
import styles from "./Slider.module.css";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  variant?: "accent" | "blue" | "yellow";
  className?: string;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  variant = "accent",
  className,
}: SliderProps) {
  const rootClass = [
    styles.root,
    variant !== "accent" ? styles[variant] : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BaseSlider.Root
      value={value}
      onValueChange={(val) => onChange(val as number)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={rootClass}
    >
      <BaseSlider.Control className={styles.control}>
        <BaseSlider.Track className={styles.track}>
          <BaseSlider.Indicator className={styles.indicator} />
          <BaseSlider.Thumb className={styles.thumb} />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
