import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL;

let socket;

export function getSocket() {
  if (!socket) {
    // The backend rejects connections without a valid JWT. `auth` as a
    // function is re-evaluated on every (re)connect, so the token saved by the
    // login screen is picked up and refreshed automatically.
    socket = io(SOCKET_URL || "http://localhost:5000", {
      auth: (cb) => {
        AsyncStorage.getItem("neocare_token")
          .then((token) => cb({ token }))
          .catch(() => cb({}));
      },
    });
  }
  return socket;
}

// Call on logout so the next login opens a fresh, correctly-authenticated socket
export function resetSocket() {
  if (socket) {
    socket.disconnect();
    socket = undefined;
  }
}
