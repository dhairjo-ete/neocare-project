import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    console.warn("[fcm] push notification permission not granted");
    return null;
  }
  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data; // send this to your backend, save on the User model
}
