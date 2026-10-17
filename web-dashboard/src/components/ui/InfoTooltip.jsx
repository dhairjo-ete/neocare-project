import React, { useState } from "react";

/**
 * InfoTooltip Component
 * Renders an accessible (i) information indicator next to form labels.
 * Provides clear guidance that phone numbers must be active on WhatsApp.
 */
export default function InfoTooltip({
  text = "This number must be available on WhatsApp to receive automated clinical notifications and updates.",
  whatsapp = true,
}) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="info-tooltip-container"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        marginLeft: 6,
        verticalAlign: "middle",
        cursor: "pointer",
      }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => {
        e.stopPropagation();
        setShow((prev) => !prev);
      }}
      aria-label={text}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: show ? "var(--brand)" : "rgba(14, 165, 233, 0.12)",
          color: show ? "#ffffff" : "var(--brand)",
          border: "1px solid rgba(14, 165, 233, 0.35)",
          fontSize: 10,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
          transition: "all 0.15s ease",
          userSelect: "none",
        }}
        title={text}
      >
        i
      </span>

      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0f172a",
            color: "#f8fafc",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 11.5,
            lineHeight: 1.45,
            width: "max-content",
            maxWidth: 260,
            whiteSpace: "normal",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
            zIndex: 9999,
            pointerEvents: "none",
            fontWeight: 400,
            textAlign: "left",
          }}
        >
          {whatsapp && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "#22c55e",
                fontWeight: 700,
                fontSize: 11,
                marginBottom: 3,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              WhatsApp Required
            </span>
          )}
          <span style={{ display: "block" }}>{text}</span>
        </span>
      )}
    </span>
  );
}
