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

      -- Local Orders Table (Stores data until synced)
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
    `);
    console.log("Local SQLite Database Initialized successfully!");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};
