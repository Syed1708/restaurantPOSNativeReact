// api/stripe.ts
import { initStripeTerminal } from "@stripe/stripe-terminal-react-native";
import { apiClient } from "./client";

/**
 * Initializes the physical Stripe Terminal SDK on your tablet.
 * Automatically fetches secure connection tokens from your Laravel backend!
 */
export const initializeStripeTerminalSDK = async (): Promise<boolean> => {
  try {
    // ⚠️ CRITICAL SAFEGUARD:
    // If you are running inside standard Expo Go, this package will be undefined.
    // We check if the package is available to prevent crashing during development!
    if (!initStripeTerminal) {
      console.log(
        "[Stripe SDK] Package is not available in standard Expo Go. Skipping initialization.",
      );
      return false;
    }

    await initStripeTerminal({
      // Dynamically fetch the authorized connection token from Laragon
      fetchTokenProvider: async () => {
        const response = await apiClient.post("/stripe/connection-token");
        return response.data.secret;
      },
    });

    console.log(
      "[Stripe SDK] Physical Stripe Terminal initialized successfully!",
    );
    return true;
  } catch (error) {
    console.error("[Stripe SDK] Initialization failed:", error);
    return false;
  }
};
