/**
 * Detects whether the current execution context is the Electron desktop application.
 */
export const isElectron =
  typeof window !== "undefined" &&
  (Boolean(window.process?.type) ||
    Boolean(window.electron?.isDesktop) ||
    window.location.protocol === "file:" ||
    navigator.userAgent.toLowerCase().includes("electron"));

export default isElectron;
