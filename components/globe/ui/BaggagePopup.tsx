'use client';

import React, { FC, useState, useCallback, useRef, KeyboardEvent } from 'react';

// Interface para um item de bagagem individual
interface BagItem {
  id: string; // Chave estável para o React
  items: string[]; // Lista de "pílulas" (tags)
}

interface BaggagePopupProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------
// COMPONENTE AUXILIAR 1: NumberInput
// ---------------------------------------------------------------------

interface NumberInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (newValue: number) => void;
}

const NumberInput: FC<NumberInputProps> = ({
  label,
  value,
  min,
  max,
  onChange,
}) => {
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

  // Design responsivo usando Tailwind CSS
  return (
    <div className="flex flex-col w-full sm:w-1/2">
      <label className="text-sm font-medium text-gray-300 mb-1">{label}</label>
      <div className="flex items-center space-x-2 bg-gray-900 border border-gray-700 rounded-lg shadow-inner overflow-hidden">
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          // Alterado: p-3 para p-2 para diminuir o botão
          className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors rounded-l-lg"
        >
          <svg
            className="w-5 h-5 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M20 12H4"
            ></path>
          </svg>
        </button>
        <input
          type="number"
          readOnly
          value={value}
          // Alterado: text-xl para text-lg e py-2 para py-1 para diminuir o campo
          className="flex-grow text-center text-lg font-bold bg-transparent text-white focus:outline-none py-1"
          min={min}
          max={max}
        />
        <button
          type="button"
          onClick={increment}
          disabled={value >= max}
          // Alterado: p-3 para p-2 para diminuir o botão
          className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors rounded-r-lg"
        >
          <svg
            className="w-5 h-5 text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 4v16m8-8H4"
            ></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// COMPONENTE AUXILIAR 2: TagInput
// ---------------------------------------------------------------------

interface TagInputProps {
  label: string;
  tags: string[];
  onTagsChange: (newTags: string[]) => void;
}

const TagInput: FC<TagInputProps> = ({ label, tags, onTagsChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Handler para remover um tag
  const removeTag = useCallback(
    (indexToRemove: number) => {
      onTagsChange(tags.filter((_, index) => index !== indexToRemove));
    },
    [tags, onTagsChange],
  );

  // Handler para tecla pressionada (Enter ou Vírgula)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const inputValue = inputRef.current?.value.trim();
        if (inputValue && inputValue.length > 0 && !tags.includes(inputValue)) {
          onTagsChange([...tags, inputValue]);
        }
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    },
    [tags, onTagsChange],
  );

  return (
    <div className="flex flex-col space-y-2">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <div className="flex flex-wrap gap-2 min-h-[40px] items-center p-2 bg-gray-800 border border-gray-700 rounded-lg">
        {tags.map((tag, index) => (
          // MODIFICADO: text-xs para text-sm e px-3 py-1 para px-4 py-1.5 (Aumenta o tamanho da Tag)
          <span
            key={index}
            className="flex items-start bg-cyan-600 text-white text-sm font-medium px-4 py-1.5 rounded-full shadow-md break-all"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              // Mantido: shrink-0 e ml-2
              className="ml-2 text-white/70 hover:text-white transition-colors text-base leading-none shrink-0"
              title={`Remover ${tag}`}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          onKeyDown={handleKeyDown}
          placeholder={
            tags.length === 0
              ? 'Ex: Camisa, Calça, Carregador...'
              : 'Adicionar mais...'
          }
          // MODIFICADO: p-1 para p-2 (Aumenta a altura do campo de digitação)
          className="flex-grow bg-transparent text-white placeholder-gray-500 focus:outline-none p-2 min-w-[100px]"
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// COMPONENTE PRINCIPAL: BaggagePopup
// ---------------------------------------------------------------------

/**
 * Popup modal para o usuário registrar os itens de bagagem, organizado por abas.
 */
const BaggagePopup: FC<BaggagePopupProps> = ({ isOpen, onClose }) => {
  const [suitcases, setSuitcases] = useState<BagItem[]>([]);
  const [backpacks, setBackpacks] = useState<BagItem[]>([]);
  // Estado para controlar a aba ativa: 'suitcases' (Malas) ou 'backpacks' (Mochilas)
  const [activeTab, setActiveTab] = useState<'suitcases' | 'backpacks'>(
    'suitcases',
  );

  if (!isOpen) {
    return null;
  }

  const handleClose = () => {
    onClose();
  };

  // --- LÓGICA DE GESTÃO DE ESTADO (MANTIDA) ---

  // Handlers para os contadores (adiciona ou remove itens do array)
  const handleSuitcaseCountChange = (newCount: number) => {
    setSuitcases((currentSuitcases) => {
      const currentCount = currentSuitcases.length;
      if (newCount > currentCount) {
        const newItems: BagItem[] = Array.from(
          { length: newCount - currentCount },
          () => ({
            id: `suitcase-${Date.now()}-${Math.random()}`,
            items: [],
          }),
        );
        return [...currentSuitcases, ...newItems];
      } else if (newCount < currentCount) {
        return currentSuitcases.slice(0, newCount);
      }
      return currentSuitcases;
    });
  };

  const handleBackpackCountChange = (newCount: number) => {
    setBackpacks((currentBackpacks) => {
      const currentCount = currentBackpacks.length;
      if (newCount > currentCount) {
        const newItems: BagItem[] = Array.from(
          { length: newCount - currentCount },
          () => ({
            id: `backpack-${Date.now()}-${Math.random()}`,
            items: [],
          }),
        );
        return [...currentBackpacks, ...newItems];
      } else if (newCount < currentCount) {
        return currentBackpacks.slice(0, newCount);
      }
      return currentBackpacks;
    });
  };

  // Handler para atualizar os tags de um item específico pelo ID
  const handleSuitcaseTagsChange = (idToUpdate: string, newTags: string[]) => {
    setSuitcases((currentSuitcases) =>
      currentSuitcases.map((suitcase) =>
        suitcase.id === idToUpdate
          ? { ...suitcase, items: newTags }
          : suitcase,
      ),
    );
  };

  const handleBackpackTagsChange = (idToUpdate: string, newTags: string[]) => {
    setBackpacks((currentBackpacks) =>
      currentBackpacks.map((backpack) =>
        backpack.id === idToUpdate
          ? { ...backpack, items: newTags }
          : backpack,
      ),
    );
  };

  // Handlers para remover um item específico (o "x")
  const removeSuitcase = (idToRemove: string) => {
    setSuitcases((currentSuitcases) =>
      currentSuitcases.filter((suitcase) => suitcase.id !== idToRemove),
    );
  };

  const removeBackpack = (idToRemove: string) => {
    setBackpacks((currentBackpacks) =>
      currentBackpacks.filter((backpack) => backpack.id !== idToRemove),
    );
  };

  // --- GERAÇÃO DINÂMICA DE CAMPOS (MANTIDA) ---

  // Gera os campos de input para malas
  const suitcaseFields = suitcases.map((suitcase, index) => (
    <div key={suitcase.id} className="relative group p-3 bg-gray-700/50 rounded-lg">
      {/* Botão de Excluir */}
      <button
        type="button"
        onClick={() => removeSuitcase(suitcase.id)}
        className="absolute -top-2 -right-2 z-10 w-6 h-6 bg-red-600 text-white rounded-full
                            flex items-center justify-center text-base font-bold
                            hover:bg-red-700 transition-all
                            focus:outline-none focus:ring-2 focus:ring-red-500"
        title={`Remover Mala ${index + 1}`}
      >
        &times;
      </button>

      <TagInput
        label={`Mala ${
          index + 1
        }: O que eu estou levando (itens separados por Enter):`}
        tags={suitcase.items}
        onTagsChange={(newTags) =>
          handleSuitcaseTagsChange(suitcase.id, newTags)
        }
      />
    </div>
  ));

  // Gera os campos de input para mochilas
  const backpackFields = backpacks.map((backpack, index) => (
    <div key={backpack.id} className="relative group p-3 bg-gray-700/50 rounded-lg">
      {/* Botão de Excluir */}
      <button
        type="button"
        onClick={() => removeBackpack(backpack.id)}
        className="absolute -top-2 -right-2 z-10 w-6 h-6 bg-red-600 text-white rounded-full
                            flex items-center justify-center text-base font-bold
                            hover:bg-red-700 transition-all
                            focus:outline-none focus:ring-2 focus:ring-red-500"
        title={`Remover Mochila ${index + 1}`}
      >
        &times;
      </button>

      <TagInput
        key={backpack.id}
        label={`Mochila ${
          index + 1
        }: O que eu estou levando (itens separados por Enter):`}
        tags={backpack.items}
        onTagsChange={(newTags) =>
          handleBackpackTagsChange(backpack.id, newTags)
        }
      />
    </div>
  )); // <-- FECHAMENTO CORRIGIDO

  // --- COMPONENTES AUXILIARES DE TABS ---

  const TabButton = ({
    label,
    count,
    isActive,
    onClick,
  }: {
    label: string;
    count: number;
    isActive: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`
                // Alterado: py-3 para py-2 para diminuir a altura da aba
                flex-1 text-center py-2 px-2 sm:px-4 font-semibold text-sm sm:text-base transition-all duration-200
                ${
                  isActive
                    ? 'text-cyan-400 border-b-2 border-cyan-400 shadow-[0_1px_0_0_#06b6d4]' // Estilo Ativo
                    : 'text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-500' // Estilo Inativo
                }
            `}
    >
      {label} ({count})
    </button>
  );

  const renderTabContent = () => {
    const isSuitcaseTab = activeTab === 'suitcases';
    const fields = isSuitcaseTab ? suitcaseFields : backpackFields;
    const isContentEmpty = fields.length === 0;
    const bagType = isSuitcaseTab ? 'malas' : 'mochilas';

    if (isContentEmpty) {
      return (
        <div className="pt-6 pb-2">
          <p className="text-gray-500 text-center italic">
            Ajuste a quantidade de {bagType} no contador acima para adicionar
            itens.
          </p>
        </div>
      );
    }

    return <div className="space-y-4 pt-6">{fields}</div>;
  };

  // --- RENDERIZAÇÃO PRINCIPAL DO MODAL ---

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]">
      {/* 1. Overlay */}
      <div
        className="absolute inset-0 bg-black/60 z-10 animate-in fade-in-0 duration-300"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* 2. Modal Content */}
      <div className="relative z-20 w-[90vw] max-w-2xl">
        {/* --- CORREÇÃO DE ALTURA --- */}
        {/* max-h-[70vh] (70% da tela) alterado para max-h-[85vh] (85% da tela) */}
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-blue-700 animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[85vh] overflow-hidden">
          {/* Cabeçalho */}
          <div className="p-4 border-b border-blue-700 shrink-0">
            <h2 className="text-xl font-bold text-blue-400">
              O que você está levando?
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Registre os itens da sua bagagem, organizada por tipo.
            </p>
          </div>

          {/* Corpo Scrollável (Apenas o conteúdo da aba deve rolar, não os contadores e abas) */}
          <div className="flex flex-col h-full overflow-hidden">
            {/* Seção de Contadores (Fixa no topo) */}
            {/* PADDING ALTERADO para p-3 pb-1 para reduzir drasticamente o tamanho da área, liberando espaço para o conteúdo das abas. */}
            <div className="p-3 pb-1 shrink-0 border-b border-gray-700">
              <div className="flex flex-col sm:flex-row sm:justify-around gap-6">
                <NumberInput
                  label="Número total de Malas:"
                  value={suitcases.length}
                  onChange={handleSuitcaseCountChange}
                  min={0}
                  max={100} // Limite de 100
                />
                <NumberInput
                  label="Número total de Mochilas:"
                  value={backpacks.length}
                  onChange={handleBackpackCountChange}
                  min={0}
                  max={100} // Limite de 100
                />
              </div>
            </div>

            {/* Navegação de Abas (Fixa) */}
            <div className="flex border-b border-gray-700 bg-gray-900/50 shrink-0">
              <TabButton
                label="Malas"
                count={suitcases.length}
                isActive={activeTab === 'suitcases'}
                onClick={() => setActiveTab('suitcases')}
              />
              <TabButton
                label="Mochilas"
                count={backpacks.length}
                isActive={activeTab === 'backpacks'}
                onClick={() => setActiveTab('backpacks')}
              />
            </div>

            {/* Conteúdo da Aba (Scrollável) */}
            <div className="p-6 overflow-y-auto grow">{renderTabContent()}</div>
          </div>

          {/* Rodapé com Ações (Fixa no final) */}
          <div className="p-4 flex justify-end items-center border-t border-gray-700 bg-gray-900 rounded-b-xl shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BaggagePopup;
