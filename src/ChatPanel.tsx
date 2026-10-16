
import { useState, useEffect, useRef } from "react";
import type { PointerEvent } from "react";
import { sendMessage, type ChatMessage } from "./ai/chat";
import { geminiLimiter } from "./rateLimiter";
import { useEditor } from "./store";
import "./chat.css";

function CableLogo() {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M10 11V29H29V11H10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M10 20H20V11M20 20V29"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="11" r="3.5" fill="currentColor" />
      <circle cx="29" cy="11" r="3.5" fill="currentColor" />
      <circle cx="10" cy="29" r="3.5" fill="currentColor" />
      <circle cx="29" cy="29" r="3.5" fill="currentColor" />
      <circle
        cx="20"
        cy="20"
        r="3.5"
        fill="#FFFFFF"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitWaitTime, setRateLimitWaitTime] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const [orbPosition, setOrbPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const dragStart = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const didDrag = useRef(false);

  const hasCablePlan = useEditor((s) => s.doc.cablePlan != null);

  const toggleOpen = () => setIsOpen((open) => !open);

  // Drag handlers for the floating button
  const handlePointerDown = (
    e: PointerEvent<HTMLButtonElement>
  ) => {
    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();

    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
    };

    dragOrigin.current = {
      x: rect.left,
      y: rect.top,
    };

    isDragging.current = true;
    didDrag.current = false;

    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (
    e: PointerEvent<HTMLButtonElement>
  ) => {
    if (!isDragging.current) return;

    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      didDrag.current = true;
    }

    if (!didDrag.current) return;

    const size = 66;

    const x = Math.max(
      0,
      Math.min(
        window.innerWidth - size,
        dragOrigin.current.x + dx
      )
    );

    const y = Math.max(
      0,
      Math.min(
        window.innerHeight - size,
        dragOrigin.current.y + dy
      )
    );

    setOrbPosition({ x, y });
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleOrbClick = (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();

    if (didDrag.current) {
      didDrag.current = false;
      return;
    }

    toggleOpen();
  };

  // Original message sending logic
  const send = async () => {
    const userText = text.trim();
    if (!userText || busy) return;

    console.log(
      "[ChatPanel] send:",
      userText,
      "history len:",
      messages.length
    );

    const userMessage: ChatMessage = {
      role: "user",
      content: userText,
    };

    const loadingMessage: ChatMessage = {
      role: "assistant",
      content: "...",
    };

    setMessages([...messages, userMessage, loadingMessage]);

    setBusy(true);
    setText("");

    try {
      const updated = await sendMessage(messages, userText);

      console.log(
        "[ChatPanel] got",
        updated.length,
        "messages back"
      );

      setMessages(updated);
    } catch (err) {
      console.error("[ChatPanel] sendMessage threw:", err);
      setMessages([...messages, userMessage]);
    } finally {
      setBusy(false);
    }
  };

  // Original rate limiter callbacks
  useEffect(() => {
    geminiLimiter.setCallbacks({
      onWaitStart: (waitTimeMs) => {
        setIsRateLimited(true);
        setRateLimitWaitTime(
          Math.round(waitTimeMs / 1000)
        );

        console.log(
          "[ChatPanel] Rate limit hit, waiting",
          waitTimeMs,
          "ms"
        );
      },

      onWaitEnd: () => {
        setIsRateLimited(false);
        setRateLimitWaitTime(0);

        console.log(
          "[ChatPanel] Rate limit wait complete"
        );
      },
    });
  }, []);

  const suggestions = [
    "Why does this plan need so many hubs?",
    "Why were these rooms grouped together?",
    "Why was this hub placed here?",
    "How can I reduce crossings and overlap?",
    "How does our solution compare with the baselines?",
    "What happens if I move this hub?",
  ];

  return (
    <aside
      className={`chat-panel ${
        isOpen
          ? "chat-panel--open"
          : "chat-panel--collapsed"
      }`}
      
style={(() => {
  if (!orbPosition) return undefined;

  if (!isOpen) {
    return {
      left: orbPosition.x,
      top: orbPosition.y,
      right: "auto",
      bottom: "auto",
    };
  }

  const panelWidth = Math.min(460, window.innerWidth - 32);
  const panelHeight = Math.min(700, window.innerHeight - 48);
  const orbSize = 66;
  const gap = 12;

  // Open beside the orb when possible.
  // Otherwise, open on its left.
  const spaceOnRight =
    window.innerWidth - (orbPosition.x + orbSize);

  const preferredX =
    spaceOnRight >= panelWidth + gap
      ? orbPosition.x
      : orbPosition.x + orbSize - panelWidth;

  const left = Math.max(
    8,
    Math.min(window.innerWidth - panelWidth - 8, preferredX)
  );

  // Keep the chat above the orb and inside the viewport.
  const preferredY =
    orbPosition.y + orbSize - panelHeight;

  const top = Math.max(
    8,
    Math.min(window.innerHeight - panelHeight - 8, preferredY)
  );

  return {
    left,
    top,
    right: "auto",
    bottom: "auto",
  };
})()}

    >
      <div
        className="chat-header"
        onClick={!isOpen ? toggleOpen : undefined}
      >
        {isOpen && (
          <div className="chat-brand">
            <div className="chat-brand__logo">
              <CableLogo />
            </div>

            <div className="chat-brand__details">
              <h3>Cable Ring Copilot</h3>
              <span className="chat-brand__subtitle">
                <span className="chat-brand__dot" />
                Cable planning assistant
              </span>
            </div>
          </div>
        )}

        <button
          className="chat-toggle"
          type="button"
          onPointerDown={
            !isOpen ? handlePointerDown : undefined
          }
          onPointerMove={
            !isOpen ? handlePointerMove : undefined
          }
          onPointerUp={
            !isOpen ? handlePointerUp : undefined
          }
          onPointerCancel={
            !isOpen ? handlePointerUp : undefined
          }
          onClick={isOpen ? handleOrbClick : handleOrbClick}
          aria-label={
            isOpen
              ? "Minimize assistant"
              : "Move or open assistant"
          }
          title={
            isOpen
              ? "Minimize"
              : "Drag to move or click to open"
          }
        >
          {isOpen ? (
            "−"
          ) : (
            <>
              <CableLogo />
              <span className="chat-orb__status" />
            </>
          )}
        </button>
      </div>

      {isOpen && (
        <>
          {isRateLimited && (
            <div className="rate-limit-banner">
              <span className="rate-limit-banner__dot" />
              Rate limit reached. Waiting{" "}
              {rateLimitWaitTime}s before continuing...
            </div>
          )}

          <div className="chat-messages">
            {messages.filter(
              (m) => m.role !== "system"
            ).length === 0 && (
              <div className="chat-welcome">
                <div className="chat-welcome__logo">
                  <CableLogo />
                </div>

                <span className="chat-welcome__eyebrow">
                  CABLE RING COPILOT
                </span>

                <h2>
                  {hasCablePlan
                    ? "Let's understand your cable plan."
                    : "Explore the cable solver."}
                </h2>

                <p>
                  Ask why the solver chose its hubs, grouped
                  rooms, or cable routes, and explore the
                  reasoning behind your design.
                </p>

                <div className="chat-suggestions">
                  <span className="chat-suggestions__label">
                    SUGGESTED QUESTIONS
                  </span>

                  {suggestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      className="chat-suggestion"
                      onClick={() => setText(question)}
                    >
                      <span>{question}</span>
                      <span className="chat-suggestion__arrow">
                        ↗
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages
              .filter((m) => m.role !== "system")
              .map((m, i) => (
                <div
                  key={i}
                  className={`chat-msg chat-msg--${m.role} ${
                    m.content === "..."
                      ? "chat-msg--loading"
                      : ""
                  }`}
                >
                  <span className="chat-msg__role">
                    {m.role === "user"
                      ? "YOU"
                      : m.role === "tool"
                        ? "SYSTEM"
                        : "ASSISTANT"}
                  </span>

                  <span className="chat-msg__text">
                    {m.content === "..." ? (
                      <span
                        className="chat-typing"
                        aria-label="Thinking"
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      m.content
                    )}
                  </span>
                </div>
              ))}
          </div>

          <div className="chat-input">
            <input
              value={text}
              placeholder={
                hasCablePlan
                  ? "Ask about your cable plan..."
                  : "Ask about hubs, routes, or optimization..."
              }
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />

            <button
              type="button"
              onClick={send}
              disabled={busy}
            >
              {busy ? "…" : "Send"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
