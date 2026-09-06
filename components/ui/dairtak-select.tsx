'use client';

import { useState } from 'react';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';

type DairtakSelectProps = {
  name: string;
  label: string;
  defaultValue?: string;
  options: readonly { value: string; label: string }[];
  className?: string;
};

/** HeroUI handles focus/typeahead; the hidden input keeps standard GET forms. */
export function DairtakSelect({ name, label, defaultValue = '', options, className }: DairtakSelectProps) {
  const [value, setValue] = useState(defaultValue);
  const selectedIndex = options.findIndex((option) => option.value === value);

  return (
    <Select
      fullWidth
      value={selectedIndex >= 0 ? String(selectedIndex) : null}
      onChange={(key) => {
        const option = options[Number(key)];
        if (key !== null && !Array.isArray(key) && option) setValue(option.value);
      }}
      className={className}
    >
      <Label>{label}</Label>
      <input type="hidden" name={name} value={value} />
      <Select.Trigger className="dairtak-field">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="dairtak-theme" dir="rtl">
        <ListBox aria-label={label}>
          {options.map((option, index) => (
            <ListBox.Item key={option.value} id={String(index)} textValue={option.label} className="min-h-11">
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
