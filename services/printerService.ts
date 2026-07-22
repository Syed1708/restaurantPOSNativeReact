// services/printerService.ts
import { showFeedback } from "../components/toastHelper";
import { generateReceiptPayload } from "../utils/printer";

// Custom connection type enum to prevent static native imports
export enum PrinterConnectType {
  BLUETOOTH = "BLUETOOTH",
  TCP = "TCP",
}

class PrinterService {
  private printerInstance: any = null;

  // 🚀 THE FIX: Hardcode to false for Expo Go development.
  // This completely prevents any boot-level native package loading!
  public isAvailable: boolean = false;

  constructor() {
    // No require() statements inside the constructor!
    console.log("[Printer Service] Running in Expo Go (simulating prints).");
  }

  /**
   * Connects to a specific printer (Bluetooth or LAN/TCP).
   * This is only called inside active event handlers, so it will never crash on boot.
   */
  async connectPrinter(
    address: string,
    type: PrinterConnectType,
  ): Promise<boolean> {
    if (!this.isAvailable) {
      showFeedback(
        "Printer Offline",
        "Cannot connect: Native printer not available.",
      );
      return false;
    }
    try {
      // 🚀 Comment out during Expo Go development:
      // const EscPos = require("react-native-escpos").default;
      // const { ConnectType } = require("react-native-escpos");

      // const nativeType = type === PrinterConnectType.BLUETOOTH ? ConnectType.BLUETOOTH : ConnectType.TCP;

      // this.printerInstance = new EscPos(address, nativeType);
      // await this.printerInstance.connect();

      console.log(`[Printer Service] Connected to printer: ${address}`);
      showFeedback("Printer Online", `Connected to ${address}`);
      return true;
    } catch (error) {
      console.error(
        `[Printer Service] Failed to connect to ${address}:`,
        error,
      );
      showFeedback("Printer Error", `Failed to connect to ${address}`);
      this.printerInstance = null;
      return false;
    }
  }
  //   async connectPrinter(
  //     address: string,
  //     type: PrinterConnectType,
  //   ): Promise<boolean> {
  //     if (!this.isAvailable) {
  //       showFeedback(
  //         "Printer Offline",
  //         "Cannot connect: Native printer not available.",
  //       );
  //       return false;
  //     }
  //     try {
  //       const EscPos = require("react-native-escpos").default;
  //       const { ConnectType } = require("react-native-escpos");

  //       const nativeType =
  //         type === PrinterConnectType.BLUETOOTH
  //           ? ConnectType.BLUETOOTH
  //           : ConnectType.TCP;

  //       this.printerInstance = new EscPos(address, nativeType);
  //       await this.printerInstance.connect();

  //       console.log(`[Printer Service] Connected to printer: ${address}`);
  //       showFeedback("Printer Online", `Connected to ${address}`);
  //       return true;
  //     } catch (error) {
  //       console.error(
  //         `[Printer Service] Failed to connect to ${address}:`,
  //         error,
  //       );
  //       showFeedback("Printer Error", `Failed to connect to ${address}`);
  //       this.printerInstance = null;
  //       return false;
  //     }
  //   }

  /**
   * Prints a receipt payload (generated from utils/printer.ts) to the connected printer.
   */
  async printReceipt(order: any, items: any[]): Promise<void> {
    const { bytes, textMock } = generateReceiptPayload(order, items);

    // ⚠️ SIMULATE FOR EXPO GO:
    // This blocks the native require() and prints the simulated receipt to your terminal instead!
    if (!this.isAvailable || !this.printerInstance) {
      console.log("\n\n--- 📄 SIMULATED THERMAL RECEIPT (80mm) ---");
      console.log(textMock);
      console.log("--- ⚡ HARDWARE COMMANDS EXECUTED ---");
      console.log(`[Drawer Kick Command Sent]: SUCCESS (Simulated)`);
      console.log(`[Auto-Paper Cut Executed]: SUCCESS (Simulated)`);
      console.log("-------------------------------------------\n\n");
      showFeedback("Receipt Printed", "Simulated receipt printed to console.");
      return;
    }

    // 🚀 PRODUCTION: Send raw bytes to physical printer
    try {
      await this.printerInstance.print(bytes);
      console.log("[Printer Service] Receipt sent to physical printer.");
      showFeedback("Receipt Printed", "Ticket imprimé !");
    } catch (error) {
      console.error("[Printer Service] Failed to send print job:", error);
      showFeedback("Printer Error", "Échec de l'impression.");
    }
  }
}

export const printerService = new PrinterService();
