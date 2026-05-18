import { listCategories } from "./categories";
import { getSettings, saveSettings } from "./settings";
import type { AppBootState, Category } from "./models";

function resolveSelectedCategory(
  categories: Category[],
  lastSelectedCategoryId: string | null,
): Category | null {
  if (!lastSelectedCategoryId) {
    return null;
  }

  return categories.find((category) => category.id === lastSelectedCategoryId) ?? null;
}

export async function bootApp(): Promise<AppBootState> {
  const [categories, settings] = await Promise.all([
    listCategories(),
    getSettings(),
  ]);
  const selectedCategory = resolveSelectedCategory(
    categories,
    settings.lastSelectedCategoryId,
  );

  if (settings.lastSelectedCategoryId && !selectedCategory) {
    await saveSettings({
      ...settings,
      lastSelectedCategoryId: null,
    });
  }

  return {
    categories,
    selectedCategoryId: selectedCategory?.id ?? null,
    selectedCategory,
    gridColumnCount: settings.gridColumnCount,
  };
}
