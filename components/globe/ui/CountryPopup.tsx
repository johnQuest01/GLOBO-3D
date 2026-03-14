// components/globe/ui/CountryPopup.tsx
'use client';

import React, { FC, useState } from 'react';
// Removida a importação de Html, que causava o erro R3F
import { CountryContent, TabName } from '@/app/types/globe';
import TabButton from './TabButton'; 

// --- Tipos Auxiliares ---
type CountryTabName = 'language' | 'currency';
type PopupProps = {
    name: string;
    onClose: () => void;
    content: CountryContent;
};

// --- Componente de Conteúdo Simples ---
interface SimpleContentDisplayProps {
    title: string;
    icon: string;
    body: string;
}

const SimpleContentDisplay: FC<SimpleContentDisplayProps> = ({ title, icon, body }) => (
    <div className="p-6 bg-gray-700/50 rounded-lg shadow-inner max-h-[65vh] overflow-y-auto">
        <h3 className="text-xl font-bold text-cyan-400 mb-3 flex items-center">
            <span className="mr-2 text-2xl">{icon}</span> {title}
        </h3>
        <p className="text-base text-gray-200 whitespace-pre-wrap leading-relaxed">
            {body}
        </p>
    </div>
);


// --- Componente Popup Principal para PAÍS ---
const CountryPopup: FC<PopupProps> = ({ name, onClose, content }) => {
    // Estado para a aba ativa: 'language' é o padrão inicial, se disponível
    const [activeCountryTab, setActiveCountryTab] = useState<CountryTabName>('language');

    // Mapeamento das abas específicas do país
    const countryTabs: { key: CountryTabName, label: string, icon: string }[] = [
        { key: 'language', label: 'Língua Nativa', icon: '🗣️' },
        { key: 'currency', label: 'Moeda', icon: '💰' },
    ];

    // Conteúdo dinâmico com base na aba ativa
    const currentContentProps: SimpleContentDisplayProps = React.useMemo(() => {
        if (activeCountryTab === 'language') {
            return {
                title: 'Língua Nativa',
                icon: '🗣️',
                body: content.nativeLanguage,
            };
        }
        if (activeCountryTab === 'currency') {
            return {
                title: 'Moeda Oficial',
                icon: '💰',
                body: content.currency,
            };
        }
        // Fallback robusto
        return { title: 'Erro', icon: '⚠️', body: 'Conteúdo indisponível.' };
    }, [activeCountryTab, content.nativeLanguage, content.currency]);


    // Substituindo <Html fullscreen> por um Fragmento para renderização no DOM
    return (
        <>
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 sm:p-8 z-50 overflow-y-auto">
                
                {/* Card do Popup (Wider on mobile for a better experience) */}
                <div className="w-full max-w-lg sm:max-w-xl bg-gray-800 rounded-xl shadow-2xl border border-cyan-700 animate-in fade-in zoom-in duration-300 my-auto">

                    {/* Cabeçalho */}
                    <div className="p-4 bg-gray-900 rounded-t-xl border-b border-cyan-700">
                        <h2 className="text-2xl font-extrabold text-cyan-400">{name} 🌍</h2>
                        <p className="text-base text-gray-400 mt-1">Informações Essenciais do País</p>
                    </div>

                    {/* Abas de Navegação (Botoes de seleção) */}
                    <div className="flex justify-around p-2 border-b border-gray-700">
                        {countryTabs.map(tab => (
                            <TabButton
                                key={tab.key}
                                // Casting necessário para o TabButton que aceita string
                                tabKey={tab.key as TabName} 
                                label={tab.label}
                                activeTab={activeCountryTab as TabName}
                                onClick={(key) => setActiveCountryTab(key as CountryTabName)}
                                
                                // Estilização Tailwind customizada
                                className="bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border-cyan-600 focus:ring-cyan-500"
                                activeClassName="bg-cyan-600 border-cyan-400 text-white shadow-lg"
                            />
                        ))}
                    </div>

                    {/* Container do Conteúdo */}
                    <div className="p-4 sm:p-6">
                        <SimpleContentDisplay {...currentContentProps} />
                    </div>

                    {/* Rodapé com Botão Fechar */}
                    <div className="p-4 flex justify-end border-t border-gray-700 bg-gray-900 rounded-b-xl">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                        >
                            Fechar
                        </button>
                    </div>

                </div>
            </div>
        </>
    );
};

export default React.memo(CountryPopup);
