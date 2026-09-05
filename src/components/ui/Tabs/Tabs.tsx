import {
  useEffect,
  useRef,
  type JSX,
  type ReactNode,
  type WheelEvent,
} from "react";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import styles from "./Tabs.module.css";

interface TabItem {
  value: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  tabs,
  value,
  onValueChange,
  children,
  className,
}: TabsProps): JSX.Element {
  const listRef = useRef<HTMLDivElement | null>(null);

  const handleWheel = (e: WheelEvent<HTMLDivElement>): void => {
    if (e.deltaY !== 0 && e.deltaX === 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  useEffect(() => {
    if (!listRef.current) return;
    const activeTabEl = listRef.current.querySelector<HTMLElement>(
      `button[value="${value}"], [data-active], [data-selected]`,
    );
    if (activeTabEl) {
      activeTabEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [value]);

  return (
    <BaseTabs.Root
      value={value}
      onValueChange={onValueChange}
      className={[styles.root, className].filter(Boolean).join(" ")}
    >
      <BaseTabs.List
        ref={listRef}
        className={styles.list}
        onWheel={handleWheel}
      >
        {tabs.map((tab) => (
          <BaseTabs.Tab
            key={tab.value}
            value={tab.value}
            className={styles.tab}
          >
            {tab.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className={styles.indicator} />
      </BaseTabs.List>
      {children}
    </BaseTabs.Root>
  );
}

export function TabPanel({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <BaseTabs.Panel
      value={value}
      className={[styles.panel, className].filter(Boolean).join(" ")}
    >
      {children}
    </BaseTabs.Panel>
  );
}
