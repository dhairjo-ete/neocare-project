/**
 * Native Desktop and System Notification Service for NeoCare
 * Enables background OS notifications (Windows, macOS, Linux, PWA, Electron)
 * so doctors and nurses never miss a critical deteriorating infant when the browser
 * tab is minimized or in the background.
 */

export function isDesktopNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getDesktopNotificationPermission() {
  if (!isDesktopNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestDesktopNotificationPermission() {
  if (!isDesktopNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";

  if (Notification.permission !== "denied") {
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (err) {
      console.warn("[DesktopNotification] Permission request error:", err);
      return "default";
    }
  }
  return Notification.permission;
}

/**
 * Triggers a native system alert banner on the user's OS
 * @param {Object} options
 * @param {string} options.title Alert title
 * @param {string} options.body Alert details
 * @param {string} [options.tag] Deduplication tag
 * @param {string} [options.deviceId] Device ID for navigation
 * @param {Function} [options.onClick] Custom click handler
 */
export function showDesktopAlert({
  title,
  body,
  tag = "neocare-emergency",
  deviceId = null,
  onClick = null,
}) {
  if (!isDesktopNotificationSupported() || Notification.permission !== "granted") {
    return null;
  }

  try {
    const options = {
      body,
      icon: "/vite.svg",
      tag,
      requireInteraction: true, // Keep notification pinned on screen until clicked
      silent: false,
    };

    const notification = new Notification(title, options);

    notification.onclick = (e) => {
      e.preventDefault();
      window.focus();
      if (onClick) {
        onClick();
      } else if (deviceId) {
        window.location.href = `/dashboard?device=${deviceId}`;
      }
      notification.close();
    };

    return notification;
  } catch (err) {
    console.warn("[DesktopNotification] Could not display native notification:", err);
    return null;
  }
}
