import type {
  BookmarkImage,
  CreateBookmarkImageInput,
  EntityId,
  UpdateBookmarkImageInput,
} from "./models";
import { getDB } from "./db";

function nowISO(): string {
  return new Date().toISOString();
}

function sortPinnedFirst(a: BookmarkImage, b: BookmarkImage): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }

  if (a.pinned && b.pinned && a.pinnedAt !== b.pinnedAt) {
    return (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0);
  }

  if (a.sortIndex !== b.sortIndex) {
    return a.sortIndex - b.sortIndex;
  }

  return b.createdAt.localeCompare(a.createdAt);
}

function normalizeImage(image: BookmarkImage, fallbackSortIndex: number): BookmarkImage {
  return {
    ...image,
    imageGroupId: image.imageGroupId ?? image.id,
    pinnedAt: image.pinnedAt ?? null,
    sortIndex: image.sortIndex ?? fallbackSortIndex,
  };
}

export function getImageGroupId(image: BookmarkImage): EntityId {
  return image.imageGroupId ?? image.id;
}

function getFirstUnpinnedSortIndex(images: BookmarkImage[]): number {
  return images
    .filter((image) => !image.pinned)
    .reduce(
      (firstSortIndex, image) => Math.min(firstSortIndex, image.sortIndex),
      0,
    );
}

async function cloneImageBlob(blob: Blob, fallbackMimeType?: string): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  return new Blob([arrayBuffer], {
    type: blob.type || fallbackMimeType || "application/octet-stream",
  });
}

export async function listImages(categoryId?: EntityId): Promise<BookmarkImage[]> {
  const db = await getDB();
  const images = categoryId
    ? await db.getAllFromIndex("images", "by-category-id", categoryId)
    : await db.getAll("images");

  return images
    .map((image, index) => normalizeImage(image, index))
    .sort(sortPinnedFirst);
}

export async function getImage(id: EntityId): Promise<BookmarkImage | undefined> {
  const db = await getDB();
  const image = await db.get("images", id);
  return image ? normalizeImage(image, 0) : undefined;
}

export async function listImageLinks(image: BookmarkImage): Promise<BookmarkImage[]> {
  const imageGroupId = getImageGroupId(image);
  const images = await listImages();
  return images.filter((linkedImage) => getImageGroupId(linkedImage) === imageGroupId);
}

export async function createImage(
  input: CreateBookmarkImageInput,
): Promise<BookmarkImage> {
  const timestamp = nowISO();
  const id = crypto.randomUUID();
  const existingImages = await listImages(input.categoryId);
  const nextSortIndex =
    input.sortIndex ?? getFirstUnpinnedSortIndex(existingImages) - 1;
  const blob = await cloneImageBlob(input.blob);
  const image: BookmarkImage = {
    id,
    imageGroupId: input.imageGroupId ?? id,
    categoryId: input.categoryId,
    blob,
    sourceUrl: input.sourceUrl?.trim() || null,
    mimeType: blob.type || "application/octet-stream",
    size: blob.size,
    width: input.width ?? null,
    height: input.height ?? null,
    pinned: input.pinned ?? false,
    pinnedAt: input.pinned ? Date.now() : null,
    sortIndex: nextSortIndex,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const db = await getDB();
  await db.add("images", image);
  return image;
}

export async function updateImage(
  id: EntityId,
  input: UpdateBookmarkImageInput,
): Promise<BookmarkImage> {
  const existing = await getImage(id);
  if (!existing) {
    throw new Error("Image was not found.");
  }

  const image: BookmarkImage = {
    ...existing,
    ...input,
    blob: await cloneImageBlob(existing.blob, existing.mimeType),
    updatedAt: nowISO(),
  };

  const db = await getDB();
  await db.put("images", image);

  // Re-read after put: Safari invalidates blob references from replaced IDB records,
  // so we must fetch a fresh blob from the newly-written record.
  const fresh = await db.get("images", id);
  return fresh ? normalizeImage(fresh, 0) : image;
}

export async function moveImage(
  id: EntityId,
  categoryId: EntityId,
): Promise<BookmarkImage> {
  return updateImage(id, { categoryId });
}

export async function setImagePinned(
  id: EntityId,
  pinned: boolean,
): Promise<BookmarkImage> {
  return updateImage(id, {
    pinned,
    pinnedAt: pinned ? Date.now() : null,
  });
}

export async function updateImageOrder(
  categoryId: EntityId,
  orderedImageIds: EntityId[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("images", "readwrite");
  const store = tx.objectStore("images");
  const images = await store.index("by-category-id").getAll(categoryId);
  const imagesById = new Map(
    images.map((image, index) => [image.id, normalizeImage(image, index)]),
  );
  const timestamp = nowISO();

  await Promise.all(
    orderedImageIds.map(async (imageId, sortIndex) => {
      const image = imagesById.get(imageId);
      if (!image) {
        return;
      }

      return store.put({
        ...image,
        blob: await cloneImageBlob(image.blob, image.mimeType),
        sortIndex,
        updatedAt: timestamp,
      });
    }),
  );

  await tx.done;
}

export async function deleteImage(id: EntityId): Promise<void> {
  const db = await getDB();
  await db.delete("images", id);
}

export async function deleteImagesByCategory(
  categoryId: EntityId,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("images", "readwrite");
  const store = tx.objectStore("images");
  const imageKeys = await store.index("by-category-id").getAllKeys(categoryId);
  await Promise.all(imageKeys.map((imageKey) => store.delete(imageKey)));
  await tx.done;
}
