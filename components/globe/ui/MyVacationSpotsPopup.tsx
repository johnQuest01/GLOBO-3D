// components/globe/ui/MyVacationSpotsPopup.tsx
'use client';
import React, { FC } from 'react';
import { useSavedVacationSpots } from '@/app/hooks/useSavedVacationSpots';
import { SavedVacationSpot } from '@/app/types/globe';

interface MyVacationSpotsPopupProps {
    isOpen: boolean;
    onClose: () => void;
    onSpotClick: (placeKey: string) => void; // Função para abrir o popup do local
}

const SpotItem: FC<{
    item: SavedVacationSpot;
    onRemove: (placeKey: string) => void;
    onSpotClick: (placeKey: string) => void;
}> = ({ item, onRemove, onSpotClick }) => (
    <div className="p-3 bg-gray-700/50 rounded-lg flex items-center justify-between gap-3">
        <div className="flex-1 overflow-hidden">
            {/* Botão clicável que leva ao popup do estado */}
            <button
                type="button"
                onClick={() => onSpotClick(item.placeKey)}
                className="text-base font-medium text-white truncate text-left hover:text-cyan-400 transition-colors"
                title={`Ver detalhes de ${item.placeName}`}
            >
                {item.placeName}
            </button>
            <p className="text-xs text-gray-400">
                Salvo em: {new Date(item.savedAt).toLocaleDateString()}
            </p>
        </div>
        <button
            type="button"
            onClick={() => onRemove(item.placeKey)}
            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
            title="Remover local"
        >
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
            >
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        </button>
    </div>
);

const MyVacationSpotsPopup: FC<MyVacationSpotsPopupProps> = ({
    isOpen,
    onClose,
    onSpotClick,
}) => {
    const { savedSpots, removeSavedSpot } = useSavedVacationSpots();

    if (!isOpen) return null;

    return (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-50">
            <div
                className="absolute inset-0 bg-black/60 z-10"
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="relative z-20 w-[90vw] max-w-xl">
                <div className="bg-gray-800 rounded-xl shadow-2xl border border-cyan-700 animate-in fade-in zoom-in-95 duration-300 flex flex-col max-h-[70vh]">
                    <div className="p-4 border-b border-cyan-700 shrink-0">
                        <h2 className="text-xl font-bold text-cyan-400">
                            Meus Locais de Férias
                        </h2>
                    </div>
                    <div className="p-6 space-y-4 overflow-y-auto">
                        {savedSpots.length > 0 ? (
                            savedSpots.map((item) => (
                                <SpotItem
                                    key={item.placeKey}
                                    item={item}
                                    onRemove={removeSavedSpot}
                                    onSpotClick={onSpotClick}
                                />
                            ))
                        ) : (
                            <p className="text-gray-400 text-center italic py-8">
                                Você ainda não salvou nenhum local de férias.
                            </p>
                        )}
                    </div>
                    <div className="p-4 flex justify-end border-t border-gray-700 bg-gray-900 rounded-b-xl shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
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
export default MyVacationSpotsPopup;