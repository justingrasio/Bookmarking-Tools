import { getDB, SETTINGS_ID } from "./db";
import type { AppSettings, EntityId, GridColumnCount } from "./models";

const DEFAULT_GRID_COLUMN_COUNT: GridColumnCount = 5;

function nowISO(): string {
  return new Date().toISOString();
}

export function isGridColumnCount(value: number): value is GridColumnCount {
  return value === 2 || value === 3 || value === 4 || value === 5;
}

export function createDefaultSettings(): AppSettings {
  return {
    id: SETTINGS_ID,
    lastSelectedCategoryId: null,
    gridColumnCount: DEFAULT_GRID_COLUMN_COUNT,
    updatedAt: nowISO(),
  };
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDB();
  const settings = await db.get("settings", SETTINGS_ID);
  return settings ?? createDefaultSettings();
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const nextSettings = {
    ...settings,
    updatedAt: nowISO(),
  };
  const db = await getDB();
  await db.put("settings", nextSettings);
  return nextSettings;
}

export async function setLastSelectedCategoryId(
  categoryId: EntityId | null,
): Promise<AppSettings> {
  const settings = await getSettings();
  return saveSettings({
    ...settings,
    lastSelectedCategoryId: categoryId,
  });
}

export async function setGridColumnCount(
  gridColumnCount: GridColumnCount,
): Promise<AppSettings> {
  const settings = await getSettings();
  return saveSettings({
    ...settings,
    gridColumnCount,
  });
}
