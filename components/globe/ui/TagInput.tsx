// components/globe/ui/TagInput.tsx
'use client';

import React, { FC, useState, KeyboardEvent } from 'react';

interface TagInputProps {
  label: string;
  tags: string[];
  onTagsChange: (newTags: string[]) => void;
}

const TagInput: FC<TagInputProps> = ({ label, tags, onTagsChange }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      if (!tags.includes(inputValue.trim())) {
        onTagsChange([...tags, inputValue.trim()]);
      }
      setInputValue('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-400 mb-1">
        {label}
      </label>
      <div className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 flex flex-wrap gap-2 focus-within:ring-2 focus-within:ring-cyan-500">
        {/* Pills (Tags) */}
        {tags.map((tag, index) => (
          <div key={index} className="flex items-center bg-cyan-700 text-white text-sm font-medium px-3 py-1 rounded-full">
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-2 text-cyan-200 hover:text-white"
            >
              &times;
            </button>
          </div>
        ))}
        {/* Input Field */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite um item e pressione Enter..."
          className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none min-w-[200px]"
        />
      </div>
    </div>
  );
};

export default TagInput;