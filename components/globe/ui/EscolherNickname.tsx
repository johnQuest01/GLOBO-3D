'use client';

import React, { FC, useState } from 'react';

import { NICKNAME_MAX, validateNickname } from '@/lib/auth/nickname';

/**
 * "Escolha seu nome público" — para as contas criadas antes do nickname.
 *
 * Sem nickname, a conta ficava num limbo silencioso: conseguia mandar
 * mensagem, mas o outro lado via a conversa como "?" e não tinha como
 * responder; e ninguém a encontrava na busca. Em vez de bloquear essas contas
 * (elas são as primeiras pessoas do projeto), a tela pede o que falta, uma vez.
 *
 * DEPOIS DE ESCOLHER, A PÁGINA RECARREGA. Parece grosseiro, e é deliberado: o
 * crachá do socket é emitido no aperto de mão com o nickname dentro, o
 * histórico e a presença dependem dele, e recarregar é a única forma de
 * garantir que tudo passe a usar o nome novo ao mesmo tempo — em vez de
 * metade da tela saber e a outra metade não.
 */

interface Props {
  aberto: boolean;
  onFechar: () => void;
}

const EscolherNickname: FC<Props> = ({ aberto, onFechar }) => {
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!aberto) return null;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;

    const local = validateNickname(valor);
    if (local) {
      setErro(local);
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch('/api/users/nickname', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname: valor }),
      });
      const dados = await r.json().catch(() => ({}));

      if (!r.ok) {
        setErro(dados?.errors?.nickname ?? 'Não foi possível salvar. Tente de novo.');
        return;
      }

      // Guarda no perfil local para a interface não precisar perguntar ao
      // servidor de novo, e recarrega (ver o comentário no topo).
      try {
        const perfil = JSON.parse(localStorage.getItem('userData') ?? '{}');
        perfil.nickname = dados.nickname;
        localStorage.setItem('userData', JSON.stringify(perfil));
      } catch {
        /* perder isto não impede nada: o servidor é a fonte da verdade */
      }
      window.location.reload();
    } catch {
      setErro('Sem conexão agora. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" aria-hidden="true" />

      <form
        onSubmit={enviar}
        className="relative w-[min(92vw,26rem)] rounded-3xl bg-white/[0.08] p-5 shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
      >
        <h2 className="text-lg font-semibold text-white">Escolha seu nickname</h2>
        <p className="mt-1 text-sm text-white/55">
          Sua conta é de antes desta parte existir. O nickname é o nome pelo qual
          as pessoas te acham e te respondem — sem ele, quem recebe sua mensagem
          não consegue responder.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 focus-within:ring-cyan-400/50">
          <span className="text-white/40">@</span>
          <input
            value={valor}
            onChange={(e) => {
              setValor(
                e.target.value
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[̀-ͯ]/g, '')
                  .replace(/[^a-z0-9_]/g, '')
                  .slice(0, NICKNAME_MAX),
              );
              setErro(null);
            }}
            placeholder="seu_nome"
            autoFocus
            autoCapitalize="none"
            spellCheck={false}
            maxLength={NICKNAME_MAX}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder-white/30 outline-none"
          />
        </div>

        {erro && <p className="mt-2 text-xs text-red-300">{erro}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={enviando || !valor}
            className="flex-1 rounded-xl bg-cyan-600 py-2.5 font-semibold text-white hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30"
          >
            {enviando ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-xl bg-white/10 px-4 py-2.5 text-white/70 hover:bg-white/20"
          >
            Agora não
          </button>
        </div>
      </form>
    </div>
  );
};

export default EscolherNickname;
