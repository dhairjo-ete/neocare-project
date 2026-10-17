import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

function extractText(children) {
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    return children.map(extractText).join('');
  }
  if (React.isValidElement(children)) {
    return extractText(children.props.children);
  }
  return String(children);
}

export default function CustomSelect({
  value,
  onChange,
  options: rawOptions,
  children,
  placeholder = 'Select...',
  className = '',
  style = {},
  disabled = false,
  required = false,
  name,
  id,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0, openUpward: false });
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const selectedItemRef = useRef(null);

  // Normalize options array from props or children
  const parsedOptions = useMemo(() => {
    if (Array.isArray(rawOptions) && rawOptions.length > 0) {
      return rawOptions.map((opt) => {
        if (typeof opt === 'object' && opt !== null) {
          return {
            value: String(opt.value ?? opt.id ?? ''),
            label: String(opt.label ?? opt.name ?? opt.value ?? ''),
            disabled: !!opt.disabled,
            status: opt.status || opt['data-status'] || null,
            hint: opt.hint || opt['data-hint'] || opt.title || null,
          };
        }
        return { value: String(opt), label: String(opt), disabled: false };
      });
    }

    // Parse React children (<option value="val">Text</option>)
    if (children) {
      const childArray = React.Children.toArray(children);
      return childArray
        .filter((child) => React.isValidElement(child) && child.type === 'option')
        .map((child) => {
          const text = extractText(child.props.children);
          return {
            value: String(child.props.value ?? text),
            label: text || String(child.props.value ?? ''),
            disabled: !!child.props.disabled,
            status: child.props['data-status'] || child.props.status || null,
            hint: child.props['data-hint'] || child.props.title || null,
          };
        });
    }

    return [];
  }, [rawOptions, children]);

  // Find active option index
  const selectedIndex = useMemo(() => {
    return parsedOptions.findIndex((opt) => String(opt.value) === String(value));
  }, [parsedOptions, value]);

  const selectedOption = useMemo(() => {
    return selectedIndex >= 0 ? parsedOptions[selectedIndex] : null;
  }, [parsedOptions, selectedIndex]);

  // Recalculate menu position dynamically (handles scrolling and screen resize)
  const updateMenuPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom;
    const estimatedMenuHeight = Math.min(parsedOptions.length * 40 + 12, 260);
    const openUpward = spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight;

    // Minimum comfortable width so full incubator name, NICU name, and status badge are clearly visible
    const minMenuWidth = Math.max(rect.width, 320);
    const adjustedLeft = Math.min(rect.left, viewportWidth - minMenuWidth - 16);

    setMenuPosition({
      top: openUpward ? rect.top - estimatedMenuHeight - 4 : rect.bottom + 4,
      left: Math.max(8, adjustedLeft),
      width: minMenuWidth,
      openUpward,
    });
  }, [parsedOptions.length]);

  // Update position on open, sync highlighted index, and auto-scroll selected box into view
  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);

    // Auto-scroll selected red item into view smoothly
    const scrollTimer = setTimeout(() => {
      if (selectedItemRef.current) {
        selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 40);

    // Listen to scroll events on parent containers (capture phase) and window resize
    const handleScrollOrResize = () => {
      updateMenuPosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      clearTimeout(scrollTimer);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, selectedIndex, updateMenuPosition]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target) &&
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (option) => {
    if (disabled || option.disabled) return;
    setIsOpen(false);

    // Call onChange with synthetic event object for standard input compatibility
    if (typeof onChange === 'function') {
      const syntheticEvent = {
        target: {
          name: name || id || '',
          value: option.value,
        },
      };
      onChange(syntheticEvent);
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < parsedOptions.length) {
        handleSelect(parsedOptions[highlightedIndex]);
      } else {
        setIsOpen((prev) => !prev);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        const nextIdx = highlightedIndex < parsedOptions.length - 1 ? highlightedIndex + 1 : 0;
        setHighlightedIndex(nextIdx);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(parsedOptions.length - 1);
      } else {
        const prevIdx = highlightedIndex > 0 ? highlightedIndex - 1 : parsedOptions.length - 1;
        setHighlightedIndex(prevIdx);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const menuElement = isOpen ? (
    <div
      ref={menuRef}
      className={`custom-select-menu ${menuPosition.openUpward ? 'open-upward' : ''}`}
      role="listbox"
      style={{
        position: 'fixed',
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        width: `${menuPosition.width}px`,
        minWidth: '140px',
        zIndex: 999999,
      }}
    >
      {parsedOptions.length === 0 ? (
        <div className="custom-select-empty">No options available</div>
      ) : (
        parsedOptions.map((option, index) => {
          const isSelected = String(option.value) === String(value);
          const isHighlighted = index === highlightedIndex;

          return (
            <div
              key={option.value}
              ref={isSelected ? selectedItemRef : null}
              role="option"
              aria-selected={isSelected}
              aria-disabled={option.disabled}
              className={`custom-select-option ${isSelected ? 'is-selected' : ''} ${isHighlighted && !option.disabled ? 'is-highlighted' : ''} ${option.disabled ? 'is-disabled' : ''}`}
              onClick={() => handleSelect(option)}
              onMouseEnter={() => !option.disabled && setHighlightedIndex(index)}
              style={
                option.disabled
                  ? {
                      opacity: 0.65,
                      cursor: 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }
                  : {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }
              }
            >
              <span className="custom-select-option-text" style={{ flex: 1 }}>{option.label}</span>
              {option.disabled && (
                <span
                  className="custom-select-info-wrapper"
                  onClick={(e) => e.stopPropagation()}
                  tabIndex={0}
                  title={option.hint || (option.status === 'maintenance' ? 'Under Maintenance' : option.status === 'offline' ? 'Offline' : 'Unavailable')}
                  aria-label={option.hint || (option.status === 'maintenance' ? 'Under Maintenance' : option.status === 'offline' ? 'Offline' : 'Unavailable')}
                >
                  <span className={`custom-select-info-icon status-${option.status || 'unavailable'}`}>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </span>
                  <span className="custom-select-tooltip">
                    {option.hint || (option.status === 'maintenance' ? 'Under Maintenance' : option.status === 'offline' ? 'Offline' : 'Unavailable')}
                  </span>
                </span>
              )}
              {isSelected && !option.disabled && (
                <svg
                  className="custom-select-check-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          );
        })
      )}
    </div>
  ) : null;

  return (
    <div
      ref={containerRef}
      className={`custom-select-wrapper ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      style={{ position: 'relative', width: '100%', minWidth: '140px', ...style }}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        required={required}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`custom-select-value ${!selectedOption ? 'is-placeholder' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`custom-select-arrow ${isOpen ? 'is-rotated' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Hidden Native Select for standard form submissions if needed */}
      <select
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        id={id ? `${id}-hidden` : undefined}
        value={value ?? ''}
        onChange={() => {}}
        style={{ display: 'none' }}
      >
        {parsedOptions.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Render menu dynamically in document.body via Portal to prevent modal/table clipping */}
      {isOpen && typeof document !== 'undefined' && createPortal(menuElement, document.body)}
    </div>
  );
}
