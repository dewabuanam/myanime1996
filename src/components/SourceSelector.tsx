import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ResolvedSourceOption } from '../types/plugin';

export type LogoSelectItem = {
  value: string;
  label: string;
  iconDataUri?: string;
  meta?: string;
};

type LogoSelectProps = {
  value: string;
  items: LogoSelectItem[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
};

type SourceSelectorFieldProps = {
  label: string;
  ariaLabel: string;
  value: string;
  items: LogoSelectItem[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

function LogoSelect({ value, items, onChange, disabled = false, placeholder = 'Select', ariaLabel }: LogoSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedItem = items.find((item) => item.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`logo-select ${disabled ? 'is-disabled' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="logo-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="logo-select-trigger-inner">
          <span className="logo-select-icon" aria-hidden="true">
            {selectedItem?.iconDataUri ? (
              <img src={selectedItem.iconDataUri} alt="" className="logo-select-icon-image" />
            ) : (
              <span className="logo-select-icon-fallback" />
            )}
          </span>
          <span className="logo-select-copy">
            <span className="logo-select-label">{selectedItem?.label ?? placeholder}</span>
            {selectedItem?.meta ? <span className="logo-select-meta">{selectedItem.meta}</span> : null}
          </span>
        </span>
        <ChevronDown size={12} className={`logo-select-chevron ${open ? 'is-open' : ''}`} />
      </button>

      {open ? (
        <div className="logo-select-menu" role="listbox" aria-label={ariaLabel}>
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === value}
              className={`logo-select-option retro-tooltip tooltip-right ${item.value === value ? 'is-active' : ''}`}
              data-tooltip={`${item.label}${item.meta ? ` • ${item.meta}` : ''}`}
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
            >
              <span className="logo-select-icon" aria-hidden="true">
                {item.iconDataUri ? (
                  <img src={item.iconDataUri} alt="" className="logo-select-icon-image" />
                ) : (
                  <span className="logo-select-icon-fallback" />
                )}
              </span>
              <span className="logo-select-copy">
                <span className="logo-select-label">{item.label}</span>
                {item.meta ? <span className="logo-select-meta">{item.meta}</span> : null}
              </span>
              {item.value === value ? <Check size={12} className="logo-select-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SourceSelectorField({
  label,
  ariaLabel,
  value,
  items,
  onChange,
  disabled = false,
  placeholder,
}: SourceSelectorFieldProps) {
  return (
    <label className="source-select-wrap" aria-label={ariaLabel}>
      <span className="source-select-label">{label}</span>
      <LogoSelect
        value={value}
        onChange={onChange}
        items={items}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
      />
    </label>
  );
}

export function pickSourceOption(
  options: ResolvedSourceOption[],
  selectedOptionId: string | null,
  preferredLanguage: 'sub' | 'dub',
) {
  if (!options.length) return null;

  if (selectedOptionId) {
    const explicit = options.find((option) => option.id === selectedOptionId);
    if (explicit) return explicit;
  }

  if (preferredLanguage) {
    const byLanguage = options.find((option) => option.language === preferredLanguage);
    if (byLanguage) return byLanguage;
  }

  return options[0] ?? null;
}
