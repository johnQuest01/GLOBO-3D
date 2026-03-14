// components/globe/ui/SingleSelectButtons.tsx
'use client';
import React, { FC } from 'react';

interface SingleSelectButtonsProps<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selectedValue: T | null;
  onChange: (selected: T | null) => void;
}

const SingleSelectButtons = <T extends string>({
  label,
  options,
  selectedValue,
  onChange,
}: SingleSelectButtonsProps<T>) => {

  const handleSelection = (value: T) => {
    onChange(value === selectedValue ? null : value); // Permite deselecionar se clicar de novo
  };

  return (
    <div>
      <label className="block text-base font-medium text-gray-300 mb-2">{label}</label>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => {
          const isSelected = selectedValue === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelection(option.value)}
              className={`
                px-5 py-2.5 text-base font-medium rounded-full border transition-colors duration-150
                ${
                  isSelected
                    ? 'bg-cyan-600 text-white border-cyan-500 ring-2 ring-cyan-400 ring-offset-1 ring-offset-gray-800'
                    : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600 hover:border-gray-500'
                }
              `}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SingleSelectButtons;