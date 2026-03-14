// components/globe/ui/LocationTagInput.tsx
'use client';

import React, { useState, useMemo, useRef, useEffect, FC } from 'react';
import { FlightLocation } from '@/app/types/flight';
import Fuse from 'fuse.js';
import { useFlightLocations } from '@/app/hooks/useFlightLocations'; // Reutiliza seu hook

interface LocationTagInputProps {
  label: string;
  selectedLocations: FlightLocation[];
  onChange: (locations: FlightLocation[]) => void;
  maxTags?: number;
}

const fuseOptions = {
  keys: ['name'],
  threshold: 0.3,
  includeScore: true,
};

const LocationTagInput: FC<LocationTagInputProps> = ({
  label,
  selectedLocations,
  onChange,
  maxTags = 7,
}) => {
  const { locations: allLocations, isLoading } = useFlightLocations(); // Carrega todos os locais
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const fuse = useMemo(() => new Fuse(allLocations, fuseOptions), [allLocations]);

  const availableLocations = useMemo(() => {
    const selectedKeys = new Set(selectedLocations.map(loc => loc.key));
    return allLocations.filter(loc => !selectedKeys.has(loc.key));
  }, [allLocations, selectedLocations]);

  const searchResults = useMemo(() => {
    if (!searchTerm) {
      return availableLocations.slice(0, 10); // Mostra os primeiros 10 se não houver busca
    }
    const results = fuse.search(searchTerm, { limit: 10 });
    // Filtra para mostrar apenas locais disponíveis
    return results
        .map(result => result.item)
        .filter(item => availableLocations.some(available => available.key === item.key));
  }, [searchTerm, fuse, availableLocations]);

  const addTag = (location: FlightLocation) => {
    if (selectedLocations.length < maxTags && !selectedLocations.some(l => l.key === location.key)) {
      onChange([...selectedLocations, location]);
      setSearchTerm('');
      setIsDropdownOpen(false);
      inputRef.current?.focus();
    }
  };

  const removeTag = (keyToRemove: string) => {
    onChange(selectedLocations.filter((loc) => loc.key !== keyToRemove));
  };

  const handleInputFocus = () => {
    setIsDropdownOpen(true);
  };

   const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Timeout para permitir clique no dropdown
    setTimeout(() => {
      // Verifica se o foco ainda está dentro do input ou do dropdown
      if (
        document.activeElement !== inputRef.current &&
        !dropdownRef.current?.contains(document.activeElement)
      ) {
        setIsDropdownOpen(false);
      }
    }, 150);
  };


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  const canAddMore = selectedLocations.length < maxTags;

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-300 mb-2">{label} (Máx: {maxTags})</label>
      <div className={`
        flex flex-wrap items-center gap-2 p-2 min-h-[44px]
        bg-gray-700 border rounded-lg
        ${isDropdownOpen ? 'border-cyan-500 ring-1 ring-cyan-500' : 'border-gray-600'}
      `}>
        {selectedLocations.map((location) => (
          <span key={location.key} className="flex items-center bg-cyan-600 text-white text-sm font-medium px-3 py-1 rounded-full whitespace-nowrap">
            {location.name}
            <button
              type="button"
              onClick={() => removeTag(location.key)}
              className="ml-1.5 text-cyan-200 hover:text-white text-lg leading-none"
              title={`Remover ${location.name}`}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!isDropdownOpen) setIsDropdownOpen(true);
          }}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={isLoading ? "Carregando locais..." : (canAddMore ? 'Pesquisar local...' : 'Limite atingido')}
          className="flex-grow bg-transparent text-white placeholder-gray-400 focus:outline-none p-1"
          disabled={!canAddMore || isLoading}
        />
      </div>

      {isDropdownOpen && searchResults.length > 0 && canAddMore && (
        <ul
         ref={dropdownRef}
         className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto bg-gray-600 text-white rounded-md shadow-lg border border-gray-500"
         tabIndex={-1} // Permite que o blur funcione corretamente
         >
          {searchResults.map((location) => (
            <li
              key={location.key}
              className="px-3 py-2 cursor-pointer hover:bg-cyan-700"
               onMouseDown={(e) => e.preventDefault()} // Evita que o input perca o foco antes do click
               onClick={() => addTag(location)}
            >
              {location.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LocationTagInput;