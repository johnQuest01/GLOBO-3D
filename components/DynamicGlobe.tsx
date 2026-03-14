// components/globe/DynamicGlobe.tsx
'use client';

import dynamic from 'next/dynamic';
import React from 'react';


// CORREÇÃO ESSENCIAL: Usamos dynamic() para isolar o componente principal 
// do R3F e forçamos o carregamento APENAS no cliente (ssr: false).
const GlobeCanvas = dynamic(() => import('@/components/globe/canvas/GlobeCanvas'), {
    ssr: false,
    
    // Componente de fallback exibido durante o carregamento
    loading: () => (
        <div className="relative w-full h-screen bg-black flex items-center justify-center">
            <div className='p-6 bg-gray-900/90 rounded-xl shadow-2xl'>
                <p className="text-white text-lg font-semibold animate-pulse">
                    Carregando o Globo 3D...
                </p>
            </div>
        </div>
    ),
});


/**
 * Componente Wrapper para renderizar o GlobeCanvas carregado dinamicamente.
 */
export default function DynamicGlobe() {
    return <GlobeCanvas />;
}
