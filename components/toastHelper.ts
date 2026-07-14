import { Alert, Platform, ToastAndroid } from "react-native";

export const showFeedback = (title: string, message: string) => {
  if (Platform.OS === "android") {
    // Android native floating Toast (disappears automatically)
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // iOS native Alert popup
    Alert.alert(title, message);
  }
};
