import { X } from "@phosphor-icons/react";

interface CategoryChipProps {
  label: string;
  selected?: boolean;
  onSelect: () => void;
  onClear?: () => void;
}

export default function CategoryChip({
  label,
  selected = false,
  onSelect,
  onClear,
}: CategoryChipProps) {
  if (!selected) {
    return (
      <button
        className="categoryChip categoryChipDefault"
        type="button"
        onClick={onSelect}
        data-node-id="17044:814"
      >
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div
      className="categoryChip categoryChipSelected"
      data-node-id="17044:815"
    >
      <button className="categoryChipTextButton" type="button" onClick={onSelect}>
        <span>{label}</span>
      </button>
      <button
        className="categoryChipRemove"
        type="button"
        aria-label={`Remove ${label} from selected category`}
        onClick={onClear}
        data-node-id="17044:806"
      >
        <X aria-hidden="true" size={16} weight="bold" />
      </button>
    </div>
  );
}
