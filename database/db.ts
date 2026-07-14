import * as SQLite from "expo-sqlite";

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
        is_synced INTEGER DEFAULT 0
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
    `);
    console.log("Local SQLite Database Initialized successfully!");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
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
// 🚀 NEW: Offline Order Save & Cloud Sync SQLite Helpers
// ======================================================

/**
 * Calculates the next sequential receipt number based on the local count
 */
export const getNextSequenceNumber = (): number => {
  const result: any = db.getFirstSync(
    "SELECT COUNT(*) as count FROM local_orders;",
  );
  return (result?.count || 0) + 1;
};

/**
 * Saves a completed sale locally inside SQLite using a single secure database transaction.
 */
export const saveOrderLocally = (
  uuid: string,
  subtotalExclVat: number,
  vatAmount: number,
  totalInclVat: number,
  items: any[],
  paymentMethod: string,
): number => {
  const sequenceNumber = getNextSequenceNumber();
  const completedAt = new Date().toISOString();

  db.withTransactionSync(() => {
    // 1. Save core Order
    db.runSync(
      "INSERT INTO local_orders (uuid, sequence_number, subtotal_excl_vat, vat_amount, total_incl_vat, completed_at, is_synced) VALUES (?, ?, ?, ?, ?, ?, 0);",
      [
        uuid,
        sequenceNumber,
        subtotalExclVat,
        vatAmount,
        totalInclVat,
        completedAt,
      ],
    );

    // 2. Save individual items
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

    // 3. Save payment
    db.runSync(
      "INSERT INTO local_payments (order_uuid, amount, method) VALUES (?, ?, ?);",
      [uuid, totalInclVat, paymentMethod],
    );
  });

  return sequenceNumber;
};

/**
 * Queries all local orders that have not been uploaded to Laravel yet,
 * structuring them to match Laravel's bulk sync controller format exactly.
 */
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

/**
 * Marks orders as successfully synced after Laravel returns success confirmations.
 */
export const markOrdersAsSynced = (uuids: string[]): void => {
  db.withTransactionSync(() => {
    for (const uuid of uuids) {
      db.runSync("UPDATE local_orders SET is_synced = 1 WHERE uuid = ?;", [
        uuid,
      ]);
    }
  });
};
