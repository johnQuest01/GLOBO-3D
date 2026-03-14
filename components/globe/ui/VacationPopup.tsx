// components/globe/ui/VacationPopup.tsx
'use client';

import React, { FC, useState } from 'react';
import { FlightLocation } from '@/app/types/flight';
// Assumindo que SearchableSelect existe em '@/components/globe/ui/SearchableSelect'
import SearchableSelect from './SearchableSelect';

interface VacationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (flight: { locationKey: string }) => void;
  locations: FlightLocation[];
}

/**
 * Popup modal para o usuário selecionar um local (País ou Estado)
 * para marcar com um pino no globo.
 */
const VacationPopup: FC<VacationPopupProps> = ({
  isOpen,
  onClose,
  onSubmit,
  locations,
}) => {
  const [locationKey, setLocationKey] = useState<string>('');

  const handleSubmit = () => {
    if (locationKey) {
      onSubmit({ locationKey });
    }
  };

  if (!isOpen) {
    return null;
  }

  // Reseta o estado interno ao fechar
  const handleClose = () => {
    setLocationKey('');
    onClose();
  };

  const canSubmit = locationKey !== '';

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-[110]">
      {/* 1. Overlay */}
      <div
        className="absolute inset-0 bg-black/60 z-10 animate-in fade-in-0 duration-300"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* 2. Modal Content */}
      <div className="relative z-20 w-[90vw] max-w-md">
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-blue-700 animate-in fade-in zoom-in-95 duration-300">
          {/* Cabeçalho */}
          <div className="p-4 border-b border-blue-700">
            <h2 className="text-xl font-bold text-blue-400">
              Planejar Férias
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Escolha um local para marcar no globo.
            </p>
          </div>

          {/* Campo de Seleção */}
          <div className="p-6 space-y-5">
            <div>
              <label
                htmlFor="vacationLocation"
                className="block text-sm font-medium text-gray-300 mb-1 pl-3"
              >
                Localização (País ou Estado):
              </label>
              <SearchableSelect
                locations={locations}
                value={locationKey}
                onChange={setLocationKey}
                placeholder="Procure um local..."
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
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500
              disabled:bg-gray-500 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              Marcar no Globo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VacationPopup;
