// components/globe/ui/statePopup/InfoTabContent.tsx
'use client';
import React, { FC } from 'react';

interface InfoTabContentProps {
  title: string;
  text: string | null | undefined;
}

const InfoTabContent: FC<InfoTabContentProps> = ({ title, text }) => {
  // Divide o texto em parágrafos com base em novas linhas
  const paragraphs = text
    ? text.split('\n').filter((p) => p.trim().length > 0)
    : [];

  return (
    <div className="p-6 bg-white">
      <h3 className="text-2xl font-bold text-gray-900 mb-4">{title}</h3>
      {paragraphs.length > 0 ? (
        <div className="prose prose-sm sm:prose-base max-w-none text-gray-800 space-y-4">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : (
        <p className="text-gray-600 italic">
          Nenhuma informação sobre {title.toLowerCase()} disponível.
        </p>
      )}
    </div>
  );
};

export default InfoTabContent;