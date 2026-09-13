"use client";

import React, { FC, FormEvent, useEffect, useRef, useState } from "react";

/**
 * Soltar uma mensagem no globo.
 *
 * O QUE ISTO É, DITO SEM RODEIO: um gesto. A frase nasce na frente da câmera,
 * atravessa o planeta até o destino e some. Não é guardada, não chega a ninguém
 * e ninguém mais a vê.
 *
 * A TELA PRECISAVA DIZER ISSO. Ela se chamava "Enviar Mensagem", tinha um campo
 * chamado "Destino" e um botão "Enviar" com um avião de papel — três promessas
 * de entrega, num recurso que não entrega nada. Quem escrevia "Brasil" ali e
 * apertava enviar tinha todo o direito de achar que alguém no Brasil ia ler.
 *
 * Para CONVERSAR de verdade existem as conversas; para FALAR COM A REGIÃO
 * existem as notícias; para publicar existe a linha do tempo. Este aqui é o
 * único que é só bonito — e agora ele admite isso, o que é o mínimo para não
 * enganar quem chega.
 */

interface MessageInputPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (text: string, destination: string) => void;
}

const MAX = 140;

const MessageInputPopup: FC<MessageInputPopupProps> = ({
  isOpen,
  onClose,
  onSend,
}) => {
  const [message, setMessage] = useState("");
  const [destination, setDestination] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Esc fecha — era a primeira coisa que se tentava, e não acontecia nada.
  useEffect(() => {
    if (!isOpen) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const soltar = (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onSend(message.trim(), destination.trim());
    setMessage("");
    setDestination("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[170] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/65 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      <form
        onSubmit={soltar}
        role="dialog"
        aria-modal="true"
        aria-label="Soltar uma mensagem no globo"
        className="relative w-full rounded-t-[28px] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]
                   shadow-2xl ring-1 ring-white/15 sm:w-[min(94vw,26rem)] sm:rounded-[28px]"
        style={{
          background:
            "linear-gradient(160deg, rgb(28 18 38 / 0.98), rgb(12 10 20 / 0.98))",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-white">
              Soltar uma mensagem no globo
            </h2>
            {/*
              A FRASE QUE FALTAVA. Sem ela, o campo "Destino" e o botão "Enviar"
              prometiam uma entrega que nunca existiu.
            */}
            <p className="mt-0.5 text-[11px] leading-snug text-white/45">
              Ela atravessa o planeta e some. Ninguém recebe — para falar com
              alguém, use as conversas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-full p-1.5 text-white/45 hover:bg-white/10 hover:text-white"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) soltar(e);
          }}
          placeholder="Escreva alguma coisa…"
          rows={3}
          className="mt-4 w-full resize-none rounded-2xl bg-white/[0.07] px-3.5 py-3 text-[15px]
                     leading-relaxed text-white placeholder-white/30 outline-none
                     ring-1 ring-white/10 focus:ring-fuchsia-400/40"
        />

        <label className="mt-3 block text-[11px] font-medium text-white/50">
          Para onde ela voa
        </label>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Brasil, Tóquio, Paris… (ou deixe em branco)"
          className="mt-1.5 w-full rounded-xl bg-white/[0.07] px-3 py-2 text-[13px] text-white
                     placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-fuchsia-400/40"
        />

        <div className="mt-4 flex items-center gap-3">
          <span
            className={`text-[11px] ${
              message.length > MAX - 15 ? "text-fuchsia-300" : "text-white/30"
            }`}
          >
            {message.length}/{MAX}
          </span>
          <button
            type="submit"
            disabled={!message.trim()}
            className="ml-auto flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2.5
                       text-[13px] font-semibold text-white transition-transform
                       hover:bg-fuchsia-500 active:scale-95
                       disabled:bg-white/10 disabled:text-white/30 disabled:active:scale-100"
          >
            Soltar
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default MessageInputPopup;
