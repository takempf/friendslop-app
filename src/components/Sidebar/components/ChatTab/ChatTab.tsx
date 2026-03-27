import { useState } from "react";
import { getPlayerColor, getPlayerEmoji } from "@/utils/colors";
import styles from "./ChatTab.module.css";

interface ChatMessage {
  id: string | number;
  text: string;
  senderName: string;
  senderColorIndex?: number;
  senderEmojiIndex?: number;
}

interface ChatTabProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export function ChatTab({ messages, onSend }: ChatTabProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSend(input.trim());
      setInput("");
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>No messages yet…</div>
        )}
        {messages.map((msg) => (
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

      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="text"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </form>
    </div>
  );
}
