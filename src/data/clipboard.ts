export interface ClipboardImage {
  blob: Blob;
  mimeType: string;
  width: number | null;
  height: number | null;
}

async function readImageDimensions(blob: Blob): Promise<{
  width: number | null;
  height: number | null;
}> {
  if (!blob.type.startsWith("image/")) {
    return { width: null, height: null };
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to read image dimensions."));
    });
    image.src = url;
    await loaded;
    return {
      width: image.naturalWidth || null,
      height: image.naturalHeight || null,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function imageFromBlob(blob: Blob): Promise<ClipboardImage> {
  const dimensions = await readImageDimensions(blob);
  return {
    blob,
    mimeType: blob.type || "application/octet-stream",
    ...dimensions,
  };
}

export async function extractImagesFromClipboardEvent(
  event: ClipboardEvent,
): Promise<ClipboardImage[]> {
  const files = Array.from(event.clipboardData?.files ?? []);
  const itemFiles = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  const imageFiles = [...files, ...itemFiles].filter((file, index, allFiles) => {
    return (
      file.type.startsWith("image/") &&
      allFiles.findIndex(
        (candidate) =>
          candidate.name === file.name &&
          candidate.size === file.size &&
          candidate.type === file.type,
      ) === index
    );
  });
  return Promise.all(imageFiles.map((file) => imageFromBlob(file)));
}

function firstUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0] ?? null;
}

export function extractUrlFromClipboardEvent(event: ClipboardEvent): string | null {
  const data = event.clipboardData;
  if (!data) {
    return null;
  }

  const uriList = data.getData("text/uri-list");
  const firstUri = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (firstUri) {
    return firstUri;
  }

  const html = data.getData("text/html");
  if (html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const imageSrc = document.querySelector("img[src]")?.getAttribute("src");
    const linkHref = document.querySelector("a[href]")?.getAttribute("href");
    const url = imageSrc || linkHref || firstUrlFromText(html);
    if (url) {
      return url;
    }
  }

  return firstUrlFromText(data.getData("text/plain"));
}

export async function readImagesFromSystemClipboard(): Promise<ClipboardImage[]> {
  if (!navigator.clipboard?.read) {
    throw new Error("Clipboard image reading is not supported in this browser.");
  }

  const clipboardItems = await navigator.clipboard.read();
  const images: ClipboardImage[] = [];

  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => type.startsWith("image/"));
    if (!imageType) {
      continue;
    }

    const blob = await item.getType(imageType);
    images.push(await imageFromBlob(blob));
  }

  return images;
}
