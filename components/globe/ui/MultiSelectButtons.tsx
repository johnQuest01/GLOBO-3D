// components/globe/ui/MultiSelectButtons.tsx
'use client';
import React, { FC } from 'react';

interface MultiSelectButtonsProps<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selectedValues: T[];
  onChange: (selected: T[]) => void;
  allowAllOption?: { value: T; label: string }; // Opção "Todas" opcional
}

const MultiSelectButtons = <T extends string>({
  label,
  options,
  selectedValues,
  onChange,
  allowAllOption,
}: MultiSelectButtonsProps<T>) => {

  const toggleSelection = (value: T) => {
    let newSelected: T[];

    if (allowAllOption && value === allowAllOption.value) {
      // Se clicar em "Todas", seleciona apenas "Todas"
      newSelected = [allowAllOption.value];
    } else {
      const isSelected = selectedValues.includes(value);
      if (isSelected) {
        // Remove o valor, e remove "Todas" se estava selecionado
        newSelected = selectedValues.filter(v => v !== value && (!allowAllOption || v !== allowAllOption.value));
      } else {
        // Adiciona o valor, e remove "Todas" se estava selecionado
        newSelected = [...selectedValues.filter(v => !allowAllOption || v !== allowAllOption.value), value];
      }
      // Se todos os outros foram selecionados, seleciona "Todas" automaticamente (opcional)
      // if (allowAllOption && newSelected.length === options.length) {
      //   newSelected = [allowAllOption.value];
      // }
    }
     // Se nada está selecionado e tem opção "Todas", seleciona "Todas"
    if (newSelected.length === 0 && allowAllOption) {
        newSelected = [allowAllOption.value];
    }

    onChange(newSelected);
  };

  const allOptions = allowAllOption ? [allowAllOption, ...options] : options;
  const isAllSelected = allowAllOption ? selectedValues.includes(allowAllOption.value) : false;

  return (
    <div>
      <label className="block text-base font-medium text-gray-300 mb-2">{label}</label>
      <div className="flex flex-wrap gap-3">
        {allOptions.map((option) => {
          const isSelected = isAllSelected && option.value === allowAllOption?.value
                             || !isAllSelected && selectedValues.includes(option.value);
          const isAllButton = allowAllOption && option.value === allowAllOption.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleSelection(option.value)}
              className={`
                px-5 py-2.5 text-base font-medium rounded-full border transition-colors duration-150
                ${
                  isSelected
                    ? 'bg-cyan-600 text-white border-cyan-500 ring-2 ring-cyan-400 ring-offset-1 ring-offset-gray-800'
                    : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600 hover:border-gray-500'
                }
                 ${ isAllButton && isAllSelected ? 'font-bold' : ''}
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

export default MultiSelectButtons;