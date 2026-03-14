// components/globe/ui/TravelPopup.tsx
'use client';

import React, { FC, useState, Fragment } from 'react';
import { FlightLocation } from '@/app/types/flight';
// Importa o novo componente de busca
import SearchableSelect from './SearchableSelect';

interface TravelPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (flight: { fromKey: string; toKey: string }) => void;
  locations: FlightLocation[];
}

/**
 * Popup modal para o usuário selecionar a origem e o destino da viagem.
 * AGORA COM BUSCA FUZZY.
 */
const TravelPopup: FC<TravelPopupProps> = ({
  isOpen,
  onClose,
  onSubmit,
  locations,
}) => {
  const [fromKey, setFromKey] = useState<string>('');
  const [toKey, setToKey] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fromKey && toKey && fromKey !== toKey) {
      onSubmit({ fromKey, toKey });
    }
  };

  // Filtra a lista de destinos para não incluir a origem selecionada
  const destinationLocations = locations.filter((loc) => loc.key !== fromKey);
  // Filtra a lista de origens para não incluir o destino selecionado
  const originLocations = locations.filter((loc) => loc.key !== toKey);

  const canSubmit = fromKey && toKey && fromKey !== toKey;

  if (!isOpen) {
    return null;
  }

  // Reseta o estado interno ao fechar
  const handleClose = () => {
    setFromKey('');
    setToKey('');
    onClose();
  };

  return (
    // CORREÇÃO: Adotando a mesma estrutura do StatePopup.tsx
    // Este wrapper 'absolute' o coloca no mesmo stacking context do canvas.
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]">
      {/* 1. Overlay */}
      <div
        // CORREÇÃO: Trocado 'fixed' por 'absolute' e z-index relativo (z-10)
        className="absolute inset-0 bg-black/60 z-10 animate-in fade-in-0 duration-300"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* 2. Modal Content */}
      <div
        // CORREÇÃO: Trocado 'fixed' por 'relative' e z-index relativo (z-20)
        // O wrapper 'flex' agora cuida da centralização.
        className="relative z-20 w-[90vw] max-w-md"
      >
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-cyan-700 animate-in fade-in zoom-in-95 duration-300">
          <form onSubmit={handleSubmit}>
            {/* Cabeçalho */}
            <div className="p-4 border-b border-cyan-700">
              <h2 className="text-xl font-bold text-cyan-400">
                Para onde iremos viajar?
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">
                Selecione a origem e o destino.
              </p>
            </div>

            {/* Campos do Formulário */}
            <div className="p-6 space-y-5">
              {/* Origem (NOVO COMPONENTE) */}
              <div>
                <label
                  htmlFor="fromLocation"
                  className="block text-sm font-medium text-gray-300 mb-1 pl-3"
                >
                  De: (Origem)
                </label>
                <SearchableSelect
                  locations={originLocations}
                  value={fromKey}
                  onChange={setFromKey}
                  placeholder="Selecione um local de partida..."
                />
              </div>

              {/* Destino (NOVO COMPONENTE) */}
              <div>
                <label
                  htmlFor="toLocation"
                  className="block text-sm font-medium text-gray-300 mb-1 pl-3"
                >
                  Para: (Destino)
                </label>
                <SearchableSelect
                  locations={destinationLocations}
                  value={toKey}
                  onChange={setToKey}
                  placeholder={
                    !fromKey
                      ? 'Selecione a origem primeiro...'
                      : 'Selecione um destino...'
                  }
                  disabled={!fromKey}
                />
              </div>
            </div>

            {/* Rodapé com Ações */}
            <div className="p-4 flex justify-between items-center border-t border-gray-700 bg-gray-900 rounded-b-xl space-x-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-500
                disabled:bg-gray-500 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                Viajar!
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TravelPopup;

