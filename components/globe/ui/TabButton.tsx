'use client';

import { FC } from 'react';
import { TabName } from '@/app/types/globe';
// REMOVIDO: import clsx from 'clsx'; // Removido para evitar o erro de módulo não encontrado

// Função utilitária para mesclar classes, substituindo clsx
const classNames = (...classes: (string | boolean | null | undefined)[]) => {
    return classes.filter(Boolean).join(' ');
}

// Para resolver o erro, expandimos a interface para aceitar classes customizadas
export interface TabButtonProps {
    tabKey: TabName | string; // Permitindo chaves como 'language' | 'currency'
    label: string;
    activeTab: TabName | string; // Deve ser flexível para País ou Estado
    onClick: (key: TabName | string) => void;
    className?: string; // Classes customizadas para estado INATIVO
    activeClassName?: string; // Classes customizadas para estado ATIVO
}

/**
 * Botão reutilizável para alternar entre abas (Notícias, Língua, Moeda, etc.).
 * Usa className e activeClassName para permitir estilos customizados em CountryPopup.
 */
const TabButton: FC<TabButtonProps> = ({ tabKey, label, activeTab, onClick, className, activeClassName }) => {
    const isActive = activeTab === tabKey;

    // --- Estilos Base ---
    const baseClasses = "text-base font-semibold transition-colors duration-200 w-full text-center hover:shadow-md border-2 p-3";
    
    // Estilos Padrão para Estado/Cidade (Default)
    const defaultInactiveStyle = "bg-gray-700 text-gray-300 border-gray-700 hover:bg-gray-600 rounded-lg";
    const defaultActiveStyle = "bg-cyan-600 text-white border-cyan-500 rounded-lg shadow-inner";
    
    // NOTA: O 'rounded-t-lg' foi ajustado para 'rounded-lg' para ser compatível
    // com as classes passadas pelo CountryPopup, que não usa o 'rounded-t-lg'.

    // --- Mesclagem de Estilos ---
    const finalClasses = classNames( // Usando a função interna classNames
        baseClasses,
        isActive 
            ? (activeClassName || defaultActiveStyle) // Se ATIVO, usa customizado ou padrão
            : (className || defaultInactiveStyle)     // Se INATIVO, usa customizado ou padrão
    );

    return (
        <button
            onClick={() => onClick(tabKey)}
            className={finalClasses}
        >
            {label}
        </button>
    );
};

export default TabButton;
