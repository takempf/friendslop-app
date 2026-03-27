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
  children: React.ReactNode;
  className?: string;
}

export function Tabs({
  tabs,
  value,
  onValueChange,
  children,
  className,
}: TabsProps) {
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={onValueChange}
      className={[styles.root, className].filter(Boolean).join(" ")}
    >
      <BaseTabs.List className={styles.list}>
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
  children: React.ReactNode;
}) {
  return (
    <BaseTabs.Panel
      value={value}
      className={[styles.panel, className].filter(Boolean).join(" ")}
    >
      {children}
    </BaseTabs.Panel>
  );
}
