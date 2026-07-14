import axios from "axios";
import * as SecureStore from "expo-secure-store";

// ⚠️ Replace this with your actual computer IP address (e.g. 'http://192.168.1.50:8000/api')
// const BASE_URL = "http://10.178.169.244:8000/api";
const BASE_URL = "http://10.178.169.244:8000/api";

// eslint-disable-next-line import/no-named-as-default-member
export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Automatically intercept and attach the secure token to every outgoing API call
apiClient.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync("user_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);
