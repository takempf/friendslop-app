import { useState, useRef, useEffect, type JSX } from "react";
import { useGameSync } from "@/sync/GameSyncProvider";
import { getPlayerColor, getPlayerEmoji } from "@/utils/colors";
import { setTextInputActive } from "@/input/textInputMode";
import type { ChatMessage } from "@/sync/IGameSync";
import styles from "./ChatOverlay.module.css";

const PEEK_MS = 7000;

interface ChatOverlayProps {
  active: boolean;
  onClose: () => void;
  isMenuOpen: boolean;
}

export function ChatOverlay({
  active,
  onClose,
  isMenuOpen,
}: ChatOverlayProps): JSX.Element | null {
  const { sync } = useGameSync();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [peeking, setPeeking] = useState(false);

  const initializedRef = useRef(false);
  const lastMessageCountRef = useRef(0);
  const peekTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTextInputActive(active);
    if (active) {
      inputRef.current?.focus();
    }
    return (): void => {
      setTextInputActive(false);
    };
  }, [active]);

  useEffect(() => {
    if (!sync) return;
    const unsub = sync.subscribeToChat((messages) => {
      setChatMessages(messages);
      if (!initializedRef.current) {
        initializedRef.current = true;
        lastMessageCountRef.current = messages.length;
        return;
      }
      if (messages.length > lastMessageCountRef.current) {
        setPeeking(true);
        if (peekTimeoutRef.current !== null) {
          window.clearTimeout(peekTimeoutRef.current);
        }
        peekTimeoutRef.current = window.setTimeout((): void => {
          setPeeking(false);
        }, PEEK_MS);
      }
      lastMessageCountRef.current = messages.length;
    });
    return (): void => {
      unsub();
    };
  }, [sync]);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const trimmed = draft.trim();
        if (trimmed.length > 0) {
          sync?.sendChatMessage(trimmed);
        }
        setDraft("");
        onClose();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setDraft("");
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return (): void => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [active, draft, onClose, sync]);

  useEffect(() => {
    return (): void => {
      if (peekTimeoutRef.current !== null) {
        window.clearTimeout(peekTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [chatMessages, active]);

  if (isMenuOpen || (chatMessages.length === 0 && !active)) {
    return null;
  }

  const containerClass = `${styles.container} ${
    active ? styles.active : peeking ? styles.peeking : ""
  }`;

  const messagesClass = `${styles.messages} ${
    active ? styles.messagesActive : styles.messagesPeek
  }`;

  return (
    <div className={containerClass}>
      <div ref={messagesContainerRef} className={messagesClass}>
        {chatMessages.map((msg) => (
          <div key={msg.id} className={styles.message}>
            <span
              className={styles.sender}
              style={{ color: getPlayerColor(msg.senderColorIndex ?? 0) }}
            >
              {getPlayerEmoji(msg.senderEmojiIndex ?? 0)} {msg.senderName}:{" "}
            </span>
            <span className={styles.text}>{msg.text}</span>
          </div>
        ))}
      </div>

      {active && (
        <form
          className={styles.inputRow}
          onSubmit={(e): void => {
            e.preventDefault();
          }}
        >
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            placeholder="Type a message…"
            value={draft}
            onChange={(e): void => setDraft(e.target.value)}
          />
        </form>
      )}
    </div>
  );
}
