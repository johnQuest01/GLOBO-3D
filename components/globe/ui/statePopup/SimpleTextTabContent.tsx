// components/globe/ui/statePopup/SimpleTextTabContent.tsx
import React, { FC } from 'react';

interface SimpleTextTabContentProps {
    title: string;
    text: string | undefined; // Permite texto indefinido
}

const SimpleTextTabContent: FC<SimpleTextTabContentProps> = ({ title, text }) => (
    <div className="p-6 text-gray-300">
        <h3 className="text-xl font-bold text-white mb-4 capitalize">{title}</h3>
        {text ? (
             <div className="prose prose-invert prose-sm sm:prose-base max-w-none">
                {text.split('\n').filter(p => p.trim()).map((paragraph, index) => ( <p key={index}>{paragraph}</p> ))}
            </div>
        ) : (
            <p className="text-gray-500 italic">Conteúdo não disponível.</p>
        )}
    </div>
);

export default SimpleTextTabContent;