// components/globe/ui/DynamicNewsButton.tsx
 'use client';

 import React, { FC } from 'react';
 // --- CORREÇÃO: Ajuste no caminho do ícone se necessário ---
 // Assumindo que o ícone está em app/icons/CoffeeIcon.tsx
 import { CoffeeIcon } from '@/app/icons/CoffeeIcon';
 // --- FIM DA CORREÇÃO ---


 interface DynamicNewsButtonProps {
 onClick: () => void;
 disabled?: boolean;
 isVisible?: boolean;
 className?: string;
 }

 /**
 * Botão flutuante para abrir o popup de Notícias Dinâmicas.
 * Possui um fundo branco circular com o ícone de café.
 */
 const DynamicNewsButton: FC<DynamicNewsButtonProps> = ({
 onClick,
 disabled = false,
 isVisible = true,
 className = 'bottom-36', // Posição padrão (será controlada pelo GlobeCanvas)
 }) => {
 return (
 <button
 onClick={onClick}
 disabled={disabled}
 title="Ver Notícias Dinâmicas"
 // Adicionado 'group' para hover effect no div interno
 className={`group absolute right-4 z-[100] p-0 rounded-full shadow-lg

 ${/* Estilo do Botão: Círculo maior */ ''}
 w-12 h-12 sm:w-14 sm:h-14

 // Estilo Base (borda ciano sobre fundo escuro)
 bg-gray-800 border-2 border-cyan-500

 // Estilo Hover (borda mais clara)
 hover:border-cyan-400

 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500
 disabled:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-gray-500

 ${/* Lógica de transição e visibilidade */ ''}
 transition-all duration-300 ease-in-out
 ${
 isVisible
 ? 'opacity-100 translate-y-0'
 : 'opacity-0 translate-y-10 pointer-events-none'
 }

 ${/* Classe de posicionamento */ ''}
 ${className}

 ${disabled ? 'animate-pulse' : ''}
 `}
 >
 {/* Círculo Interno Branco */}
 <div className="w-full h-full rounded-full bg-white flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
 <CoffeeIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-900" />
 </div>
 </button>
 );
 };

 export default DynamicNewsButton;