import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary caught]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return (
        <div
          style={{
            padding: 16,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 8,
            color: "#f87171",
            fontSize: 12,
            margin: "8px 0",
          }}
        >
          <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Component Rendering Notice:
          </strong>
          <div
            style={{
              marginTop: 8,
              padding: 10,
              background: "#18181b",
              border: "1px solid #3f3f46",
              color: "#fca5a5",
              borderRadius: 6,
              fontFamily: "monospace",
              fontSize: 12,
              overflowX: "auto",
              maxHeight: 240,
            }}
          >
            <div style={{ fontWeight: "bold", color: "#ef4444", marginBottom: 4 }}>
              {this.state.error?.toString()}
            </div>
            <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap" }}>
              {this.state.error?.stack}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 10,
              padding: "6px 12px",
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              color: "#fff",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: "bold",
            }}
          >
            Retry Component
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
