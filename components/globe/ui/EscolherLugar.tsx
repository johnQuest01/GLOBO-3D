'use client';

import React, { ChangeEvent, FC, useState } from 'react';

import LocationFields from '@/components/login/LocationFields';

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

    setEnviando(true);
    try {
      const r = await fetch('/api/users/local', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(campos),
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
          />
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={enviando || !campos.country.trim()}
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
