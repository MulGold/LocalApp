import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: React.ReactNode | string;
  disabled?: boolean;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  labelPrefix?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  labelPrefix,
  icon,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  triggerClassName = '',
  menuClassName = '',
  id,
  'aria-label': ariaLabel
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Update popup position relative to trigger using viewport coordinates
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const estimatedMenuHeight = Math.min(options.length * 38 + 12, 260);
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    const openUpward = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;

    // Minimum width matches trigger width, max width capped to screen width minus padding
    const minWidth = Math.max(rect.width, 160);
    const menuWidth = Math.min(Math.max(minWidth, rect.width), viewportWidth - 24);

    let left = rect.left;
    if (left + menuWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - menuWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    const style: React.CSSProperties = {
      position: 'fixed',
      left: `${left}px`,
      width: `${menuWidth}px`,
      zIndex: 9999,
    };

    if (openUpward) {
      style.bottom = `${viewportHeight - rect.top + 6}px`;
      style.maxHeight = `${Math.min(spaceAbove - 16, 260)}px`;
    } else {
      style.top = `${rect.bottom + 6}px`;
      style.maxHeight = `${Math.min(spaceBelow - 16, 260)}px`;
    }

    setMenuStyle(style);
  }, [options.length]);

  // Recalculate position whenever opened, scrolled, or resized
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click or tap
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement | HTMLDivElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsOpen(true);
        const currentIndex = options.findIndex((o) => o.value === value && !o.disabled);
        setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      let nextIndex = highlightedIndex + 1;
      while (nextIndex < options.length && options[nextIndex]?.disabled) {
        nextIndex++;
      }
      if (nextIndex < options.length) {
        setHighlightedIndex(nextIndex);
        scrollOptionIntoView(nextIndex);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      let prevIndex = highlightedIndex - 1;
      while (prevIndex >= 0 && options[prevIndex]?.disabled) {
        prevIndex--;
      }
      if (prevIndex >= 0) {
        setHighlightedIndex(prevIndex);
        scrollOptionIntoView(prevIndex);
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        const selected = options[highlightedIndex];
        if (selected && !selected.disabled) {
          onChange(selected.value);
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      }
    }
  };

  const scrollOptionIntoView = (index: number) => {
    if (!optionsListRef.current) return;
    const optionEl = optionsListRef.current.children[index] as HTMLElement;
    if (optionEl) {
      optionEl.scrollIntoView({ block: 'nearest' });
    }
  };

  const handleSelectOption = (opt: CustomSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const toggleDropdown = () => {
    if (disabled) return;
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        const currentIndex = options.findIndex((o) => o.value === value && !o.disabled);
        setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
      }
      return next;
    });
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        disabled={disabled}
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || (typeof labelPrefix === 'string' ? `${labelPrefix} ${selectedOption?.label || ''}` : undefined)}
        className={`flex items-center justify-between gap-2 transition-all select-none text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
          triggerClassName ||
          'bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-dark hover:border-dark focus:outline-none focus:ring-1 focus:ring-primary'
        }`}
      >
        <span className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
          {icon && <span className="shrink-0">{icon}</span>}
          {labelPrefix && (
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">
              {labelPrefix}
            </span>
          )}
          <span className="truncate font-bold text-dark">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-gray-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-primary' : ''
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className={`bg-white rounded-xl border border-gray-200 shadow-2xl overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100 ${menuClassName}`}
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
          >
            <div
              ref={optionsListRef}
              className="max-h-[240px] overflow-y-auto divide-y divide-gray-50/50 pr-0.5"
            >
              {options.map((option, idx) => {
                const isSelected = option.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={`${option.value}-${idx}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onClick={() => handleSelectOption(option)}
                    onMouseEnter={() => {
                      if (!option.disabled) setHighlightedIndex(idx);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2 text-xs transition-colors text-left cursor-pointer ${
                      option.disabled
                        ? 'opacity-40 cursor-not-allowed text-gray-400 bg-gray-50/40'
                        : isSelected
                        ? 'bg-orange-50/90 text-primary font-bold'
                        : isHighlighted
                        ? 'bg-gray-50 text-dark font-semibold'
                        : 'text-gray-700 hover:bg-gray-50 font-medium'
                    }`}
                  >
                    <span className="truncate flex-1">{option.label}</span>
                    {isSelected && (
                      <Check size={14} className="text-primary shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default CustomSelect;
