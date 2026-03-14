// components/globe/ui/NumberInput.tsx
'use client';

import React, { FC } from 'react';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
}

const NumberInput: FC<NumberInputProps> = ({ label, value, onChange, min = 0, max = 10 }) => {
  const increment = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  const decrement = () => {
    if (value > min) {
      onChange(value - 1);
    }
  };

  return (
    <div className="flex flex-col">
      <label className="block text-sm font-medium text-gray-300 mb-2">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          className="p-2 w-10 h-10 rounded-full bg-gray-700 text-white font-bold text-lg leading-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
        >
          -
        </button>
        <span className="text-xl font-bold text-white w-12 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={increment}
          disabled={value >= max}
          className="p-2 w-10 h-10 rounded-full bg-cyan-600 text-white font-bold text-lg leading-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyan-700 transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
};

export default NumberInput;