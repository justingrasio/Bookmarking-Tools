import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AppSettings, BookmarkImage, Category, EntityId } from "./models";

const DB_NAME = "bookmarking-tools";
const DB_VERSION = 1;

export const SETTINGS_ID = "app" as const;

interface BookmarkingToolsDB extends DBSchema {
  categories: {
    key: EntityId;
    value: Category;
    indexes: {
      "by-created-at": string;
      "by-name": string;
    };
  };
  images: {
    key: EntityId;
    value: BookmarkImage;
    indexes: {
      "by-category-id": EntityId;
      "by-created-at": string;
      "by-pinned": number;
    };
  };
  settings: {
    key: AppSettings["id"];
    value: AppSettings;
  };
}

let dbPromise: Promise<IDBPDatabase<BookmarkingToolsDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<BookmarkingToolsDB>> {
  dbPromise ??= openDB<BookmarkingToolsDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const categories = db.createObjectStore("categories", { keyPath: "id" });
      categories.createIndex("by-created-at", "createdAt");
      categories.createIndex("by-name", "name");

      const images = db.createObjectStore("images", { keyPath: "id" });
      images.createIndex("by-category-id", "categoryId");
      images.createIndex("by-created-at", "createdAt");
      images.createIndex("by-pinned", "pinned");

      db.createObjectStore("settings", { keyPath: "id" });
    },
  });

  return dbPromise;
}

export async function resetLocalData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["categories", "images", "settings"], "readwrite");
  await Promise.all([
    tx.objectStore("categories").clear(),
    tx.objectStore("images").clear(),
    tx.objectStore("settings").clear(),
    tx.done,
  ]);
}
