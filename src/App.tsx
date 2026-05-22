import {
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLineUpRight,
  CaretRight,
  Check,
  Copy,
  LinkSimple,
  PencilSimple,
  Plus,
  PushPin,
  PushPinSlash,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  bootApp,
  createCategory,
  createImage,
  deleteCategory,
  deleteImage,
  extractImagesFromClipboardEvent,
  extractUrlFromClipboardEvent,
  listImageLinks,
  listImages,
  selectCategory,
  setCategoryPinned,
  setGridColumnCount,
  setImagePinned,
  updateCategory,
  updateCategoryOrder,
  updateImage,
  updateImageOrder,
  type AppBootState,
  type BookmarkImage,
  type Category,
  type ClipboardImage,
  type GridColumnCount,
} from "./data";
import CategoryChip from "./components/CategoryChip";
import ConfirmationModal from "./components/ConfirmationModal";

const gridOptions: GridColumnCount[] = [2, 3, 4, 5];
const chevronDownIcon = `${import.meta.env.BASE_URL}figma-assets/chevron-down.svg`;
const localDataNoticeDismissedKey =
  "bookmarking-tools.localDataNoticeDismissed";

interface PendingImage extends ClipboardImage {
  previewUrl: string;
  sourceUrl: string;
}

type DetailImageDeleteMode = "delete-image" | "last-category";

interface DetailImageDeleteRequest {
  image: BookmarkImage;
  mode: DetailImageDeleteMode;
}

interface ImageContextMenuState {
  image: BookmarkImage;
  linkedImages: BookmarkImage[];
  submenuOpen: boolean;
  x: number;
  y: number;
}

function buildMasonryColumns(
  sortedImages: BookmarkImage[],
  gridCount: GridColumnCount,
): BookmarkImage[][] {
  const columns: BookmarkImage[][] = Array.from({ length: gridCount }, () => []);
  sortedImages.forEach((image, index) => {
    columns[index % gridCount].push(image);
  });
  return columns;
}

function sortImagesForDisplay(imagesToSort: BookmarkImage[]): BookmarkImage[] {
  return [...imagesToSort].sort((a, b) => {
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
  });
}

function getOrderedCategoryIdsFromImages(images: BookmarkImage[]) {
  const categoryIds: string[] = [];
  images.forEach((image) => {
    if (!categoryIds.includes(image.categoryId)) {
      categoryIds.push(image.categoryId);
    }
  });
  return categoryIds;
}

function normalizeSourceUrl(sourceUrl: string) {
  const trimmedUrl = sourceUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  return /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
}

function getPageScrollY() {
  return (
    window.scrollY ||
    window.pageYOffset ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

function restorePageScrollY(scrollY: number) {
  window.scrollTo(0, scrollY);
  document.documentElement.scrollTop = scrollY;
  document.body.scrollTop = scrollY;
}

function restorePageScrollYAfterLayout(scrollY: number) {
  restorePageScrollY(scrollY);
  window.requestAnimationFrame(() => restorePageScrollY(scrollY));
  window.setTimeout(() => restorePageScrollY(scrollY), 50);
}

function getElementScrollY(element: HTMLElement) {
  let documentTop = 0;
  let currentElement: HTMLElement | null = element;

  while (currentElement) {
    documentTop += currentElement.offsetTop;
    currentElement = currentElement.offsetParent as HTMLElement | null;
  }

  return Math.max(0, documentTop - element.getBoundingClientRect().top);
}

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.left = "-9999px";
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      const didCopy = document.execCommand("copy");
      if (!didCopy) {
        throw new Error("Copy command was rejected.");
      }
    } finally {
      textarea.remove();
    }
  }
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.closest("[contenteditable='true']") !== null ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

interface SortableImageCardProps {
  image: BookmarkImage;
  imageUrl?: string;
  onOpen: (
    image: BookmarkImage,
    imageUrl: string | undefined,
    element: HTMLElement,
  ) => void;
  onContextMenu: (
    image: BookmarkImage,
    event: MouseEvent<HTMLElement>,
  ) => void;
  onImageError: (image: BookmarkImage) => void;
  onUnpin: (image: BookmarkImage) => void;
}

function SortableImageCard({
  image,
  imageUrl,
  onContextMenu,
  onImageError,
  onOpen,
  onUnpin,
}: SortableImageCardProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: image.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: [
      transition,
      "box-shadow 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    ]
      .filter(Boolean)
      .join(", "),
  };

  return (
    <article
      className={isDragging ? "masonry-card is-dragging" : "masonry-card"}
      data-image-id={image.id}
      onContextMenu={(event) => onContextMenu(image, event)}
      onClick={(event: MouseEvent<HTMLElement>) =>
        onOpen(image, imageUrl, event.currentTarget)
      }
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      {image.pinned ? (
        <button
          className="masonryPinnedBadge"
          type="button"
          aria-label="Unpin image"
          onClick={(event) => {
            event.stopPropagation();
            onUnpin(image);
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <PushPin aria-hidden="true" size={16} weight="fill" />
        </button>
      ) : null}
      <img
        className="masonry-image"
        src={imageUrl}
        alt=""
        loading="lazy"
        onError={() => onImageError(image)}
      />
    </article>
  );
}

interface SortableCategoryDropdownItemProps {
  canShowPin: boolean;
  category: Category;
  isHighlighted: boolean;
  isSelected: boolean;
  onDelete: (category: Category) => void;
  onEdit: (category: Category) => void;
  onPinToggle: (category: Category) => void;
  onSelect: (categoryId: string) => void;
}

function SortableCategoryDropdownItem({
  canShowPin,
  category,
  isHighlighted,
  isSelected,
  onDelete,
  onEdit,
  onPinToggle,
  onSelect,
}: SortableCategoryDropdownItemProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: category.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const className = [
    "categoryDropdownItem",
    isHighlighted ? "is-highlighted" : "",
    isDragging ? "is-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={className}
      type="button"
      aria-selected={isSelected}
      onClick={() => onSelect(category.id)}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <span className="categoryRowLabel">{category.name}</span>
      <span className="categoryRowActions">
        <span
          className="removeCategoryButton"
          role="button"
          tabIndex={0}
          aria-label={`Delete ${category.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(category);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onDelete(category);
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Trash
            aria-hidden="true"
            color="#FF3B30"
            size={16}
            weight="regular"
          />
        </span>
        <span
          className="editCategoryButton"
          role="button"
          tabIndex={0}
          aria-label={`Edit ${category.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(category);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onEdit(category);
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <PencilSimple
            aria-hidden="true"
            color="#fafafa"
            size={16}
            weight="regular"
          />
        </span>
        {canShowPin ? (
          <span
            className={category.pinned ? "pinButton is-pinned" : "pinButton"}
            role="button"
            tabIndex={0}
            aria-label={category.pinned ? `Unpin ${category.name}` : `Pin ${category.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onPinToggle(category);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onPinToggle(category);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <PushPin
              aria-hidden="true"
              className="pinIcon"
              color="#fafafa"
              size={16}
              weight={category.pinned ? "fill" : "regular"}
            />
          </span>
        ) : null}
      </span>
    </button>
  );
}

interface ImageContextMenuProps {
  categories: Category[];
  menu: ImageContextMenuState;
  menuRef: RefObject<HTMLDivElement | null>;
  submenuRef: RefObject<HTMLDivElement | null>;
  onCategoryToggle: (categoryId: string) => void;
  onDelete: () => void;
  onGoToSite: () => void;
  onSubmenuOpenChange: (open: boolean) => void;
  onTogglePinned: () => void;
}

function ImageContextMenu({
  categories,
  menu,
  menuRef,
  submenuRef,
  onCategoryToggle,
  onDelete,
  onGoToSite,
  onSubmenuOpenChange,
  onTogglePinned,
}: ImageContextMenuProps) {
  const menuWidth = 204;
  const menuHeight = 160;
  const submenuWidth = 204;
  const submenuMaxHeight = Math.min(200, window.innerHeight - 24);
  const left = Math.min(Math.max(menu.x, 12), window.innerWidth - menuWidth - 12);
  const top = Math.min(Math.max(menu.y, 12), window.innerHeight - menuHeight - 12);
  const absoluteSubmenuLeft =
    left + menuWidth + submenuWidth + 4 <= window.innerWidth
      ? left + menuWidth + 4
      : left - submenuWidth - 4;
  const absoluteSubmenuTop = top + Math.min(0, window.innerHeight - (top + 80) - submenuMaxHeight - 12);
  const linkedCategoryIds = new Set(
    menu.linkedImages.map((image) => image.categoryId),
  );
  const linkedCategoryCount = linkedCategoryIds.size;
  const normalizedSourceUrl = normalizeSourceUrl(menu.image.sourceUrl ?? "");

  return (
    <>
      {createPortal(
        <div
          className="imageContextMenu"
          onContextMenu={(event) => event.preventDefault()}
          ref={menuRef}
          style={{ left, top, width: menuWidth }}
          data-node-id="17093:953"
        >
          <button
            className="imageContextMenuItem"
            type="button"
            disabled={!normalizedSourceUrl}
            onClick={onGoToSite}
          >
            <ArrowLineUpRight aria-hidden="true" size={16} weight="regular" />
            <span>Go to site</span>
          </button>
          <button
            className="imageContextMenuItem"
            type="button"
            onClick={onTogglePinned}
          >
            {menu.image.pinned ? (
              <PushPinSlash aria-hidden="true" size={16} weight="regular" />
            ) : (
              <PushPin aria-hidden="true" size={16} weight="regular" />
            )}
            <span>{menu.image.pinned ? "Unpin image" : "Pin image"}</span>
          </button>
          <div
            className="imageContextMenuSubmenuTrigger"
            onMouseEnter={() => onSubmenuOpenChange(true)}
          >
            <button
              className="imageContextMenuItem"
              type="button"
              aria-expanded={menu.submenuOpen}
              onClick={() => onSubmenuOpenChange(!menu.submenuOpen)}
            >
              <Plus aria-hidden="true" size={16} weight="regular" />
              <span>Category ({linkedCategoryCount})</span>
              <CaretRight
                aria-hidden="true"
                className="imageContextMenuCaret"
                size={16}
                weight="regular"
              />
            </button>
          </div>
          <button
            className="imageContextMenuItem is-danger"
            type="button"
            onClick={onDelete}
          >
            <Trash aria-hidden="true" size={16} weight="regular" />
            <span>Delete</span>
          </button>
        </div>,
        document.body,
      )}
      {menu.submenuOpen ? createPortal(
        <div
          className="imageContextSubmenu"
          ref={submenuRef}
          role="menu"
          style={{
            left: absoluteSubmenuLeft,
            maxHeight: submenuMaxHeight,
            top: absoluteSubmenuTop,
            width: submenuWidth,
          }}
        >
          {categories.map((category) => {
            const isSelected = linkedCategoryIds.has(category.id);

            return (
              <button
                className={
                  isSelected
                    ? "imageContextMenuItem is-selected"
                    : "imageContextMenuItem"
                }
                type="button"
                key={category.id}
                role="menuitemcheckbox"
                aria-checked={isSelected}
                onClick={() => onCategoryToggle(category.id)}
              >
                <Check
                  aria-hidden="true"
                  className="imageContextMenuCheck"
                  size={16}
                  weight="regular"
                />
                <span>{category.name}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function GridIcon({ count }: { count: GridColumnCount }) {
  const cornerPaths = [
    "M11.375 5.25H6.125C5.64175 5.25 5.25 5.64175 5.25 6.125V11.375C5.25 11.8582 5.64175 12.25 6.125 12.25H11.375C11.8582 12.25 12.25 11.8582 12.25 11.375V6.125C12.25 5.64175 11.8582 5.25 11.375 5.25Z",
    "M21.875 5.25H16.625C16.1418 5.25 15.75 5.64175 15.75 6.125V11.375C15.75 11.8582 16.1418 12.25 16.625 12.25H21.875C22.3582 12.25 22.75 11.8582 22.75 11.375V6.125C22.75 5.64175 22.3582 5.25 21.875 5.25Z",
    "M11.375 15.75H6.125C5.64175 15.75 5.25 16.1418 5.25 16.625V21.875C5.25 22.3582 5.64175 22.75 6.125 22.75H11.375C11.8582 22.75 12.25 22.3582 12.25 21.875V16.625C12.25 16.1418 11.8582 15.75 11.375 15.75Z",
    "M21.875 15.75H16.625C16.1418 15.75 15.75 16.1418 15.75 16.625V21.875C15.75 22.3582 16.1418 22.75 16.625 22.75H21.875C22.3582 22.75 22.75 22.3582 22.75 21.875V16.625C22.75 16.1418 22.3582 15.75 21.875 15.75Z",
  ];

  return (
    <svg
      className="grid-option-icon"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {count === 2 ? (
        <>
          <path d="M11.375 10.5H6.125C5.64175 10.5 5.25 10.8918 5.25 11.375V16.625C5.25 17.1082 5.64175 17.5 6.125 17.5H11.375C11.8582 17.5 12.25 17.1082 12.25 16.625V11.375C12.25 10.8918 11.8582 10.5 11.375 10.5Z" />
          <path d="M21.875 10.5H16.625C16.1418 10.5 15.75 10.8918 15.75 11.375V16.625C15.75 17.1082 16.1418 17.5 16.625 17.5H21.875C22.3582 17.5 22.75 17.1082 22.75 16.625V11.375C22.75 10.8918 22.3582 10.5 21.875 10.5Z" />
        </>
      ) : null}
      {count === 3 ? (
        <>
          <path d="M16.625 5.25H11.375C10.8918 5.25 10.5 5.64175 10.5 6.125V11.375C10.5 11.8582 10.8918 12.25 11.375 12.25H16.625C17.1082 12.25 17.5 11.8582 17.5 11.375V6.125C17.5 5.64175 17.1082 5.25 16.625 5.25Z" />
          <path d="M11.375 15.75H6.125C5.64175 15.75 5.25 16.1418 5.25 16.625V21.875C5.25 22.3582 5.64175 22.75 6.125 22.75H11.375C11.8582 22.75 12.25 22.3582 12.25 21.875V16.625C12.25 16.1418 11.8582 15.75 11.375 15.75Z" />
          <path d="M21.875 15.75H16.625C16.1418 15.75 15.75 16.1418 15.75 16.625V21.875C15.75 22.3582 16.1418 22.75 16.625 22.75H21.875C22.3582 22.75 22.75 22.3582 22.75 21.875V16.625C22.75 16.1418 22.3582 15.75 21.875 15.75Z" />
        </>
      ) : null}
      {count === 4
        ? cornerPaths.map((path) => <path d={path} key={path} />)
        : null}
      {count === 5 ? (
        <>
          {cornerPaths.map((path) => (
            <path d={path} key={path} />
          ))}
          <path d="M17 10H11C10.4477 10 10 10.4477 10 11V17C10 17.5523 10.4477 18 11 18H17C17.5523 18 18 17.5523 18 17V11C18 10.4477 17.5523 10 17 10Z" />
        </>
      ) : null}
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M8 3v10M3 8h10" stroke="#a4a4a7" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function App() {
  const [bootState, setBootState] = useState<AppBootState | null>(null);
  const [images, setImages] = useState<BookmarkImage[]>([]);
  const [imageObjectUrls, setImageObjectUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [shouldRenderDropdown, setShouldRenderDropdown] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [lastAddedCategoryId, setLastAddedCategoryId] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [composerCategoryIds, setComposerCategoryIds] = useState<string[]>([]);
  const [isComposerCategoryOpen, setIsComposerCategoryOpen] = useState(false);
  const [isCreatingComposerCategory, setIsCreatingComposerCategory] = useState(false);
  const [composerCategoryName, setComposerCategoryName] = useState("");
  const [shouldShakeComposerCategories, setShouldShakeComposerCategories] =
    useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("Image saved");
  const [detailImageId, setDetailImageId] = useState<string | null>(null);
  const [detailSourceUrl, setDetailSourceUrl] = useState("");
  const [detailLinkedImages, setDetailLinkedImages] = useState<BookmarkImage[]>([]);
  const [detailSliderImages, setDetailSliderImages] = useState<BookmarkImage[]>([]);
  const [detailThumbnailScrollOffset, setDetailThumbnailScrollOffset] = useState(0);
  const [detailSelectedCategoryIds, setDetailSelectedCategoryIds] = useState<string[]>([]);
  const [isDetailActiveCategoryOpen, setIsDetailActiveCategoryOpen] = useState(false);
  const [isDetailCategoryOpen, setIsDetailCategoryOpen] = useState(false);
  const [imageContextMenu, setImageContextMenu] =
    useState<ImageContextMenuState | null>(null);
  const [detailImageToDelete, setDetailImageToDelete] =
    useState<DetailImageDeleteRequest | null>(null);
  const [isLocalDataNoticeDismissed, setIsLocalDataNoticeDismissed] =
    useState(() => {
      if (typeof window === "undefined") {
        return false;
      }

      try {
        return window.localStorage.getItem(localDataNoticeDismissedKey) === "true";
      } catch {
        return false;
      }
    });
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);
  const composerCategoryMenuRef = useRef<HTMLDivElement | null>(null);
  const composerAllCategoryListRef = useRef<HTMLDivElement | null>(null);
  const detailActiveCategoryMenuRef = useRef<HTMLDivElement | null>(null);
  const detailActiveCategoryListRef = useRef<HTMLDivElement | null>(null);
  const detailCategoryMenuRef = useRef<HTMLDivElement | null>(null);
  const detailAllCategoryListRef = useRef<HTMLDivElement | null>(null);
  const detailThumbnailStripRef = useRef<HTMLDivElement | null>(null);
  const detailThumbnailScrollerRef = useRef<HTMLDivElement | null>(null);
  const imageContextMenuRef = useRef<HTMLDivElement | null>(null);
  const imageContextSubmenuRef = useRef<HTMLDivElement | null>(null);
  const imageObjectUrlCacheRef = useRef(
    new Map<string, { blob: Blob; url: string }>(),
  );
  const imageObjectUrlRefreshCountsRef = useRef(new Map<string, number>());
  const detailSelectionImageIdRef = useRef<string | null>(null);
  const detailReturnScrollYRef = useRef<number | null>(null);
  const detailSwipeStartXRef = useRef<number | null>(null);
  const isOpeningDetailRef = useRef(false);
  const lastGridScrollYRef = useRef(0);
  const shouldRestoreDetailScrollRef = useRef(false);
  const saveToastTimeoutRef = useRef<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  async function refresh(nextSelectedCategoryId?: string | null) {
    const nextBootState = await bootApp();
    const selectedCategoryId =
      nextSelectedCategoryId !== undefined
        ? nextSelectedCategoryId
        : nextBootState.selectedCategoryId;
    const selectedCategory =
      nextBootState.categories.find((category) => category.id === selectedCategoryId) ??
      null;

    const nextImages = selectedCategory ? await listImages(selectedCategory.id) : [];

    const effectiveBootState: AppBootState = {
      ...nextBootState,
      selectedCategoryId: selectedCategory?.id ?? null,
      selectedCategory,
    };

    setBootState(effectiveBootState);
    setImages(nextImages);
  }

  function refreshImageObjectUrl(image: BookmarkImage) {
    const refreshCount = imageObjectUrlRefreshCountsRef.current.get(image.id) ?? 0;
    if (refreshCount >= 3) {
      return;
    }

    imageObjectUrlRefreshCountsRef.current.set(image.id, refreshCount + 1);
    const url = URL.createObjectURL(image.blob);
    imageObjectUrlCacheRef.current.set(image.id, {
      blob: image.blob,
      url,
    });
    setImageObjectUrls((currentImageObjectUrls) => ({
      ...currentImageObjectUrls,
      [image.id]: url,
    }));
  }

  useEffect(() => {
    refresh().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Unable to load local data.");
    });
  }, []);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const hasImage = Array.from(event.clipboardData?.items ?? []).some((item) =>
        item.type.startsWith("image/"),
      );
      if (!hasImage) {
        return;
      }

      event.preventDefault();
      extractImagesFromClipboardEvent(event)
        .then((clipboardImages) => {
          const [clipboardImage] = clipboardImages;
          if (!clipboardImage) {
            return;
          }

          setError(null);
          setPendingImage((current) => {
            if (current) {
              URL.revokeObjectURL(current.previewUrl);
            }

            return {
              ...clipboardImage,
              previewUrl: URL.createObjectURL(clipboardImage.blob),
              sourceUrl: extractUrlFromClipboardEvent(event) ?? "",
            };
          });
          setComposerCategoryIds([]);
          setIsComposerCategoryOpen(false);
          setIsCreatingComposerCategory(false);
          setComposerCategoryName("");
        })
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : "Unable to read pasted image.");
        });
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [bootState?.selectedCategoryId]);

  useEffect(() => {
    return () => {
      if (pendingImage) {
        URL.revokeObjectURL(pendingImage.previewUrl);
      }
    };
  }, [pendingImage]);

  useEffect(() => {
    const objectUrlImages = [...images, ...detailLinkedImages, ...detailSliderImages].filter(
      (image, index, allImages) =>
        allImages.findIndex((currentImage) => currentImage.id === image.id) === index,
    );
    const imageObjectUrlCache = imageObjectUrlCacheRef.current;

    objectUrlImages.forEach((image) => {
      const cachedImage = imageObjectUrlCache.get(image.id);
      if (cachedImage && cachedImage.blob === image.blob) {
        return;
      }

      if (cachedImage) {
        URL.revokeObjectURL(cachedImage.url);
      }

      imageObjectUrlRefreshCountsRef.current.delete(image.id);
      imageObjectUrlCache.set(image.id, {
        blob: image.blob,
        url: URL.createObjectURL(image.blob),
      });
    });

    const nextImageObjectUrls = Object.fromEntries(
      Array.from(imageObjectUrlCache.entries()).map(([imageId, cachedImage]) => [
        imageId,
        cachedImage.url,
      ]),
    );
    setImageObjectUrls(nextImageObjectUrls);
  }, [detailLinkedImages, detailSliderImages, images]);

  useEffect(() => {
    return () => {
      imageObjectUrlCacheRef.current.forEach((cachedImage) => {
        URL.revokeObjectURL(cachedImage.url);
      });
      imageObjectUrlCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const detailImage =
      images.find((image) => image.id === detailImageId) ??
      detailLinkedImages.find((image) => image.id === detailImageId) ??
      detailSliderImages.find((image) => image.id === detailImageId) ??
      null;
    if (!detailImage) {
      setDetailLinkedImages([]);
      setDetailSelectedCategoryIds([]);
      detailSelectionImageIdRef.current = null;
      return;
    }

    let isCancelled = false;
    listImageLinks(detailImage)
      .then((linkedImages) => {
        if (!isCancelled) {
          const normalizedLinkedImages = linkedImages.some(
            (linkedImage) => linkedImage.id === detailImage.id,
          )
            ? linkedImages
            : [detailImage, ...linkedImages];
          setDetailLinkedImages(normalizedLinkedImages);
          setDetailSelectedCategoryIds((currentSelectedCategoryIds) => {
            const linkedCategoryIds = getOrderedCategoryIdsFromImages(
              normalizedLinkedImages,
            );
            if (detailSelectionImageIdRef.current !== detailImage.id) {
              detailSelectionImageIdRef.current = detailImage.id;
              return linkedCategoryIds;
            }

            const keptCategoryIds = currentSelectedCategoryIds.filter((categoryId) =>
              linkedCategoryIds.includes(categoryId),
            );
            const newCategoryIds = linkedCategoryIds.filter(
              (categoryId) => !keptCategoryIds.includes(categoryId),
            );
            return [...keptCategoryIds, ...newCategoryIds];
          });
        }
      })
      .catch((caught: unknown) => {
        if (!isCancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load linked categories.");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [detailImageId, detailSliderImages, images]);

  useEffect(() => {
    if (!detailImageId) {
      setIsDetailActiveCategoryOpen(false);
      setIsDetailCategoryOpen(false);
      setDetailSliderImages([]);
      setDetailThumbnailScrollOffset(0);
    }
  }, [detailImageId]);

  useEffect(() => {
    const detailImage =
      images.find((image) => image.id === detailImageId) ??
      detailLinkedImages.find((image) => image.id === detailImageId) ??
      detailSliderImages.find((image) => image.id === detailImageId) ??
      null;
    if (!detailImage) {
      setDetailSliderImages([]);
      return;
    }

    let isCancelled = false;
    listImages(detailImage.categoryId)
      .then((categoryImages) => {
        if (!isCancelled) {
          setDetailSliderImages((current) => {
            const currentIds = current.map((image) => image.id).join("|");
            const nextIds = categoryImages.map((image) => image.id).join("|");
            return currentIds === nextIds ? current : categoryImages;
          });
        }
      })
      .catch((caught: unknown) => {
        if (!isCancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load category images.");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [detailImageId, detailLinkedImages, detailSliderImages, images]);

  useLayoutEffect(() => {
    if (detailImageId !== null || !shouldRestoreDetailScrollRef.current) {
      return;
    }

    const scrollY = detailReturnScrollYRef.current ?? 0;
    shouldRestoreDetailScrollRef.current = false;
    detailReturnScrollYRef.current = null;
    restorePageScrollYAfterLayout(scrollY);
    isOpeningDetailRef.current = false;
  }, [detailImageId]);

  useEffect(() => {
    function rememberGridScroll() {
      if (isOpeningDetailRef.current || detailImageId !== null) {
        return;
      }

      lastGridScrollYRef.current = getPageScrollY();
    }

    rememberGridScroll();
    window.addEventListener("scroll", rememberGridScroll, true);
    return () => window.removeEventListener("scroll", rememberGridScroll, true);
  }, [detailImageId]);

  function showToast(message: string) {
    if (saveToastTimeoutRef.current) {
      window.clearTimeout(saveToastTimeoutRef.current);
    }

    setToastMessage(message);
    setIsToastVisible(true);
    saveToastTimeoutRef.current = window.setTimeout(() => {
      setIsToastVisible(false);
      saveToastTimeoutRef.current = null;
    }, 3500);
  }

  useEffect(() => {
    if (isDropdownOpen) {
      setShouldRenderDropdown(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setShouldRenderDropdown(false);
    }, 170);
    return () => window.clearTimeout(timeout);
  }, [isDropdownOpen]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (categoryToDelete) {
        return;
      }

      if (!categoryMenuRef.current?.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setIsAddingCategory(false);
        setLastAddedCategoryId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
        setIsAddingCategory(false);
        setLastAddedCategoryId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [categoryToDelete]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        !composerCategoryMenuRef.current?.contains(event.target as Node) &&
        !composerAllCategoryListRef.current?.contains(event.target as Node)
      ) {
        setIsComposerCategoryOpen(false);
      }

      if (
        !detailActiveCategoryMenuRef.current?.contains(event.target as Node) &&
        !detailActiveCategoryListRef.current?.contains(event.target as Node) &&
        !detailCategoryMenuRef.current?.contains(event.target as Node) &&
        !detailAllCategoryListRef.current?.contains(event.target as Node)
      ) {
        setIsDetailActiveCategoryOpen(false);
        setIsDetailCategoryOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsComposerCategoryOpen(false);
        setIsDetailActiveCategoryOpen(false);
        setIsDetailCategoryOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!imageContextMenu) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        !imageContextMenuRef.current?.contains(event.target as Node) &&
        !imageContextSubmenuRef.current?.contains(event.target as Node)
      ) {
        setImageContextMenu(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setImageContextMenu(null);
      }
    }

    function handleScroll() {
      setImageContextMenu(null);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [imageContextMenu]);

  function handleToggleDropdown() {
    setError(null);
    setLastAddedCategoryId(null);
    if (isDropdownOpen) {
      setIsDropdownOpen(false);
      setIsAddingCategory(false);
      setLastAddedCategoryId(null);
    } else {
      setIsDropdownOpen(true);
      setIsAddingCategory(categories.length === 0);
    }
  }

  function handleStartFirstCategory() {
    setError(null);
    setLastAddedCategoryId(null);
    setIsDropdownOpen(true);
    setIsAddingCategory(true);
  }

  function handleDismissLocalDataNotice() {
    setIsLocalDataNoticeDismissed(true);

    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(localDataNoticeDismissedKey, "true");
    } catch {
      // Ignore storage failures; the notice will still close for this session.
    }
  }

  async function handleSelectCategory(categoryId: string) {
    setError(null);
    try {
      await selectCategory(categoryId);
      setIsDropdownOpen(false);
      setIsAddingCategory(false);
      setLastAddedCategoryId(null);
      await refresh(categoryId);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to select category.");
    }
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!/[\p{L}\p{N}]/u.test(newCategoryName)) {
      return;
    }

    try {
      const name = newCategoryName.trim();
      const category = await createCategory({ name });
      await selectCategory(category.id);
      setIsAddingCategory(false);
      setIsDropdownOpen(true);
      setNewCategoryName("");
      setLastAddedCategoryId(category.id);
      await refresh(category.id);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to create category.");
    }
  }

  async function handleTogglePinned(category: Category) {
    setError(null);
    try {
      await setCategoryPinned(category.id, !category.pinned);
      await refresh(bootState?.selectedCategoryId ?? null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to update pinned category.");
    }
  }

  function handleStartEditCategory(category: Category) {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  }

  function handleCancelEditCategory() {
    setEditingCategoryId(null);
    setEditingCategoryName("");
  }

  async function handleSaveEditCategory(categoryId: string) {
    setError(null);
    if (!/[\p{L}\p{N}]/u.test(editingCategoryName)) {
      handleCancelEditCategory();
      return;
    }

    try {
      await updateCategory(categoryId, { name: editingCategoryName });
      handleCancelEditCategory();
      await refresh(bootState?.selectedCategoryId ?? null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to rename category.");
    }
  }

  async function handleConfirmDeleteCategory() {
    if (!categoryToDelete) {
      return;
    }

    setError(null);
    try {
      const deletedCategoryId = categoryToDelete.id;
      await deleteCategory(deletedCategoryId);
      setCategoryToDelete(null);
      setIsDropdownOpen(true);
      setIsAddingCategory(categories.length <= 1);
      setLastAddedCategoryId(null);
      await refresh(
        deletedCategoryId === bootState?.selectedCategoryId
          ? null
          : bootState?.selectedCategoryId ?? null,
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to delete category.");
    }
  }

  async function handleGridSelection(gridColumnCount: GridColumnCount) {
    setError(null);
    try {
      const shouldAnimate =
        images.length > 0 &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const previousRects = shouldAnimate
        ? new Map(
            Array.from(document.querySelectorAll<HTMLElement>(".masonry-card")).map(
              (element) => [
                element.dataset.imageId,
                element.getBoundingClientRect(),
              ],
            ),
          )
        : null;
      const applyGridCount = () => {
        setBootState((current) =>
          current ? { ...current, gridColumnCount } : current,
        );
      };

      flushSync(applyGridCount);

      if (previousRects) {
        document.body.classList.add("is-grid-transitioning");
        const animations: Animation[] = [];

        document.querySelectorAll<HTMLElement>(".masonry-card").forEach((element) => {
          const previousRect = previousRects.get(element.dataset.imageId);
          if (!previousRect) {
            return;
          }

          const nextRect = element.getBoundingClientRect();
          const deltaX = previousRect.left - nextRect.left;
          const deltaY = previousRect.top - nextRect.top;

          element.getAnimations().forEach((animation) => animation.cancel());
          animations.push(
            element.animate(
              [
                {
                  opacity: 0.96,
                  transform: `translate(${deltaX}px, ${deltaY}px)`,
                },
                {
                  opacity: 1,
                  transform: "translate(0, 0)",
                },
              ],
              {
                duration: 520,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              },
            ),
          );
        });

        const cleanupGridTransition = () => {
          document.body.classList.remove("is-grid-transitioning");
        };

        Promise.allSettled(animations.map((animation) => animation.finished))
          .then(cleanupGridTransition);
        window.setTimeout(cleanupGridTransition, 620);
      }

      await setGridColumnCount(gridColumnCount);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to save grid setting.");
    }
  }

  async function handleMasonryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedCategory) {
      return;
    }

    const oldIndex = images.findIndex((image) => image.id === active.id);
    const newIndex = images.findIndex((image) => image.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reorderedImages = arrayMove(images, oldIndex, newIndex);
    setImages(reorderedImages);

    try {
      await updateImageOrder(
        selectedCategory.id,
        reorderedImages.map((image) => image.id),
      );
      await refresh(selectedCategory.id);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to reorder images.");
      await refresh(selectedCategory.id);
    }
  }

  async function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = categories.findIndex((category) => category.id === active.id);
    const newIndex = categories.findIndex((category) => category.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reorderedCategories = arrayMove(categories, oldIndex, newIndex);
    setBootState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        categories: reorderedCategories,
      };
    });

    try {
      await updateCategoryOrder(reorderedCategories.map((category) => category.id));
      await refresh(bootState?.selectedCategoryId ?? null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to reorder categories.");
      await refresh(bootState?.selectedCategoryId ?? null);
    }
  }

  function resetImageDetail() {
    shouldRestoreDetailScrollRef.current = true;
    setDetailImageId(null);
    setDetailSourceUrl("");
    setDetailLinkedImages([]);
    setDetailSliderImages([]);
    setDetailSelectedCategoryIds([]);
    detailSelectionImageIdRef.current = null;
    setIsDetailCategoryOpen(false);
  }

  function handleOpenImageDetail(
    image: BookmarkImage,
    _imageUrl: string | undefined,
    element: HTMLElement,
  ) {
    setError(null);
    setIsDropdownOpen(false);
    setIsAddingCategory(false);
    isOpeningDetailRef.current = true;
    detailReturnScrollYRef.current = Math.max(
      getPageScrollY(),
      lastGridScrollYRef.current,
      getElementScrollY(element),
    );
    shouldRestoreDetailScrollRef.current = false;
    setDetailImageId(image.id);
    setDetailSourceUrl(image.sourceUrl ?? "");
  }

  function handleMoveDetailImage(direction: -1 | 1) {
    if (!detailImageId || detailSliderImages.length <= 1) {
      return false;
    }

    const currentIndex = detailSliderImages.findIndex(
      (image) => image.id === detailImageId,
    );
    if (currentIndex === -1) {
      return false;
    }

    const nextIndex =
      (currentIndex + direction + detailSliderImages.length) %
      detailSliderImages.length;
    const nextImage = detailSliderImages[nextIndex];
    setDetailImageId(nextImage.id);
    setDetailSourceUrl(nextImage.sourceUrl ?? "");
    setDetailLinkedImages([]);
    setDetailSelectedCategoryIds([]);
    detailSelectionImageIdRef.current = null;
    return true;
  }

  useEffect(() => {
    if (!detailImageId || detailSliderImages.length <= 1) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        isEditableKeyboardTarget(event.target) ||
        (event.key !== "ArrowDown" && event.key !== "ArrowUp")
      ) {
        return;
      }

      const moved = handleMoveDetailImage(event.key === "ArrowDown" ? 1 : -1);
      if (moved) {
        event.preventDefault();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [detailImageId, detailSliderImages]);

  function handleSelectDetailThumbnail(image: BookmarkImage) {
    if (image.id === detailImageId) {
      return;
    }

    setDetailImageId(image.id);
    setDetailSourceUrl(image.sourceUrl ?? "");
    setDetailLinkedImages([]);
    setDetailSelectedCategoryIds([]);
    detailSelectionImageIdRef.current = null;
  }

  async function handleSelectDetailActiveCategory(categoryId: string) {
    setError(null);
    setIsDetailActiveCategoryOpen(false);

    try {
      const categoryImages = await listImages(categoryId);
      const nextImage =
        categoryImages.find((image) => image.id === detailImageId) ??
        categoryImages[0];

      if (!nextImage) {
        setError("This category does not have any images yet.");
        return;
      }

      await selectCategory(categoryId);
      setDetailSliderImages(categoryImages);
      setDetailImageId(nextImage.id);
      setDetailSourceUrl(nextImage.sourceUrl ?? "");
      setDetailLinkedImages([]);
      setDetailSelectedCategoryIds([]);
      detailSelectionImageIdRef.current = null;
      await refresh(categoryId);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to select category.");
    }
  }

  function handleDetailPreviewPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    detailSwipeStartXRef.current = event.clientX;
  }

  function handleDetailPreviewPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const startX = detailSwipeStartXRef.current;
    detailSwipeStartXRef.current = null;
    if (startX === null) {
      return;
    }

    const deltaX = event.clientX - startX;
    if (Math.abs(deltaX) < 48) {
      return;
    }

    handleMoveDetailImage(deltaX < 0 ? 1 : -1);
  }

  function handleDetailThumbnailWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const strip = detailThumbnailStripRef.current;
    const scroller = detailThumbnailScrollerRef.current;
    if (!strip || !scroller) {
      return;
    }

    const maxOffset = Math.max(0, scroller.scrollHeight - strip.clientHeight);
    if (maxOffset === 0) {
      return;
    }

    event.preventDefault();
    setDetailThumbnailScrollOffset((currentOffset) =>
      Math.min(Math.max(currentOffset + event.deltaY, 0), maxOffset),
    );
  }

  function handleCloseImageDetail() {
    const scrollY = detailReturnScrollYRef.current ?? getPageScrollY();
    flushSync(resetImageDetail);
    restorePageScrollYAfterLayout(scrollY);
  }

  async function handleSaveDetailUrl(image: BookmarkImage) {
    setError(null);
    try {
      const sourceUrl = detailSourceUrl.trim() || null;
      const updatedImage = await updateImage(image.id, { sourceUrl });
      setDetailSourceUrl(updatedImage.sourceUrl ?? "");
      setImages((current) =>
        current.map((currentImage) =>
          currentImage.id === updatedImage.id ? updatedImage : currentImage,
        ),
      );
      setDetailSliderImages((current) =>
        current.map((currentImage) =>
          currentImage.id === updatedImage.id ? updatedImage : currentImage,
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to update source URL.");
    }
  }

  async function handleCopyDetailUrl() {
    const sourceUrl = detailSourceUrl.trim();
    if (!sourceUrl) {
      return;
    }

    setError(null);
    try {
      await copyTextToClipboard(sourceUrl);
      showToast("URL copied");
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to copy source URL.");
    }
  }

  async function handleToggleImagePinned(image: BookmarkImage) {
    setError(null);
    try {
      const updatedImage = await setImagePinned(image.id, !image.pinned);
      setImages((current) =>
        sortImagesForDisplay(
          current.map((currentImage) =>
            currentImage.id === updatedImage.id ? updatedImage : currentImage,
          ),
        ),
      );
      setDetailLinkedImages((current) =>
        current.map((currentImage) =>
          currentImage.id === updatedImage.id ? updatedImage : currentImage,
        ),
      );
      setDetailSliderImages((current) =>
        sortImagesForDisplay(
          current.map((currentImage) =>
            currentImage.id === updatedImage.id ? updatedImage : currentImage,
          ),
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to update pinned image.");
    }
  }

  async function handleOpenImageContextMenu(
    image: BookmarkImage,
    event: MouseEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    setIsDropdownOpen(false);
    setIsAddingCategory(false);
    setIsComposerCategoryOpen(false);
    setIsDetailCategoryOpen(false);
    setImageContextMenu({
      image,
      linkedImages: [image],
      submenuOpen: false,
      x: event.clientX,
      y: event.clientY,
    });

    try {
      const linkedImages = await listImageLinks(image);
      setImageContextMenu((current) => {
        if (!current || current.image.id !== image.id) {
          return current;
        }

        return {
          ...current,
          linkedImages: linkedImages.some((linkedImage) => linkedImage.id === image.id)
            ? linkedImages
            : [image, ...linkedImages],
        };
      });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to load image menu.");
    }
  }

  function handleContextMenuGoToSite() {
    if (!imageContextMenu) {
      return;
    }

    const sourceUrl = normalizeSourceUrl(imageContextMenu.image.sourceUrl ?? "");
    if (!sourceUrl) {
      return;
    }

    window.open(sourceUrl, "_blank", "noopener,noreferrer");
    setImageContextMenu(null);
  }

  async function handleContextMenuTogglePinned() {
    if (!imageContextMenu) {
      return;
    }

    const image = imageContextMenu.image;
    setImageContextMenu(null);
    await handleToggleImagePinned(image);
  }

  async function handleContextMenuCategoryToggle(categoryId: string) {
    if (!imageContextMenu) {
      return;
    }

    const { image, linkedImages } = imageContextMenu;
    const normalizedLinkedImages = linkedImages.some(
      (linkedImage) => linkedImage.id === image.id,
    )
      ? linkedImages
      : [image, ...linkedImages];
    const existingLinkedImage = normalizedLinkedImages.find(
      (linkedImage) => linkedImage.categoryId === categoryId,
    );
    const linkedCategoryIds = new Set(
      normalizedLinkedImages.map((linkedImage) => linkedImage.categoryId),
    );

    if (existingLinkedImage && linkedCategoryIds.size <= 1) {
      setImageContextMenu(null);
      setDetailImageToDelete({
        image,
        mode: "last-category",
      });
      return;
    }

    setError(null);
    setImageContextMenu(null);
    try {
      if (existingLinkedImage) {
        await deleteImage(existingLinkedImage.id);
      } else {
        await createImage({
          categoryId,
          imageGroupId: image.imageGroupId,
          blob: image.blob,
          sourceUrl: image.sourceUrl,
          width: image.width,
          height: image.height,
          pinned: image.pinned,
          pinnedAt: image.pinnedAt,
        });
      }

      await refresh(selectedCategory?.id ?? null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to update image category.");
      await refresh(selectedCategory?.id ?? null);
    }
  }

  function handleContextMenuDelete() {
    if (!imageContextMenu) {
      return;
    }

    setDetailImageToDelete({
      image: imageContextMenu.image,
      mode: "delete-image",
    });
    setImageContextMenu(null);
  }

  async function handleUnpinMasonryImage(image: BookmarkImage) {
    if (!image.pinned) {
      return;
    }

    setError(null);
    try {
      const updatedImage = await setImagePinned(image.id, false);
      setImages((current) =>
        sortImagesForDisplay(
          current.map((currentImage) =>
            currentImage.id === updatedImage.id ? updatedImage : currentImage,
          ),
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to unpin image.");
    }
  }

  async function handleConfirmDeleteDetailImage() {
    if (!detailImageToDelete) {
      return;
    }

    setError(null);
    try {
      const deletedImageCategoryId = detailImageToDelete.image.categoryId;
      if (detailImageToDelete.mode === "delete-image") {
        const linkedImages = await listImageLinks(detailImageToDelete.image);
        const imagesToDelete = linkedImages.length > 0
          ? linkedImages
          : [detailImageToDelete.image];
        await Promise.all(
          imagesToDelete.map((linkedImage) => deleteImage(linkedImage.id)),
        );
      } else {
        await deleteImage(detailImageToDelete.image.id);
      }
      setDetailImageToDelete(null);
      if (detailImageId) {
        handleCloseImageDetail();
      }
      await refresh(deletedImageCategoryId);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to delete image.");
    }
  }

  async function handleSelectDetailCategory(categoryId: string, image: BookmarkImage) {
    if (detailLinkedImages.some((linkedImage) => linkedImage.categoryId === categoryId)) {
      return;
    }

    setError(null);
    try {
      const linkedImage = await createImage({
        categoryId,
        imageGroupId: image.imageGroupId,
        blob: image.blob,
        sourceUrl: detailSourceUrl,
        width: image.width,
        height: image.height,
      });
      setDetailLinkedImages((current) => [...current, linkedImage]);
      setDetailSelectedCategoryIds((current) =>
        current.includes(categoryId) ? current : [...current, categoryId],
      );
      await refresh(selectedCategory?.id ?? null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to link category.");
    }
  }

  async function handleClearDetailCategory(categoryId: string, image: BookmarkImage) {
    const linkedImages = detailLinkedImages.some(
      (linkedImage) => linkedImage.id === image.id,
    )
      ? detailLinkedImages
      : [image, ...detailLinkedImages];
    const linkedImage = linkedImages.find(
      (currentImage) => currentImage.categoryId === categoryId,
    );
    if (!linkedImage) {
      return;
    }

    if (linkedImages.length <= 1) {
      setIsDetailActiveCategoryOpen(false);
      setIsDetailCategoryOpen(false);
      setDetailImageToDelete({
        image,
        mode: "last-category",
      });
      return;
    }

    setError(null);
    try {
      const remainingLinkedImages = linkedImages.filter(
        (currentImage) => currentImage.id !== linkedImage.id,
      );
      await deleteImage(linkedImage.id);
      setDetailLinkedImages(remainingLinkedImages);
      setDetailSelectedCategoryIds((current) =>
        current.filter((selectedCategoryId) => selectedCategoryId !== categoryId),
      );

      if (linkedImage.id === image.id) {
        const nextDetailImage = remainingLinkedImages[0];
        setDetailImageId(nextDetailImage.id);
        setDetailSourceUrl(nextDetailImage.sourceUrl ?? "");
      }

      await refresh(selectedCategory?.id ?? null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to remove category.");
    }
  }

  function handleCloseComposer() {
    setPendingImage((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
    setIsComposerCategoryOpen(false);
    setIsCreatingComposerCategory(false);
    setComposerCategoryName("");
  }

  function handleSelectComposerCategory(categoryId: string) {
    setComposerCategoryIds((current) =>
      current.includes(categoryId) ? current : [...current, categoryId],
    );
  }

  function handleClearComposerCategory(categoryId: string) {
    setComposerCategoryIds((current) =>
      current.filter((selectedCategoryId) => selectedCategoryId !== categoryId),
    );
  }

  function handleStartComposerCategoryCreation() {
    setShouldShakeComposerCategories(false);
    setIsCreatingComposerCategory(true);
  }

  async function handleCreateComposerCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!/[\p{L}\p{N}]/u.test(composerCategoryName)) {
      return;
    }

    try {
      const category = await createCategory({ name: composerCategoryName.trim() });
      await selectCategory(category.id);
      setComposerCategoryIds([category.id]);
      setComposerCategoryName("");
      setIsCreatingComposerCategory(false);
      setLastAddedCategoryId(category.id);
      await refresh(category.id);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to create category.");
    }
  }

  async function handleComposerSaveClick() {
    if (composerCategoryIds.length > 0) {
      if (!pendingImage || isSavingImage) {
        return;
      }

      setError(null);
      setIsSavingImage(true);
      try {
        const imageGroupId = crypto.randomUUID();
        await Promise.all(
          composerCategoryIds.map((categoryId) =>
            createImage({
              categoryId,
              imageGroupId,
              blob: pendingImage.blob,
              sourceUrl: pendingImage.sourceUrl,
              width: pendingImage.width,
              height: pendingImage.height,
            }),
          ),
        );

        const nextSelectedCategoryId =
          composerCategoryIds.includes(bootState?.selectedCategoryId ?? "")
            ? bootState?.selectedCategoryId ?? composerCategoryIds[0]
            : composerCategoryIds[0];
        await selectCategory(nextSelectedCategoryId);
        showToast("Image saved");
        URL.revokeObjectURL(pendingImage.previewUrl);
        setPendingImage(null);
        setComposerCategoryIds([]);
        setIsComposerCategoryOpen(false);
        await refresh(nextSelectedCategoryId);
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : "Unable to save image.");
      } finally {
        setIsSavingImage(false);
      }
      return;
    }

    setShouldShakeComposerCategories(false);
    window.requestAnimationFrame(() => {
      setShouldShakeComposerCategories(true);
      window.setTimeout(() => setShouldShakeComposerCategories(false), 360);
    });
  }

  const categories = bootState?.categories ?? [];
  const selectedCategory = bootState?.selectedCategory ?? null;
  const selectedGridColumnCount = bootState?.gridColumnCount ?? 5;
  const categoryLabel = selectedCategory?.name ?? "Add New Category";
  const isFirstRunEmptyState = categories.length === 0 && !isDropdownOpen && !isAddingCategory;
  const hasSelectedCategoryImages = Boolean(selectedCategory && images.length > 0);
  const pinnedCategoryCount = categories.filter((category) => category.pinned).length;
  const canSaveCategory = /[\p{L}\p{N}]/u.test(newCategoryName);
  const canSaveComposerCategory = /[\p{L}\p{N}]/u.test(composerCategoryName);
  const masonryColumns = buildMasonryColumns(images, selectedGridColumnCount);
  const visibleComposerCategories = categories.slice(0, 4);
  const visibleComposerCategoryIds = new Set(
    visibleComposerCategories.map((category) => category.id),
  );
  const hiddenComposerCategories = categories.filter(
    (category) => !visibleComposerCategoryIds.has(category.id),
  );
  const detailImage =
    images.find((image) => image.id === detailImageId) ??
    detailLinkedImages.find((image) => image.id === detailImageId) ??
    detailSliderImages.find((image) => image.id === detailImageId) ??
    null;
  const detailLinkedCategoryIds = new Set(
    detailLinkedImages.map((image) => image.categoryId),
  );
  if (detailImage) {
    detailLinkedCategoryIds.add(detailImage.categoryId);
  }
  const effectiveDetailSelectedCategoryIds =
    detailSelectedCategoryIds.length > 0
      ? detailSelectedCategoryIds
      : categories
          .filter((category) => detailLinkedCategoryIds.has(category.id))
          .map((category) => category.id);
  const detailActiveCategoryOptions = effectiveDetailSelectedCategoryIds
    .map((categoryId) => categories.find((category) => category.id === categoryId))
    .filter((category): category is Category => Boolean(category));
  const detailActiveCategory =
    categories.find((category) => category.id === detailImage?.categoryId) ??
    detailActiveCategoryOptions[0] ??
    null;
  const detailDropdownCategories = categories;
  const detailLinkedCategoryCount = effectiveDetailSelectedCategoryIds.length;
  const hasDetailSourceUrl = detailSourceUrl.trim().length > 0;
  const normalizedDetailSourceUrl = normalizeSourceUrl(detailSourceUrl);

  return (
    <main
      className={
        pendingImage
          ? "insertImageScreen"
          : detailImage
            ? "imageDetailScreen"
            : hasSelectedCategoryImages
            ? "homepageScreen"
            : "emptyCategoryScreen"
      }
      data-node-id={pendingImage ? "17006:825" : detailImage ? "17019:1058" : "17006:794"}
      data-name={
        pendingImage
          ? "Insert Image"
          : detailImage
            ? "Image Detail"
            : "Bookmarking Tool - Empty Category Content"
      }
    >
      {pendingImage ? (
        <>
          <button
            className="composerCloseButton"
            type="button"
            aria-label="Cancel adding image"
            onClick={handleCloseComposer}
            data-node-id="17037:790"
          >
            <X aria-hidden="true" size={20} weight="regular" />
          </button>

          <button
            className="composerSaveButton"
            type="button"
            aria-disabled={composerCategoryIds.length === 0 || isSavingImage}
            disabled={isSavingImage}
            onClick={handleComposerSaveClick}
            data-node-id="17053:840"
          >
            Save
          </button>

          <section className="insertImageComposer" aria-label="Add new image">
            <div className="insertImagePreview" data-node-id="17006:830">
              <img src={pendingImage.previewUrl} alt="" />
            </div>

            {categories.length > 0 ? (
              <label className="sourceUrlField" data-node-id="17006:831">
                <LinkSimple aria-hidden="true" size={20} weight="regular" />
                <input
                  aria-label="Input source url"
                  placeholder="Input source url"
                  value={pendingImage.sourceUrl}
                  onChange={(event) =>
                    setPendingImage((current) =>
                      current ? { ...current, sourceUrl: event.target.value } : current,
                    )
                  }
                />
              </label>
            ) : null}

            <div
              className={
                shouldShakeComposerCategories
                  ? "composerCategories is-shaking"
                  : "composerCategories"
              }
              data-node-id="17006:835"
            >
              {visibleComposerCategories.map((category) => (
                <CategoryChip
                  key={category.id}
                  label={category.name}
                  selected={composerCategoryIds.includes(category.id)}
                  onSelect={() => handleSelectComposerCategory(category.id)}
                  onClear={() => handleClearComposerCategory(category.id)}
                />
              ))}

              {categories.length > 4 ? (
                <div className="composerAllCategories" ref={composerCategoryMenuRef}>
                  <button
                    className="composerAllCategoryButton"
                    type="button"
                    aria-expanded={isComposerCategoryOpen}
                    onClick={() =>
                      setIsComposerCategoryOpen((isOpen) => !isOpen)
                    }
                    data-node-id="17006:842"
                  >
                    <span>
                      See All Category
                      {composerCategoryIds.length > 0
                        ? ` (${composerCategoryIds.length})`
                        : ""}
                    </span>
                    <img
                      className={`chevronDown${isComposerCategoryOpen ? " is-open" : ""}`}
                      src={chevronDownIcon}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                  {isComposerCategoryOpen ? createPortal(
                    <div
                      className="composerAllCategoryList"
                      role="listbox"
                      ref={composerAllCategoryListRef}
                      style={(() => {
                        const rect = composerCategoryMenuRef.current?.getBoundingClientRect();
                        if (!rect) return {};
                        return {
                          position: "fixed" as const,
                          bottom: window.innerHeight - rect.top + 12,
                          right: window.innerWidth - rect.right,
                          width: rect.width,
                          minWidth: "unset",
                        };
                      })()}
                    >
                      {hiddenComposerCategories.map((category) => (
                        <button
                          key={category.id}
                          className={
                            composerCategoryIds.includes(category.id)
                              ? "composerAllCategoryItem is-selected"
                              : "composerAllCategoryItem"
                          }
                          type="button"
                          role="option"
                          aria-selected={composerCategoryIds.includes(category.id)}
                          onClick={() => {
                            if (composerCategoryIds.includes(category.id)) {
                              handleClearComposerCategory(category.id);
                            } else {
                              handleSelectComposerCategory(category.id);
                            }
                          }}
                        >
                          <span>{category.name}</span>
                          {composerCategoryIds.includes(category.id) ? (
                            <X aria-hidden="true" size={16} weight="bold" />
                          ) : null}
                        </button>
                      ))}
                    </div>,
                    document.body
                  ) : null}
                </div>
              ) : null}

              {categories.length === 0 ? (
                <div className="composerCategorySetup">
                  <p className="composerCategoryRequirement">
                    Create a category before saving this image.
                  </p>
                  {isCreatingComposerCategory ? (
                    <form
                      className="categoryInputRow composerCategoryCreateForm"
                      onSubmit={handleCreateComposerCategory}
                    >
                      <input
                        aria-label="New category name"
                        autoFocus
                        placeholder="Category name"
                        value={composerCategoryName}
                        onChange={(event) => setComposerCategoryName(event.target.value)}
                      />
                      <button
                        className={
                          canSaveComposerCategory
                            ? "categorySaveBtn is-active"
                            : "categorySaveBtn"
                        }
                        type="submit"
                        disabled={!canSaveComposerCategory}
                        aria-disabled={!canSaveComposerCategory}
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <button
                      className="composerCreateCategoryButton"
                      type="button"
                      onClick={handleStartComposerCategoryCreation}
                    >
                      Create Category
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : detailImage ? (
        <>
          <button
            className="composerCloseButton"
            type="button"
            aria-label="Close image detail"
            onClick={handleCloseImageDetail}
          >
            <X aria-hidden="true" size={20} weight="regular" />
          </button>

          {detailSliderImages.length > 0 ? (
            <div
              className="detailThumbnailStrip"
              aria-label="Images in selected category"
              data-node-id="17103:1046"
              onWheel={handleDetailThumbnailWheel}
              ref={detailThumbnailStripRef}
            >
              <div
                className="detailThumbnailScroller"
                ref={detailThumbnailScrollerRef}
                style={
                  {
                    "--thumbnail-scroll-offset": `${detailThumbnailScrollOffset}px`,
                  } as CSSProperties
                }
              >
                {detailSliderImages.map((sliderImage, index) => {
                  const isActive = sliderImage.id === detailImage.id;
                  const thumbnailUrl = imageObjectUrls[sliderImage.id];

                  return (
                    <button
                      className={
                        isActive
                          ? "detailThumbnailButton is-active"
                          : "detailThumbnailButton"
                      }
                      type="button"
                      key={sliderImage.id}
                      aria-label={`Show image ${index + 1} of ${
                        detailSliderImages.length
                      }`}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => handleSelectDetailThumbnail(sliderImage)}
                    >
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt=""
                          onError={() => refreshImageObjectUrl(sliderImage)}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <section className="imageDetailContent" aria-label="Saved image detail">
            <div
              className="insertImagePreview imageDetailPreview"
              onPointerDown={handleDetailPreviewPointerDown}
              onPointerUp={handleDetailPreviewPointerUp}
            >
              <img
                src={imageObjectUrls[detailImage.id]}
                alt=""
                onError={() => refreshImageObjectUrl(detailImage)}
              />
            </div>

            <div className="sourceUrlField detailUrlField" data-node-id="17019:1066">
              <LinkSimple aria-hidden="true" size={20} weight="regular" />
              <input
                aria-label="Source url"
                placeholder="Input source url"
                value={detailSourceUrl}
                onBlur={() => handleSaveDetailUrl(detailImage)}
                onChange={(event) => setDetailSourceUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
              <span className="detailUrlActions" aria-hidden={!hasDetailSourceUrl}>
                <button
                  className="detailUrlActionButton"
                  type="button"
                  aria-label="Copy source URL"
                  disabled={!hasDetailSourceUrl}
                  onClick={handleCopyDetailUrl}
                >
                  <Copy aria-hidden="true" size={20} weight="regular" />
                </button>
                <a
                  className="detailUrlActionButton"
                  aria-label="Open source URL"
                  aria-disabled={!normalizedDetailSourceUrl}
                  href={normalizedDetailSourceUrl ?? undefined}
                  onClick={(event) => {
                    if (!normalizedDetailSourceUrl) {
                      event.preventDefault();
                    }
                  }}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ArrowLineUpRight aria-hidden="true" size={20} weight="regular" />
                </a>
              </span>
            </div>

            <div className="composerCategories imageDetailCategories">
              <div
                className="composerAllCategories detailActiveCategoryMenu"
                ref={detailActiveCategoryMenuRef}
              >
                {isDetailActiveCategoryOpen ? createPortal(
                  <div
                    className="categoryDropdown detailActiveCategoryDropdown"
                    role="listbox"
                    ref={detailActiveCategoryListRef}
                    style={(() => {
                      const rect =
                        detailActiveCategoryMenuRef.current?.getBoundingClientRect();
                      if (!rect) return {};
                      return {
                        position: "fixed" as const,
                        bottom: window.innerHeight - rect.top + 12,
                        left: rect.left,
                        width: rect.width,
                      };
                    })()}
                  >
                    <div className="categoryOptions" role="presentation">
                      {categories.map((category) => (
                        <button
                          key={category.id}
                          className={
                            category.id === detailActiveCategory?.id
                              ? "categoryDropdownItem is-selected"
                              : "categoryDropdownItem"
                          }
                          type="button"
                          role="option"
                          aria-selected={category.id === detailActiveCategory?.id}
                          onClick={() => handleSelectDetailActiveCategory(category.id)}
                        >
                          <span className="categoryRowLabel">{category.name}</span>
                          {category.id === detailActiveCategory?.id ? (
                            <Check aria-hidden="true" size={16} weight="regular" />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                , document.body) : null}
                <button
                  className="categoryPill detailActiveCategoryButton"
                  type="button"
                  aria-expanded={isDetailActiveCategoryOpen}
                  onClick={() => {
                    setIsDetailCategoryOpen(false);
                    setIsDetailActiveCategoryOpen((isOpen) => !isOpen);
                  }}
                >
                  <span>{detailActiveCategory?.name ?? "Select Category"}</span>
                  <img
                    className={`chevronDown${
                      isDetailActiveCategoryOpen ? " is-open" : ""
                    }`}
                    src={chevronDownIcon}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
              </div>

              <div className="composerAllCategories" ref={detailCategoryMenuRef}>
                <button
                  className="composerAllCategoryButton"
                  type="button"
                  aria-expanded={isDetailCategoryOpen}
                  onClick={() => {
                    setIsDetailActiveCategoryOpen(false);
                    setIsDetailCategoryOpen((isOpen) => !isOpen);
                  }}
                  data-node-id="17019:1071"
                >
                  <span>
                    Category Linked
                    {detailLinkedCategoryCount > 0
                      ? ` (${detailLinkedCategoryCount})`
                      : ""}
                  </span>
                  <img
                    className={`chevronDown${isDetailCategoryOpen ? " is-open" : ""}`}
                    src={chevronDownIcon}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
                {isDetailCategoryOpen ? createPortal(
                  <div
                    className="composerAllCategoryList"
                    role="listbox"
                    ref={detailAllCategoryListRef}
                    style={(() => {
                      const rect = detailCategoryMenuRef.current?.getBoundingClientRect();
                      if (!rect) return {};
                      return {
                        position: "fixed" as const,
                        bottom: window.innerHeight - rect.top + 12,
                        right: window.innerWidth - rect.right,
                        width: rect.width,
                        minWidth: "unset",
                      };
                    })()}
                  >
                    {detailDropdownCategories.map((category) => (
                      <button
                        key={category.id}
                        className={
                          detailLinkedCategoryIds.has(category.id)
                            ? "composerAllCategoryItem is-selected"
                            : "composerAllCategoryItem"
                        }
                        type="button"
                        role="option"
                        aria-selected={detailLinkedCategoryIds.has(category.id)}
                        onClick={() => {
                          if (detailLinkedCategoryIds.has(category.id)) {
                            handleClearDetailCategory(category.id, detailImage);
                          } else {
                            handleSelectDetailCategory(category.id, detailImage);
                          }
                        }}
                      >
                        <span>{category.name}</span>
                        {detailLinkedCategoryIds.has(category.id) ? (
                          <X aria-hidden="true" size={16} weight="bold" />
                        ) : null}
                      </button>
                    ))}
                  </div>,
                  document.body
                ) : null}
              </div>
            </div>
          </section>

          <div className="detailSideActions" data-node-id="17019:1077">
            <button
              className={
                detailImage.pinned
                  ? "detailActionPill is-active"
                  : "detailActionPill"
              }
              type="button"
              aria-pressed={detailImage.pinned}
              aria-label={detailImage.pinned ? "Unpin image" : "Pin image"}
              onClick={() => handleToggleImagePinned(detailImage)}
            >
              <span className="detailActionButton">
                <PushPin
                  aria-hidden="true"
                  size={20}
                  weight={detailImage.pinned ? "fill" : "regular"}
                />
              </span>
            </button>
            <button
              className="detailActionPill detailActionDanger"
              type="button"
              aria-label="Remove image"
              onClick={() =>
                setDetailImageToDelete({
                  image: detailImage,
                  mode: "delete-image",
                })
              }
            >
              <span className="detailActionButton">
                <Trash aria-hidden="true" size={20} weight="regular" />
              </span>
            </button>
          </div>

          {error ? (
            <p className="screenError" role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <>
          {hasSelectedCategoryImages ? (
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={handleMasonryDragEnd}
              sensors={sensors}
            >
              <SortableContext items={images.map((image) => image.id)}>
                <div
                  className="masonry-grid"
                  style={{ "--grid-count": selectedGridColumnCount } as CSSProperties}
                  data-node-id="17019:628"
                >
                  {masonryColumns.map((column, columnIndex) => (
                    <div className="masonry-column" key={columnIndex}>
                      {column.map((image) => (
                        <SortableImageCard
                          image={image}
                          imageUrl={imageObjectUrls[image.id]}
                          key={image.id}
                          onContextMenu={handleOpenImageContextMenu}
                          onImageError={refreshImageObjectUrl}
                          onOpen={handleOpenImageDetail}
                          onUnpin={handleUnpinMasonryImage}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <section className="emptyStateCard" aria-label="Getting started">
              {categories.length === 0 ? (
                <>
                  <h1 data-node-id="17006:799">Create your first category</h1>
                  <button
                    className="emptyStatePrimaryAction"
                    type="button"
                    onClick={handleStartFirstCategory}
                  >
                    Create Category
                  </button>
                </>
              ) : (
                <>
                  <h1 data-node-id="17006:799">Paste your first image</h1>
                  <p>
                    Copy an image from the web, then press Cmd+V or Ctrl+V anywhere
                    here.
                  </p>
                </>
              )}
            </section>
          )}

          {!isFirstRunEmptyState && !isLocalDataNoticeDismissed ? (
            <aside className="localDataNotice" aria-label="Local data notice">
              <button
                className="localDataNoticeClose"
                type="button"
                aria-label="Hide local data notice"
                onClick={handleDismissLocalDataNotice}
              >
                <X size={16} weight="bold" aria-hidden="true" />
              </button>
              <strong>Friend test version</strong>
              <span>Saved images stay only in this browser. Use the same browser and device to see them again.</span>
            </aside>
          ) : null}

          {error ? (
            <p className="screenError" role="alert">
              {error}
            </p>
          ) : null}

          {!isFirstRunEmptyState ? (
          <div className="floatingControls" aria-label="Bookmarking controls">
        <div className="categoryMenuWrapper" ref={categoryMenuRef} data-node-id="17030:762">
          {shouldRenderDropdown && (
            <div
              className={
                isDropdownOpen ? "categoryDropdown" : "categoryDropdown is-leaving"
              }
            >
              {categories.length > 0 ? (
                <DndContext
                  collisionDetection={closestCenter}
                  onDragEnd={handleCategoryDragEnd}
                  sensors={sensors}
                >
                  <SortableContext
                    items={categories.map((category) => category.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="categoryOptions" role="listbox">
                      {categories.map((cat) => {
                        const canShowPin = cat.pinned || pinnedCategoryCount < 3;
                        if (editingCategoryId === cat.id) {
                          return (
                            <form
                              key={cat.id}
                              className="categoryDropdownItem is-editing"
                              onSubmit={(event) => {
                                event.preventDefault();
                                handleSaveEditCategory(cat.id);
                              }}
                            >
                              <input
                                aria-label={`Edit ${cat.name}`}
                                autoFocus
                                value={editingCategoryName}
                                onBlur={() => handleSaveEditCategory(cat.id)}
                                onChange={(event) =>
                                  setEditingCategoryName(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    handleCancelEditCategory();
                                  }
                                }}
                              />
                            </form>
                          );
                        }

                        return (
                          <SortableCategoryDropdownItem
                            canShowPin={canShowPin}
                            category={cat}
                            isHighlighted={cat.id === lastAddedCategoryId}
                            isSelected={cat.id === bootState?.selectedCategoryId}
                            key={cat.id}
                            onDelete={setCategoryToDelete}
                            onEdit={handleStartEditCategory}
                            onPinToggle={handleTogglePinned}
                            onSelect={handleSelectCategory}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : null}

              {isAddingCategory ? (
                <form className="categoryInputRow" onSubmit={handleCreateCategory}>
                  <input
                    aria-label="New category name"
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={categories.length === 0 ? "|" : "input new category"}
                  />
                  <button
                    type="submit"
                    className={
                      canSaveCategory
                        ? "categorySaveBtn is-active"
                        : "categorySaveBtn"
                    }
                    disabled={!canSaveCategory}
                  >
                    Save
                  </button>
                </form>
              ) : (
                <button
                  className="categoryAddBtn"
                  type="button"
                  onClick={() => setIsAddingCategory(true)}
                >
                  <PlusIcon />
                  <span>Add New Category</span>
                </button>
              )}
            </div>
          )}

          <button
            className={categories.length === 0 ? "categoryPill is-empty" : "categoryPill"}
            type="button"
            aria-expanded={isDropdownOpen}
            aria-haspopup="listbox"
            onClick={handleToggleDropdown}
            data-node-id="17006:795"
            data-name="Menu"
          >
            <span>{categories.length === 0 ? <PlusIcon /> : null}{categoryLabel}</span>
            {categories.length > 0 ? (
              <img
                className={`chevronDown${isDropdownOpen ? " is-open" : ""}`}
                src={chevronDownIcon}
                alt=""
                aria-hidden="true"
                data-node-id="17006:797"
              />
            ) : null}
          </button>
        </div>

        <div
          className="grid-option"
          data-node-id="17025:457"
          data-name="Grid Option"
          aria-label="Grid columns"
        >
          {gridOptions.map((count) => (
            <button
              className={
                count === selectedGridColumnCount
                  ? "grid-option-button is-selected"
                  : "grid-option-button"
              }
              key={count}
              type="button"
              aria-label={`${count} grid columns`}
              aria-pressed={count === selectedGridColumnCount}
              onClick={() => handleGridSelection(count)}
            >
              <GridIcon count={count} />
            </button>
          ))}
        </div>
      </div>
          ) : null}
        </>
      )}
      <ConfirmationModal
        open={categoryToDelete !== null}
        title="Delete Category"
        description="All images in this category will be deleted. This action can't be undone."
        onCancel={() => setCategoryToDelete(null)}
        onConfirm={handleConfirmDeleteCategory}
      />
      {imageContextMenu ? (
        <ImageContextMenu
          categories={categories}
          menu={imageContextMenu}
          menuRef={imageContextMenuRef}
          submenuRef={imageContextSubmenuRef}
          onCategoryToggle={handleContextMenuCategoryToggle}
          onDelete={handleContextMenuDelete}
          onGoToSite={handleContextMenuGoToSite}
          onSubmenuOpenChange={(submenuOpen) =>
            setImageContextMenu((current) =>
              current ? { ...current, submenuOpen } : current,
            )
          }
          onTogglePinned={handleContextMenuTogglePinned}
        />
      ) : null}
      <ConfirmationModal
        open={detailImageToDelete !== null}
        title="Delete Image"
        description={
          detailImageToDelete?.mode === "last-category"
            ? "This is the last category linked to this image. Deleting it removes the image too."
            : "This action can't be undone."
        }
        nodeId="17071:848"
        onCancel={() => setDetailImageToDelete(null)}
        onConfirm={handleConfirmDeleteDetailImage}
      />
      {isToastVisible ? (
        <div className="saveToast" data-node-id="17055:843" role="status">
          <Check aria-hidden="true" size={20} weight="regular" />
          <span>{toastMessage}</span>
        </div>
      ) : null}
    </main>
  );
}

export default App;
