import { Select as BaseSelect } from "@base-ui/react/select";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
}: SelectProps) {
  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
    >
      <BaseSelect.Trigger
        className={[styles.trigger, className].filter(Boolean).join(" ")}
      >
        <BaseSelect.Value className={styles.value} placeholder={placeholder} />
        <BaseSelect.Icon className={styles.icon}>▾</BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner className={styles.positioner}>
          <BaseSelect.Popup className={styles.popup}>
            <BaseSelect.List>
              {options.map((opt) => (
                <BaseSelect.Item
                  key={opt.value}
                  value={opt.value}
                  className={styles.item}
                >
                  <BaseSelect.ItemText className={styles.itemText}>
                    {opt.label}
                  </BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className={styles.itemIndicator}>
                    ✓
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
