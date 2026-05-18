import { getDB } from "./db";
import { getSettings, saveSettings, setLastSelectedCategoryId } from "./settings";
import type {
  Category,
  CreateCategoryInput,
  EntityId,
  UpdateCategoryInput,
} from "./models";

function nowISO(): string {
  return new Date().toISOString();
}

function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeCategory(category: Category): Category {
  return {
    ...category,
    pinned: category.pinned ?? false,
    sortIndex: category.sortIndex ?? -Date.parse(category.createdAt),
  };
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDB();
  const categories = await db.getAllFromIndex("categories", "by-created-at");
  return categories
    .map(normalizeCategory)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      if (a.sortIndex !== b.sortIndex) {
        return a.sortIndex - b.sortIndex;
      }

      return b.createdAt.localeCompare(a.createdAt);
    });
}

export async function getCategory(id: EntityId): Promise<Category | undefined> {
  const db = await getDB();
  const category = await db.get("categories", id);
  return category ? normalizeCategory(category) : undefined;
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<Category> {
  const name = normalizeCategoryName(input.name);
  if (!name) {
    throw new Error("Category name is required.");
  }

  const timestamp = nowISO();
  const category: Category = {
    id: crypto.randomUUID(),
    name,
    pinned: false,
    sortIndex: -Date.now(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const db = await getDB();
  await db.add("categories", category);
  await setLastSelectedCategoryId(category.id);
  return category;
}

export async function updateCategory(
  id: EntityId,
  input: UpdateCategoryInput,
): Promise<Category> {
  const name = normalizeCategoryName(input.name);
  if (!name) {
    throw new Error("Category name is required.");
  }

  const existing = await getCategory(id);
  if (!existing) {
    throw new Error("Category was not found.");
  }

  const category: Category = {
    ...existing,
    pinned: existing.pinned ?? false,
    name,
    updatedAt: nowISO(),
  };

  const db = await getDB();
  await db.put("categories", category);
  return category;
}

export async function deleteCategory(id: EntityId): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["categories", "images", "settings"], "readwrite");
  await tx.objectStore("categories").delete(id);

  const imagesStore = tx.objectStore("images");
  const imageKeys = await imagesStore.index("by-category-id").getAllKeys(id);
  await Promise.all(imageKeys.map((imageKey) => imagesStore.delete(imageKey)));

  const settings = await tx.objectStore("settings").get("app");
  if (settings?.lastSelectedCategoryId === id) {
    await tx.objectStore("settings").put({
      ...settings,
      lastSelectedCategoryId: null,
      updatedAt: nowISO(),
    });
  }

  await tx.done;
}

export async function selectCategory(id: EntityId | null): Promise<void> {
  if (id === null) {
    await setLastSelectedCategoryId(null);
    return;
  }

  const category = await getCategory(id);
  if (!category) {
    throw new Error("Category was not found.");
  }

  await setLastSelectedCategoryId(id);
}

export async function setCategoryPinned(
  id: EntityId,
  pinned: boolean,
): Promise<Category> {
  const existing = await getCategory(id);
  if (!existing) {
    throw new Error("Category was not found.");
  }

  if (pinned) {
    const pinnedCount = (await listCategories()).filter(
      (category) => category.pinned && category.id !== id,
    ).length;
    if (pinnedCount >= 3) {
      throw new Error("You can pin up to 3 categories.");
    }
  }

  const category: Category = {
    ...existing,
    pinned,
    updatedAt: nowISO(),
  };

  const db = await getDB();
  await db.put("categories", category);
  return category;
}

export async function updateCategoryOrder(categoryIds: EntityId[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("categories", "readwrite");
  const categoriesStore = tx.objectStore("categories");
  const timestamp = nowISO();

  await Promise.all(
    categoryIds.map(async (categoryId, index) => {
      const category = await categoriesStore.get(categoryId);
      if (!category) {
        return;
      }

      await categoriesStore.put({
        ...normalizeCategory(category),
        sortIndex: index,
        updatedAt: timestamp,
      });
    }),
  );

  await tx.done;
}

export async function pruneInvalidSelectedCategory(): Promise<EntityId | null> {
  const settings = await getSettings();
  const selectedId = settings.lastSelectedCategoryId;
  if (!selectedId) {
    return null;
  }

  const selectedCategory = await getCategory(selectedId);
  if (selectedCategory) {
    return selectedId;
  }

  await saveSettings({
    ...settings,
    lastSelectedCategoryId: null,
  });
  return null;
}
