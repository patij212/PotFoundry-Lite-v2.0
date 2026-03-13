import React, { useId } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';
import './SelectV2.css';

export interface SelectV2Option {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectV2Props {
  value: string;
  onChange: (value: string) => void;
  options: SelectV2Option[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const SelectV2 = React.forwardRef<HTMLButtonElement, SelectV2Props>(
  (
    {
      value,
      onChange,
      options,
      label,
      placeholder = 'Select\u2026',
      disabled = false,
      className,
    },
    ref
  ) => {
    const id = useId();

    return (
      <div className={clsx('pf2-select', className)}>
        {label && (
          <label className="pf2-select__label pf2-text-label" htmlFor={id}>
            {label}
          </label>
        )}

        <RadixSelect.Root
          value={value}
          onValueChange={onChange}
          disabled={disabled}
        >
          <RadixSelect.Trigger
            ref={ref}
            id={id}
            className="pf2-select__trigger pf2-focus-ring"
            aria-label={label}
          >
            <RadixSelect.Value placeholder={placeholder} />
            <RadixSelect.Icon className="pf2-select__chevron">
              <ChevronDown size={14} />
            </RadixSelect.Icon>
          </RadixSelect.Trigger>

          <RadixSelect.Portal>
            <RadixSelect.Content
              className="pf2-select__content"
              position="popper"
              sideOffset={4}
            >
              <RadixSelect.Viewport className="pf2-select__viewport">
                {options.map((option) => (
                  <RadixSelect.Item
                    key={option.value}
                    value={option.value}
                    className="pf2-select__item"
                    disabled={option.disabled}
                  >
                    <RadixSelect.ItemText>
                      <span className="pf2-select__item-content">
                        <span className="pf2-select__item-label">
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="pf2-select__item-desc">
                            {option.description}
                          </span>
                        )}
                      </span>
                    </RadixSelect.ItemText>
                    <RadixSelect.ItemIndicator className="pf2-select__check">
                      <Check size={14} />
                    </RadixSelect.ItemIndicator>
                  </RadixSelect.Item>
                ))}
              </RadixSelect.Viewport>
            </RadixSelect.Content>
          </RadixSelect.Portal>
        </RadixSelect.Root>
      </div>
    );
  }
);

SelectV2.displayName = 'SelectV2';
