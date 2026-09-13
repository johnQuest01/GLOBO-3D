'use client';

import React, { FC, useEffect, useRef, useState } from 'react';

import GradeDoPerfil from './GradeDoPerfil';

import { subirMidia } from '@/lib/chat/midiaRemota';
import { prepararImagem } from '@/lib/chat/midia';

/**
 * Meu perfil — o que eu mostro, e para quem.
 *
 * A VISIBILIDADE FICA NO TOPO, antes dos campos. É deliberado: a pergunta
 * "quem vai ver isto?" precisa ser respondida ANTES de a pessoa escrever sobre
 * si, e não depois de já ter escrito. Um seletor escondido no rodapé faria
 * muita gente publicar sem saber que publicou.
 *
 * A FOTO VAI PARA O ARMAZENAMENTO, não para o banco. É o mesmo caminho da
 * mídia das conversas: encolhida no navegador, enviada direto ao R2, e o que
 * fica guardado é um endereço. Uma foto de perfil de 4 MB dentro da tabela de
 * contas seria o mesmo erro que já corrigimos no chat.
 */

type Visibilidade = 'publico' | 'reservado' | 'privado';

interface Perfil {
  nickname: string | null;
  fullName: string | null;
  descricao: string | null;
  nascimento: string | null;
  avatarUrl: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  visibilidade: Visibilidade;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
}

const DESCRICAO_MAX = 300;

const OPCOES: { valor: Visibilidade; titulo: string; explica: string }[] = [
  {
    valor: 'publico',
    titulo: 'Público',
    explica: 'Foto, nome, idade, descrição e cidade. Quem te encontrar vê tudo isso.',
  },
  {
    valor: 'reservado',
    titulo: 'Reservado',
    explica: 'Só a foto e o nickname. O resto fica para quem você decidir contar.',
  },
  {
    valor: 'privado',
    titulo: 'Privado',
    explica: 'Só o nickname, sem foto. Você também sai da busca e das recomendações.',
  },
];

/** "2026-09-13" → {dia, mes, ano} e de volta. O banco guarda a data inteira. */
const partes = (iso: string | null) => {
  if (!iso) return { dia: '', mes: '', ano: '' };
  const [ano, mes, dia] = iso.split('-');
  return { dia: dia ?? '', mes: mes ?? '', ano: ano ?? '' };
};

const PerfilPanel: FC<Props> = ({ aberto, onFechar }) => {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [ano, setAno] = useState('');
  const [visibilidade, setVisibilidade] = useState<Visibilidade>('reservado');
  const [avatar, setAvatar] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch('/api/users/perfil');
        if (!r.ok) return;
        const d = (await r.json()) as { perfil?: Perfil };
        if (!vivo || !d.perfil) return;
        setPerfil(d.perfil);
        setNome(d.perfil.fullName ?? '');
        setDescricao(d.perfil.descricao ?? '');
        setVisibilidade(d.perfil.visibilidade);
        setAvatar(d.perfil.avatarUrl);
        const p = partes(d.perfil.nascimento);
        setDia(p.dia);
        setMes(p.mes);
        setAno(p.ano);
      } catch {
        /* sem resposta: a tela mostra o que tem */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [aberto]);

  if (!aberto) return null;

  const escolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;

    setErro(null);
    setRecado('Preparando a foto…');
    try {
      // O mesmo encolhimento das fotos do chat: 1280px e JPEG. Uma foto de
      // perfil não precisa de mais, e o que sobra é só peso.
      const pronta = await prepararImagem(arquivo);
      if (!pronta) {
        setErro('Não consegui preparar essa imagem.');
        return;
      }
      const subida = await subirMidia(pronta.blob, pronta.mime);
      if (!subida) {
        setErro('Não consegui enviar a foto agora.');
        return;
      }
      const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '';
      setAvatar(base ? `${base.replace(/\/+$/, '')}/${subida.chave}` : null);
      setRecado('Foto pronta. Toque em salvar.');
    } finally {
      if (!avatar) setRecado(null);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    setRecado(null);

    // Os três campos separados viram uma data só. Vazios = apagar.
    const nascimento =
      dia && mes && ano
        ? `${ano.padStart(4, '0')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
        : '';

    try {
      const r = await fetch('/api/users/perfil', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: nome,
          descricao,
          nascimento,
          visibilidade,
          ...(avatar ? { avatarUrl: avatar } : {}),
        }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        perfil?: Perfil;
        errors?: Record<string, string>;
      };

      if (!r.ok) {
        setErro(Object.values(d.errors ?? {})[0] ?? 'Não consegui salvar. Tente de novo.');
        return;
      }
      if (d.perfil) setPerfil(d.perfil);
      setRecado('Salvo.');
    } catch {
      setErro('Sem conexão agora.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[168] flex items-start justify-center pt-[6vh]">
      <div
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
        onClick={onFechar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Meu perfil"
        className="relative flex max-h-[88vh] w-[min(94vw,28rem)] flex-col overflow-hidden
                   rounded-3xl bg-white/[0.08] shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="flex-1 text-[15px] font-semibold text-white">Meu perfil</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {/* --- Quem vê --- */}
          <section>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/40">
              Quem pode ver seu perfil
            </p>
            <div className="space-y-1.5">
              {OPCOES.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => setVisibilidade(o.valor)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    visibilidade === o.valor
                      ? 'bg-cyan-500/15 ring-1 ring-cyan-400/40'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span
                    className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ${
                      visibilidade === o.valor
                        ? 'bg-cyan-400 ring-cyan-300/50'
                        : 'bg-transparent ring-white/25'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white">{o.titulo}</span>
                    <span className="block text-[11px] leading-snug text-white/45">
                      {o.explica}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* --- Foto --- */}
          <section className="flex items-center gap-4">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-400/80 to-blue-600/80 text-2xl font-semibold text-white">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="Sua foto" className="h-full w-full object-cover" />
              ) : (
                (perfil?.nickname ?? '?').charAt(0).toUpperCase()
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-white">
                @{perfil?.nickname ?? '…'}
              </p>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => fotoRef.current?.click()}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/20"
                >
                  {avatar ? 'Trocar foto' : 'Pôr foto'}
                </button>
                {avatar && (
                  <button
                    type="button"
                    onClick={() => setAvatar(null)}
                    className="rounded-lg px-2 py-1.5 text-xs text-white/40 hover:text-red-300"
                  >
                    Remover
                  </button>
                )}
              </div>
              <input
                ref={fotoRef}
                type="file"
                accept="image/*"
                onChange={escolherFoto}
                className="hidden"
              />
            </div>
          </section>

          {/* --- Campos --- */}
          <section className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/40">
                Nome
              </span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={170}
                placeholder="Como você quer ser chamado"
                className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-[15px] text-white
                           placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-cyan-400/50"
              />
            </label>

            <label className="block">
              <span className="mb-1 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-white/40">
                Sobre você
                <span className="normal-case tracking-normal text-white/25">
                  {descricao.length}/{DESCRICAO_MAX}
                </span>
              </span>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value.slice(0, DESCRICAO_MAX))}
                rows={3}
                placeholder="Uma frase sobre você, o que gosta, o que procura…"
                className="w-full resize-none rounded-xl bg-white/10 px-3 py-2.5 text-[15px]
                           text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-cyan-400/50"
              />
              <span className="mt-1 block text-[11px] text-white/30">
                Não escreva telefone nem endereço aqui — esta frase pode ser pública.
              </span>
            </label>

            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/40">
                Nascimento
              </span>
              <div className="flex gap-2">
                {[
                  ['Dia', dia, setDia, 2, '01'],
                  ['Mês', mes, setMes, 2, '09'],
                  ['Ano', ano, setAno, 4, '1990'],
                ].map(([rotulo, valor, set, max, exemplo]) => (
                  <input
                    key={rotulo as string}
                    value={valor as string}
                    onChange={(e) =>
                      (set as (v: string) => void)(
                        e.target.value.replace(/\D/g, '').slice(0, max as number),
                      )
                    }
                    inputMode="numeric"
                    placeholder={exemplo as string}
                    aria-label={rotulo as string}
                    className={`rounded-xl bg-white/10 px-3 py-2.5 text-center text-[15px] text-white
                                placeholder-white/25 outline-none ring-1 ring-white/10 focus:ring-cyan-400/50
                                ${(max as number) === 4 ? 'w-24' : 'w-16'}`}
                  />
                ))}
              </div>
              <span className="mt-1 block text-[11px] text-white/30">
                Os outros veem só a idade — nunca o dia e o mês.
              </span>
            </div>
          </section>

          {erro && <p className="text-xs text-red-300">{erro}</p>}
          {recado && !erro && <p className="text-xs text-cyan-200/80">{recado}</p>}

          {/*
            A MINHA GRADE, no fim — depois dos campos, e nao antes.

            Esta tela e' onde se EDITA o perfil, e quem a abriu veio mexer em
            nome, foto ou privacidade. A grade aqui e' para conferir o que ja'
            esta' publicado, inclusive o que a comunidade escondeu: sem isso
            uma publicacao minha pode sumir sem que eu saiba, e eu sigo
            publicando para um lugar que ninguem mais enxerga.
          */}
          <GradeDoPerfil nickname={null} />
        </div>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="w-full rounded-xl bg-cyan-600 py-3 font-semibold text-white
                       hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PerfilPanel;
