// components/globe/ui/SearchableSelect.tsx
'use client';

import React, { useState, useMemo, useRef, useEffect, FC } from 'react';
import { FlightLocation } from '@/app/types/flight';
import Fuse from 'fuse.js';

interface SearchableSelectProps {
  locations: FlightLocation[];
  value: string; // O 'key' selecionado
  onChange: (key: string) => void;
  placeholder: string;
  disabled?: boolean;
}

// Configuração do Fuse.js para buscar pelo nome
const fuseOptions = {
  keys: ['name'],
  threshold: 0.3, // Ajuste para mais ou menos tolerância a erros (0.0 = exato, 1.0 = qualquer coisa)
  includeScore: true,
};

/**
 * Ícone de "X" para limpar a busca
 */
const ClearIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-500"
  >
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

/**
 * Ícone de "Chevron" para indicar o dropdown
 */
const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`text-gray-500 transition-transform duration-200 ${
      isOpen ? 'rotate-180' : ''
    }`}
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const SearchableSelect: FC<SearchableSelectProps> = ({
  locations,
  value,
  onChange,
  placeholder,
  disabled = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inicializa o Fuse.js com as localizações
  const fuse = useMemo(() => new Fuse(locations, fuseOptions), [locations]);

  // Filtra os resultados com base na busca
  const results = useMemo(() => {
    if (!searchTerm) {
      return locations; // Mostra todos se a busca estiver vazia
    }
    // Retorna os itens filtrados pelo Fuse
    return fuse.search(searchTerm).map((result) => result.item);
  }, [searchTerm, locations, fuse]);

  // Encontra o nome de exibição do valor (key) selecionado
  const selectedLocationName = useMemo(() => {
    if (!value) return '';
    return locations.find((loc) => loc.key === value)?.name || '';
  }, [value, locations]);

  // Efeito para fechar o dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handler para selecionar um item
  const handleSelect = (key: string) => {
    onChange(key);
    setSearchTerm(''); // Limpa a busca
    setIsOpen(false); // Fecha o dropdown
    inputRef.current?.blur(); // Tira o foco do input
  };

  // Handler para limpar a seleção
  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation(); // Impede que o clique abra o dropdown
    onChange('');
    setSearchTerm('');
  };

  // Handler para focar no input e abrir o dropdown
  const handleInputFocus = () => {
    setIsOpen(true);
    // Se um item já está selecionado, usamos ele como termo de busca
    // para que o usuário possa "editar" a seleção
    if (selectedLocationName) {
      setSearchTerm(selectedLocationName);
    }
  };

  // Handler para quando o input perde o foco
  const handleInputBlur = () => {
    // Pequeno delay para permitir que o clique no item do dropdown
    // seja registrado antes do blur fechar a lista
    setTimeout(() => {
      if (isOpen) {
        // Se o usuário clicou fora sem selecionar, resetamos o input
        // para o nome do local selecionado (ou vazio)
        setSearchTerm('');
        setIsOpen(false);
      }
    }, 150);
  };

  const displayValue = isOpen ? searchTerm : selectedLocationName;

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* O Input em formato de pílula */}
      <div
        className={`relative w-full p-3 pr-10 bg-gray-900 text-white rounded-full border border-gray-600 focus-within:ring-2 focus-within:ring-cyan-500 transition-all ${
          disabled ? 'bg-gray-700 opacity-50 cursor-not-allowed' : ''
        }`}
        onClick={() => !disabled && inputRef.current?.focus()} // Foca no input ao clicar na "pílula"
      >
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full h-full bg-transparent text-white placeholder-gray-500 focus:outline-none"
          autoComplete="off"
        />
        {/* Botões de Ação (Limpar / Abrir) */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {value && !isOpen ? (
            // Botão de Limpar (X)
            <button type="button" onClick={clearSelection} className="p-1">
              <ClearIcon />
            </button>
          ) : (
            // Ícone Chevron
            <div className="p-1" onClick={() => setIsOpen(!isOpen)}>
              <ChevronIcon isOpen={isOpen} />
            </div>
          )}
        </div>
      </div>

      {/* Dropdown de Resultados */}
      {isOpen && !disabled && (
        <ul className="absolute z-10 w-full mt-2 max-h-60 overflow-y-auto bg-gray-700 text-white rounded-lg shadow-lg border border-gray-600 animate-in fade-in zoom-in-95 duration-200">
          {results.length > 0 ? (
            results.map((loc) => (
              <li
                key={loc.key}
                className="px-4 py-3 cursor-pointer hover:bg-cyan-600 transition-colors"
                onMouseDown={(e) => e.preventDefault()} // Previne que o onBlur do input feche o menu
                onClick={() => handleSelect(loc.key)}
              >
                {loc.name}
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-gray-400 italic">
              Nenhum local encontrado.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchableSelect;