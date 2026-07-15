// utils/printer.ts

// ==========================================
// 📄 STANDARD ESC/POS CONTROL BYTES (HEX)
// ==========================================
const ESC = 0x1b;
const GS = 0x1d;

export const ESC_POS = {
  INIT_PRINTER: [ESC, 0x40], // Reset printer to default settings
  ALIGN_LEFT: [ESC, 0x61, 0x00], // Left align text
  ALIGN_CENTER: [ESC, 0x61, 0x01], // Center align text
  ALIGN_RIGHT: [ESC, 0x62, 0x02], // Right align text
  FONT_NORMAL: [GS, 0x21, 0x00], // Normal text size
  FONT_DOUBLE: [GS, 0x21, 0x11], // Double height & double width (for logo/headers)
  BOLD_ON: [ESC, 0x45, 0x01], // Bold on
  BOLD_OFF: [ESC, 0x45, 0x00], // Bold off
  PAPER_CUT: [GS, 0x56, 0x41, 0x00], // Full paper auto-cut

  // ⚡ DRAWER KICK PULSE: Sends a 12V/24V pulse to Pin 2 of the RJ11 port
  // This instantly opens your physical cash drawer!
  KICK_DRAWER: [ESC, 0x70, 0x00, 0x19, 0xfa],
};

/**
 * Formats a completed ticket into a raw ESC/POS binary command payload,
 * ready to be transmitted to any 80mm thermal receipt printer via LAN or Bluetooth.
 */
export const generateReceiptPayload = (
  order: any,
  items: any[],
): { bytes: number[]; textMock: string } => {
  let bytes: number[] = [];
  let textMock = "";

  // Helper to append strings and simulate print mock
  const appendText = (
    text: string,
    styleBytes: number[] = ESC_POS.FONT_NORMAL,
  ) => {
    bytes.push(
      ...styleBytes,
      ...Array.from(text).map((c) => c.charCodeAt(0)),
      10,
    ); // 10 is LF (Line Feed)
    textMock += text + "\n";
  };

  const appendBytes = (commandBytes: number[]) => {
    bytes.push(...commandBytes);
  };

  // 1. Initialize Printer
  appendBytes(ESC_POS.INIT_PRINTER);

  // 2. Receipt Header (Centered)
  appendBytes(ESC_POS.ALIGN_CENTER);
  appendText("BURGER PALACE", ESC_POS.FONT_DOUBLE);
  appendText("12 Rue Sainte-Catherine, 33000 Bordeaux");
  appendText("SIRET: 12345678901234");
  appendText("TVA Intracom: FR12345678901");
  appendText(
    "------------------------------------------------",
    ESC_POS.FONT_NORMAL,
  ); // 48 chars wide for standard 80mm

  // 3. Ticket Meta Info (Left-aligned)
  appendBytes(ESC_POS.ALIGN_LEFT);
  const formattedDate = new Date(order.completed_at).toLocaleString("fr-FR");
  appendText(`Ticket #: ${order.sequence_number}`);
  appendText(`Date    : ${formattedDate}`);
  appendText(`UUID    : ${order.uuid}`);
  appendText("------------------------------------------------");

  // 4. Print Table Header (Align Left)
  appendText("QTY  ITEM                               PRICE TTC");
  appendText("------------------------------------------------");

  // 5. Print Item Rows (Formatted to fit exactly 48 columns)
  for (const item of items) {
    const qtyStr = item.quantity.toString().padEnd(5, " "); // 5 chars
    let nameStr = item.product_name;
    const priceVal = (item.unit_price * item.quantity).toFixed(2) + " €";

    // Truncate product name if too long to prevent row wrapping bugs
    if (nameStr.length > 30) {
      nameStr = nameStr.substring(0, 27) + "...";
    }
    nameStr = nameStr.padEnd(30, " "); // 30 chars

    const row = `${qtyStr}${nameStr}${priceVal.padStart(13, " ")}`; // 5 + 30 + 13 = 48 columns
    appendText(row);
  }

  appendText("------------------------------------------------");

  // 6. Print Totals (Excl. VAT, VAT Amount, Total)
  appendBytes(ESC_POS.ALIGN_RIGHT);
  appendText(`Subtotal (HT):   ${order.subtotal_excl_vat.toFixed(2)} €`);
  appendText(`TVA (Tax)    :   ${order.vat_amount.toFixed(2)} €`);
  appendBytes(ESC_POS.BOLD_ON);
  appendText(
    `TOTAL (TTC)  :   ${order.total_incl_vat.toFixed(2)} €`,
    ESC_POS.FONT_DOUBLE,
  );
  appendBytes(ESC_POS.BOLD_OFF);

  appendText(
    "------------------------------------------------",
    ESC_POS.FONT_NORMAL,
  );

  // 7. Footer (Centered)
  appendBytes(ESC_POS.ALIGN_CENTER);
  appendText("Merci de votre visite !");
  appendText("A bientot.");
  appendText("\n\n"); // Feed 2 empty lines

  // 8. ⚡ TRIGGER HARDWARE: Kick Cash Drawer & Auto-cut Paper
  appendBytes(ESC_POS.KICK_DRAWER);
  appendBytes(ESC_POS.PAPER_CUT);

  return { bytes, textMock };
};
