'use client';

import React, { ChangeEvent, FC, useState } from 'react';

import LocationFields from '@/components/login/LocationFields';
import type { Lugar } from '@/lib/geo/lugar';

/**
 * "Onde você está no globo?" — para quem entrou pelo Google.
 *
 * O botão do Google não pergunta nada, e é essa a graça dele. O preço aparece
 * depois: a conta chega sem país, estado nem cidade, e num globo isso não é um
 * campo vazio de cadastro — é não existir no mapa. A pessoa não aparece, não
 * acende sinal, e o servidor recusa qualquer coisa que dependa de presença.
 *
 * Antes desta tela, o que ela via ao tocar no sinal era `beacon:raise antes de
 * presence:join` — uma frase de dentro do protocolo, escrita para quem escreveu
 * o protocolo, dita a quem só queria aparecer no mapa.
 *
 * OS MESMOS CAMPOS DO CADASTRO, importados e não recopiados: são 177 países,
 * 4.545 estados e 7.390 cidades com carga sob demanda, e manter duas versões
 * disso faria as duas divergirem na primeira alteração.
 *
 * RECARREGA DEPOIS DE SALVAR, pelo mesmo motivo da tela de nickname: a
 * coordenada alimenta a presença, o globo e o sinal ao mesmo tempo, e recarregar
 * é a forma de todos passarem a usar o lugar novo juntos.
 */

interface Props {
  aberto: boolean;
  onFechar: () => void;
}

const EscolherLugar: FC<Props> = ({ aberto, onFechar }) => {
  const [campos, setCampos] = useState({ country: '', state: '', city: '' });
  const [lugar, setLugar] = useState<Lugar | null>(null);
  const [erros, setErros] = useState<{ [key: string]: string }>({});
  const [enviando, setEnviando] = useState(false);

  if (!aberto) return null;

  const mudar = (e: ChangeEvent<HTMLInputElement>) => {
    setCampos((atual) => ({ ...atual, [e.target.name]: e.target.value }));
    setErros({});
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;

    if (!campos.country.trim()) {
      setErros({ country: 'Diga ao menos o país.' });
      return;
    }

    /*
     * SÓ SALVA O QUE TEM PONTO NO GLOBO — e isto é o conserto de um laço.
     *
     * Salvar um nome que o globo não sabia situar não dava erro nenhum: a tela
     * recarregava, o aplicativo continuava achando que a pessoa não tinha
     * lugar, e o pedido voltava. Para sempre. Foi relatado assim: "preencho e
     * nada acontece, continua perguntando".
     *
     * Antes a conferência era uma segunda tentativa de adivinhar a coordenada
     * pelo nome — o mesmo palpite que falhava depois, então às vezes ela
     * passava e o laço acontecia mesmo assim. Agora o que se confere é a
     * coordenada que veio junto da opção escolhida: se ela existe, o globo
     * consegue situar a pessoa, por construção.
     */
    if (!lugar) {
      setErros({
        country:
          'Não encontrei esse lugar no globo. Escolha pela lista que aparece ao digitar.',
      });
      return;
    }

    setEnviando(true);
    try {
      const r = await fetch('/api/users/local', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...campos, lat: lugar.lat, lon: lugar.lon }),
      });
      const dados = await r.json().catch(() => ({}));

      if (!r.ok) {
        setErros(dados?.errors ?? { country: 'Não foi possível salvar. Tente de novo.' });
        return;
      }

      try {
        const perfil = JSON.parse(localStorage.getItem('userData') ?? '{}');
        perfil.country = dados.country;
        perfil.state = dados.state ?? '';
        perfil.city = dados.city ?? '';
        perfil.lat = dados.lat ?? lugar.lat;
        perfil.lon = dados.lon ?? lugar.lon;
        localStorage.setItem('userData', JSON.stringify(perfil));
      } catch {
        /* o servidor é a fonte da verdade; isto é só o espelho */
      }
      window.location.reload();
    } catch {
      setErros({ country: 'Sem conexão agora. Tente de novo.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-md" aria-hidden="true" />

      <form
        onSubmit={enviar}
        className="relative max-h-[90dvh] w-[min(92vw,26rem)] overflow-y-auto rounded-3xl
                   bg-white/[0.08] p-5 shadow-2xl ring-1 ring-white/15 backdrop-blur-xl"
      >
        <h2 className="text-lg font-semibold text-white">Onde você está?</h2>
        <p className="mt-1 text-sm text-white/55">
          Você entrou com o Google, então não passou pelo cadastro — e é de lá que
          vem o seu lugar no globo. Sem ele você não aparece no mapa e não
          consegue acender o seu sinal.
        </p>

        <div className="mt-4">
          <LocationFields
            country={campos.country}
            state={campos.state}
            city={campos.city}
            onChange={mudar}
            errors={erros}
            onLugar={setLugar}
          />
        </div>

        {/*
          MOSTRAR ONDE VAI CAIR, antes de salvar. A queixa original não foi "o
          lugar ficou errado" — foi "preencho e nada acontece": a tela não dava
          sinal nenhum de ter entendido o que foi escrito. Esta linha é esse
          sinal, e também mostra o quanto o globo consegue aproximar.
        */}
        {lugar && (
          <p className="mt-3 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200/80">
            No globo você vai aparecer em <strong>{lugar.rotulo}</strong>
            {lugar.precisao === 'pais'
              ? ' — preencha estado e cidade para aparecer mais perto de casa.'
              : lugar.precisao === 'estado'
                ? ' — preencha a cidade para aparecer mais perto de casa.'
                : '.'}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={enviando || !lugar}
            className="flex-1 rounded-xl bg-cyan-600 py-2.5 font-semibold text-white
                       hover:bg-cyan-500 disabled:bg-white/10 disabled:text-white/30"
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

export default EscolherLugar;
