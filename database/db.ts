// database/db.ts
import * as SQLite from "expo-sqlite";
import { sha256 } from "../utils/crypto";

// Open or create the local database file
export const db = SQLite.openDatabaseSync("pos_offline.db");

export const initLocalDatabase = (): void => {
  try {
    db.execSync(`
      PRAGMA journal_mode = WAL;

      -- Local Categories Table
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL
      );

      -- Local Products Table
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY NOT NULL,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        vat_rate REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY (category_id) REFERENCES categories (id)
      );

      -- Local Orders Table
      CREATE TABLE IF NOT EXISTS local_orders (
        uuid TEXT PRIMARY KEY NOT NULL,
        sequence_number INTEGER NOT NULL,
        subtotal_excl_vat REAL NOT NULL,
        vat_amount REAL NOT NULL,
        total_incl_vat REAL NOT NULL,
        hash TEXT,
        previous_hash TEXT,
        completed_at TEXT NOT NULL,
        is_synced INTEGER DEFAULT 0,
        local_daily_closure_id INTEGER -- 🚀 Link to local daily closures
      );

      -- Local Order Items
      CREATE TABLE IF NOT EXISTS local_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_uuid TEXT NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        vat_rate REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (order_uuid) REFERENCES local_orders (uuid)
      );

      -- Local Payments Table
      CREATE TABLE IF NOT EXISTS local_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_uuid TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        FOREIGN KEY (order_uuid) REFERENCES local_orders (uuid)
      );

      -- 🚀 NEW: Local Daily Closures (Z-Reports) Table
      CREATE TABLE IF NOT EXISTS local_daily_closures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        z_number INTEGER UNIQUE NOT NULL,
        total_ttc REAL NOT NULL,
        total_ht REAL NOT NULL,
        total_tva REAL NOT NULL,
        hash TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        closed_at TEXT NOT NULL,
        is_synced INTEGER DEFAULT 0
      );
    `);

    // 🚀 AUTOMATED DB UPGRADE:
    // This safely adds the 'local_daily_closure_id' column to existing local_orders tables
    // on previous installations without throwing errors or requiring uninstallation!
    try {
      db.execSync(
        "ALTER TABLE local_orders ADD COLUMN local_daily_closure_id INTEGER;",
      );
      console.log(
        "Local Database upgraded successfully: local_daily_closure_id column added!",
      );
    } catch (error) {
      // Column already exists, ignore!
    }

    console.log("Local SQLite Database Initialized successfully!");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

const formatFloat = (val: number): string => {
  const formatted = val.toFixed(2);
  return formatted === "-0.00" ? "0.00" : formatted;
};

// ==========================================
// Offline Menu Sync Helper Functions
// ==========================================

interface ProductSyncData {
  id: number;
  name: string;
  price: number;
  vat_rate: number;
  is_active: boolean;
}

interface CategorySyncData {
  id: number;
  name: string;
  products: ProductSyncData[];
}

export const saveMenuToLocalDb = (categories: CategorySyncData[]): void => {
  db.withTransactionSync(() => {
    db.execSync("DELETE FROM products;");
    db.execSync("DELETE FROM categories;");

    for (const category of categories) {
      db.runSync("INSERT INTO categories (id, name) VALUES (?, ?);", [
        category.id,
        category.name,
      ]);

      for (const product of category.products) {
        db.runSync(
          "INSERT INTO products (id, category_id, name, price, vat_rate, is_active) VALUES (?, ?, ?, ?, ?, ?);",
          [
            product.id,
            category.id,
            product.name,
            product.price,
            product.vat_rate,
            product.is_active ? 1 : 0,
          ],
        );
      }
    }
  });
  console.log("Local Menu synced and saved to SQLite successfully!");
};

export const getLocalCategories = (): any[] => {
  return db.getAllSync("SELECT * FROM categories;");
};

export const getLocalProducts = (): any[] => {
  return db.getAllSync("SELECT * FROM products;");
};

// ======================================================
// Offline Order Save & Cloud Sync SQLite Helpers
// ======================================================

export const getNextSequenceNumber = (): number => {
  const result: any = db.getFirstSync(
    "SELECT COUNT(*) as count FROM local_orders;",
  );
  return (result?.count || 0) + 1;
};

export const getLastOrderHash = (): string => {
  const result: any = db.getFirstSync(
    "SELECT hash FROM local_orders ORDER BY sequence_number DESC LIMIT 1;",
  );
  return (
    result?.hash ||
    "0000000000000000000000000000000000000000000000000000000000000000"
  );
};

export const saveOrderLocally = (
  uuid: string,
  subtotalExclVat: number,
  vatAmount: number,
  totalInclVat: number,
  items: any[],
  paymentMethod: string,
): number => {
  const sequenceNumber = getNextSequenceNumber();
  const completedAt = new Date().toISOString().split(".")[0] + "Z";

  const previousHash = getLastOrderHash();

  const dataToHash = `${sequenceNumber}|${formatFloat(subtotalExclVat)}|${formatFloat(vatAmount)}|${formatFloat(totalInclVat)}|${completedAt}|${previousHash}`;
  const currentHash = sha256(dataToHash);

  db.withTransactionSync(() => {
    db.runSync(
      "INSERT INTO local_orders (uuid, sequence_number, subtotal_excl_vat, vat_amount, total_incl_vat, hash, previous_hash, completed_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0);",
      [
        uuid,
        sequenceNumber,
        subtotalExclVat,
        vatAmount,
        totalInclVat,
        currentHash,
        previousHash,
        completedAt,
      ],
    );

    for (const item of items) {
      db.runSync(
        "INSERT INTO local_order_items (order_uuid, product_id, product_name, quantity, unit_price, vat_rate, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?);",
        [
          uuid,
          item.id,
          item.name,
          item.quantity,
          item.price,
          item.vat_rate,
          item.price * item.quantity,
        ],
      );
    }

    db.runSync(
      "INSERT INTO local_payments (order_uuid, amount, method) VALUES (?, ?, ?);",
      [uuid, totalInclVat, paymentMethod],
    );
  });

  return sequenceNumber;
};

export const getUnsyncedOrders = (): any[] => {
  const orders: any[] = db.getAllSync(
    "SELECT * FROM local_orders WHERE is_synced = 0;",
  );
  const payload: any[] = [];

  for (const order of orders) {
    const items: any[] = db.getAllSync(
      "SELECT * FROM local_order_items WHERE order_uuid = ?;",
      [order.uuid],
    );
    const payments: any[] = db.getAllSync(
      "SELECT * FROM local_payments WHERE order_uuid = ?;",
      [order.uuid],
    );

    payload.push({
      uuid: order.uuid,
      sequence_number: order.sequence_number,
      subtotal_excl_vat: order.subtotal_excl_vat,
      vat_amount: order.vat_amount,
      total_incl_vat: order.total_incl_vat,
      hash: order.hash,
      previous_hash: order.previous_hash,
      completed_at: order.completed_at,
      items: items.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        vat_rate: i.vat_rate,
        subtotal: i.subtotal,
      })),
      payments: payments.map((p) => ({
        amount: p.amount,
        method: p.method,
      })),
    });
  }

  return payload;
};

export const markOrdersAsSynced = (uuids: string[]): void => {
  db.withTransactionSync(() => {
    for (const uuid of uuids) {
      db.runSync("UPDATE local_orders SET is_synced = 1 WHERE uuid = ?;", [
        uuid,
      ]);
    }
  });
};

export const getLocalOrdersHistory = (): any[] => {
  return db.getAllSync(
    "SELECT * FROM local_orders ORDER BY completed_at DESC;",
  );
};

export const refundOrderLocally = (
  originalUuid: string,
  totalInclVat: number,
  subtotalExclVat: number,
  vatAmount: number,
  paymentMethod: string,
): number => {
  const refundUuid = generateUUID();
  const sequenceNumber = getNextSequenceNumber();
  const completedAt = new Date().toISOString().split(".")[0] + "Z";

  const previousHash = getLastOrderHash();

  const dataToHash = `${sequenceNumber}|${formatFloat(-subtotalExclVat)}|${formatFloat(-vatAmount)}|${formatFloat(-totalInclVat)}|${completedAt}|${previousHash}`;
  const currentHash = sha256(dataToHash);

  db.withTransactionSync(() => {
    db.runSync(
      "INSERT INTO local_orders (uuid, sequence_number, subtotal_excl_vat, vat_amount, total_incl_vat, hash, previous_hash, completed_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0);",
      [
        refundUuid,
        sequenceNumber,
        -subtotalExclVat,
        -vatAmount,
        -totalInclVat,
        currentHash,
        previousHash,
        completedAt,
      ],
    );

    const originalItems: any[] = db.getAllSync(
      "SELECT * FROM local_order_items WHERE order_uuid = ?;",
      [originalUuid],
    );

    for (const item of originalItems) {
      db.runSync(
        "INSERT INTO local_order_items (order_uuid, product_id, product_name, quantity, unit_price, vat_rate, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?);",
        [
          refundUuid,
          item.product_id,
          `REFUND: ${item.product_name}`,
          -item.quantity,
          item.unit_price,
          item.vat_rate,
          -(item.unit_price * item.quantity),
        ],
      );
    }

    db.runSync(
      "INSERT INTO local_payments (order_uuid, amount, method) VALUES (?, ?, ?);",
      [refundUuid, -totalInclVat, paymentMethod],
    );
  });

  return sequenceNumber;
};

// ======================================================
// 🚀 NEW: Local Daily Z-Report SQLite Helpers (Archiving)
// ======================================================

/**
 * Get all local orders that have not been closed/archived yet.
 */
export const getLocalOpenOrders = (): any[] => {
  return db.getAllSync(
    "SELECT * FROM local_orders WHERE local_daily_closure_id IS NULL;",
  );
};

/**
 * Get the cryptographic hash of the last Daily Z-Report.
 * If this is Z #1, returns a standard 64-character zero string.
 */
export const getLastZReportHash = (): string => {
  const result: any = db.getFirstSync(
    "SELECT hash FROM local_daily_closures ORDER BY z_number DESC LIMIT 1;",
  );
  return (
    result?.hash ||
    "0000000000000000000000000000000000000000000000000000000000000000"
  );
};

/**
 * Get the next daily closure sequential number.
 */
export const getNextZNumber = (): number => {
  const result: any = db.getFirstSync(
    "SELECT COUNT(*) as count FROM local_daily_closures;",
  );
  return (result?.count || 0) + 1;
};

/**
 * Compiles and fige/freezes all open orders inside local SQLite,
 * calculating HT/TVA/TTC daily sums and generating the secure Daily Hash chain.
 */
export const closeDayLocally = (): {
  zNumber: number;
  totalTtc: number;
  totalHt: number;
  totalTva: number;
  hash: string;
} => {
  const openOrders = getLocalOpenOrders();
  const nextZ = getNextZNumber();
  const closedAt = new Date().toISOString().split(".")[0] + "Z";

  // 1. Calculate Daily Totals
  let totalTtc = 0;
  let totalHt = 0;
  let totalTva = 0;

  openOrders.forEach((order) => {
    totalTtc += order.total_incl_vat;
    totalHt += order.subtotal_excl_vat;
    totalTva += order.vat_amount;
  });

  // 2. Fetch the previous daily Z-Report's hash
  const previousHash = getLastZReportHash();

  // 3. Construct the daily hash string and generate the Daily Hash
  const dataToHash = `${nextZ}|${formatFloat(totalHt)}|${formatFloat(totalTva)}|${formatFloat(totalTtc)}|${closedAt}|${previousHash}`;
  const currentHash = sha256(dataToHash);

  db.withTransactionSync(() => {
    // 4. Save the Z-Report Row
    db.runSync(
      "INSERT INTO local_daily_closures (z_number, total_ttc, total_ht, total_tva, hash, previous_hash, closed_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0);",
      [nextZ, totalTtc, totalHt, totalTva, currentHash, previousHash, closedAt],
    );

    // 5. Get the newly inserted closure ID
    const closureResult: any = db.getFirstSync(
      "SELECT last_insert_rowid() as id;",
    );
    const closureId = closureResult?.id;

    if (closureId) {
      // 6. 🛡️ FREEZE ORDERS: Update all unclosed orders with this closure ID
      db.runSync(
        "UPDATE local_orders SET local_daily_closure_id = ? WHERE local_daily_closure_id IS NULL;",
        [closureId],
      );
    }
  });

  return { zNumber: nextZ, totalTtc, totalHt, totalTva, hash: currentHash };
};

const generateUUID = (): string => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
