import { useState, useEffect } from "react";
import { sendMessage, type ChatMessage } from "./ai/chat";
import { geminiLimiter } from "./rateLimiter";
import { useEditor } from "./store";
import "./chat.css";


export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitWaitTime, setRateLimitWaitTime] = useState(0);
  const [isOpen, setIsOpen] = useState(false)
  const toggleOpen = () => setIsOpen(!isOpen)
  const hasCablePlan = useEditor((s) => s.doc.cablePlan != null)

  const send = async () => {
    const userText = text.trim();
    if (!userText || busy) return;
    console.log("[ChatPanel] send:", userText, "history len:", messages.length);

    // Add user message immediately
    const userMessage: ChatMessage = { role: "user", content: userText };

    // Add loading indicator
    const loadingMessage: ChatMessage = { role: "assistant", content: "..." };
    setMessages([...messages, userMessage, loadingMessage]);

    setBusy(true);
    setText("");
    try {
      const updated = await sendMessage(messages, userText);
      console.log("[ChatPanel] got", updated.length, "messages back");
      setMessages(updated);  // This replaces the loading message with real response
    } catch (err) {
      console.error("[ChatPanel] sendMessage threw:", err);
      // Remove loading message on error
      setMessages([...messages, userMessage]);
    } finally {
      setBusy(false);
    }
  };

  // Set up rate limiter callbacks
  useEffect(() => {
    geminiLimiter.setCallbacks({
      onWaitStart: (waitTimeMs) => {
        setIsRateLimited(true);
        setRateLimitWaitTime(Math.round(waitTimeMs / 1000));
        console.log("[ChatPanel] Rate limit hit, waiting", waitTimeMs, "ms");
      },
      onWaitEnd: () => {
        setIsRateLimited(false);
        setRateLimitWaitTime(0);
        console.log("[ChatPanel] Rate limit wait complete");
      },
    });
  }, []); // Empty array = run once on mount

  return (
    <aside className={`chat-panel ${isOpen ? "" : "chat-panel--collapsed"}`}>
      <div className="chat-header" onClick={toggleOpen}>
        {isOpen && <h3>AI Assistant</h3>}
        <button className="chat-toggle" type="button">
          {isOpen ? "◀" : "▶"}
        </button>
      </div>

      {isOpen && (
        <>
          {isRateLimited && (
            <div className="rate-limit-banner">
              Rate limit reached. Waiting {rateLimitWaitTime}s before continuing...
            </div>
          )}

          <div className="chat-messages">
            {messages
              .filter((m) => m.role !== "system")
              .map((m, i) => (
                <div key={i} className={`chat-msg chat-msg--${m.role} ${m.content === "..." ? "chat-msg--loading" : ""}`}>
                  <span className="chat-msg__role">{m.role}</span>
                  <span className="chat-msg__text">{m.content}</span>
                </div>
              ))}
          </div>

          <div className="chat-input">
            <input
              value={text}
              placeholder={hasCablePlan ? "e.g. Why does this plan need these hubs?" : "e.g. Add a sofa at [2,0,1]"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button type="button" onClick={send} disabled={busy}>
              {busy ? "…" : "Send"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
