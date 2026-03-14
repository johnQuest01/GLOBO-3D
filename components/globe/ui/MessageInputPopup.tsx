'use client';

import React, { FC, useState, FormEvent, useEffect, useRef } from 'react';
import { PaperAirplaneIcon } from '@/app/icons/PaperAirplaneIcon';

interface MessageInputPopupProps {
  isOpen: boolean;
  onClose: () => void;
  // Atualizado para aceitar destino opcional
  onSend: (text: string, destination: string) => void;
}

const MessageInputPopup: FC<MessageInputPopupProps> = ({ isOpen, onClose, onSend }) => {
  const [message, setMessage] = useState('');
  const [destination, setDestination] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      // Envia mensagem E o destino
      onSend(message.trim(), destination.trim());
      setMessage('');
      setDestination('');
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center p-4 z-[120]">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative z-20 w-full max-w-sm">
        <form
          onSubmit={handleSubmit}
          className="bg-gray-900/95 border border-pink-500/50 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 animate-in zoom-in-95 duration-200"
        >
          <div className="flex justify-between items-center px-1">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              Enviar Mensagem <span className="text-xl">💬</span>
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
         
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva sua mensagem..."
            maxLength={140}
            className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none h-24 text-base leading-relaxed scrollbar-thin scrollbar-thumb-gray-600"
          />

          {/* NOVO: Campo de Destino */}
          <div>
            <label className="text-xs text-gray-400 font-semibold ml-1 mb-1 block">
                Destino (Opcional):
            </label>
            <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Ex: Brasil, China, Paris..."
                className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-pink-500 text-sm border border-gray-700"
            />
          </div>
         
          <div className="flex justify-between items-center px-1 pt-2">
            <span className={`text-xs ${message.length > 130 ? 'text-red-400' : 'text-gray-500'}`}>
              {message.length}/140
            </span>
            <button
              type="submit"
              disabled={!message.trim()}
              className="bg-pink-600 hover:bg-pink-700 text-white px-5 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-pink-500/20 active:scale-95"
            >
              <span>Enviar</span>
              <PaperAirplaneIcon className="w-4 h-4 transform -rotate-45 mt-1" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MessageInputPopup;