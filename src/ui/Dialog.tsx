import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import styles from "./Dialog.module.css";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={styles.popup}>
          <div className={styles.header}>
            <BaseDialog.Title className={styles.title}>
              {title}
            </BaseDialog.Title>
            <BaseDialog.Close className={styles.closeBtn} aria-label="Close">
              ✕
            </BaseDialog.Close>
          </div>
          {description && (
            <BaseDialog.Description className={styles.description}>
              {description}
            </BaseDialog.Description>
          )}
          <div className={styles.body}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
