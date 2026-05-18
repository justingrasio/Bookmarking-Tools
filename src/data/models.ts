export type EntityId = string;

export type GridColumnCount = 2 | 3 | 4 | 5;

export interface Category {
  id: EntityId;
  name: string;
  pinned: boolean;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkImage {
  id: EntityId;
  imageGroupId: EntityId;
  categoryId: EntityId;
  blob: Blob;
  sourceUrl: string | null;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  pinned: boolean;
  pinnedAt: number | null;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: "app";
  lastSelectedCategoryId: EntityId | null;
  gridColumnCount: GridColumnCount;
  updatedAt: string;
}

export interface AppBootState {
  categories: Category[];
  selectedCategoryId: EntityId | null;
  selectedCategory: Category | null;
  gridColumnCount: GridColumnCount;
}

export interface CreateCategoryInput {
  name: string;
}

export interface UpdateCategoryInput {
  name: string;
}

export interface CreateBookmarkImageInput {
  categoryId: EntityId;
  imageGroupId?: EntityId;
  blob: Blob;
  sourceUrl?: string | null;
  width?: number | null;
  height?: number | null;
  pinned?: boolean;
  pinnedAt?: number | null;
  sortIndex?: number;
}

export interface UpdateBookmarkImageInput {
  imageGroupId?: EntityId;
  categoryId?: EntityId;
  sourceUrl?: string | null;
  pinned?: boolean;
  pinnedAt?: number | null;
  sortIndex?: number;
  width?: number | null;
  height?: number | null;
}
