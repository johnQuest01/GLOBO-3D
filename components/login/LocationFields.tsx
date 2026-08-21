'use client';

import React, { ChangeEvent, useCallback, useEffect, useState } from 'react';

/**
 * País, estado e cidade no cadastro — usando os dados que o globo já carrega.
 *
 * O projeto tem 177 países, 4.545 estados fatiados por país e 7.390 cidades
 * indexadas. Pedir esses três campos como texto livre, tendo tudo isso ali,
 * produziria "Sao Paulo", "são paulo", "SP" e "Sao paulo " como quatro lugares
 * diferentes no banco.
 *
 * CARGA SOB DEMANDA, e nesta ordem: a lista de países (33 KB) só chega quando
 * o campo recebe foco; os estados só depois do país escolhido (é um arquivo por
 * país); e o índice de cidades (462 KB) só quando a pessoa chega no campo de
 * cidade. Quem entra para fazer login não baixa nada disso.
 *
 * A LISTA NÃO PRENDE. São `<datalist>`, então o campo continua aceitando texto
 * digitado: quem mora num lugar que não está na lista consegue se cadastrar
 * assim mesmo. A lista é ajuda, não cadeado.
 */

interface Props {
  country: string;
  state: string;
  city: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  errors: { [key: string]: string };
  className?: string;
}

interface PaisJson {
  name: string;
  key: string;
}
interface EstadoJson {
  name: string;
}
/** [chave, nome, lat, lon, regiao, pais] — ver city-search.json. */
type CidadeLinha = [string, string, number, number, string, string];

const ordenar = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

const LocationFields: React.FC<Props> = ({
  country,
  state,
  city,
  onChange,
  errors,
}) => {
  const [paises, setPaises] = useState<PaisJson[]>([]);
  const [estados, setEstados] = useState<string[]>([]);
  const [cidades, setCidades] = useState<CidadeLinha[]>([]);
  const [carregandoCidades, setCarregandoCidades] = useState(false);

  const carregarPaises = useCallback(() => {
    if (paises.length > 0) return;
    fetch('/data/country-labels.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((dados: PaisJson[]) => setPaises(dados))
      .catch(() => setPaises([]));
  }, [paises.length]);

  /**
   * O arquivo de estados é indexado pela CHAVE do país ("Brazil"), enquanto o
   * campo mostra o nome traduzido ("Brasil"). Sem essa tradução de volta, a
   * busca do arquivo erraria em todo país cujo nome em português difere.
   */
  useEffect(() => {
    const escolhido = paises.find(
      (p) => p.name.toLowerCase() === country.trim().toLowerCase(),
    );
    if (!escolhido) {
      setEstados([]);
      return;
    }

    let cancelado = false;
    fetch(`/data/state-labels-tiled/${encodeURIComponent(escolhido.key)}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((dados: EstadoJson[]) => {
        if (cancelado) return;
        const nomes = [...new Set(dados.map((e) => e.name))].sort(ordenar);
        setEstados(nomes);
      })
      .catch(() => {
        if (!cancelado) setEstados([]);
      });

    return () => {
      cancelado = true;
    };
  }, [country, paises]);

  const carregarCidades = useCallback(() => {
    if (cidades.length > 0 || carregandoCidades) return;
    setCarregandoCidades(true);
    fetch('/data/city-search.json')
      .then((r) => (r.ok ? r.json() : { cities: [] }))
      .then((dados: { cities: CidadeLinha[] }) => setCidades(dados.cities ?? []))
      .catch(() => setCidades([]))
      .finally(() => setCarregandoCidades(false));
  }, [cidades.length, carregandoCidades]);

  /**
   * Só as cidades do estado escolhido — e, se o estado ainda estiver vazio, as
   * do país. Jogar 7.390 opções num datalist deixaria a lista inútil e o
   * navegador lento.
   */
  const cidadesSugeridas = React.useMemo(() => {
    if (cidades.length === 0) return [];
    const paisAlvo = country.trim().toLowerCase();
    const estadoAlvo = state.trim().toLowerCase();

    const filtradas = cidades.filter((c) => {
      if (paisAlvo && c[5]?.toLowerCase() !== paisAlvo) return false;
      if (estadoAlvo && c[4] && c[4].toLowerCase() !== estadoAlvo) return false;
      return true;
    });

    return [...new Set(filtradas.map((c) => c[1]))].sort(ordenar).slice(0, 400);
  }, [cidades, country, state]);

  const campo =
    'flex-1 bg-transparent text-white placeholder-gray-400 py-2 px-3 focus:outline-none text-base sm:text-lg';
  const caixa =
    'flex items-center border-b border-gray-600 focus-within:border-green-500 transition-colors';

  return (
    <>
      <div>
        <div className={caixa}>
          <IconGlobo />
          <input
            type="text"
            name="country"
            list="lista-paises"
            placeholder="País (ex: Brasil)"
            value={country}
            onChange={onChange}
            onFocus={carregarPaises}
            autoComplete="country-name"
            className={campo}
            maxLength={120}
          />
        </div>
        <datalist id="lista-paises">
          {paises.map((p) => (
            <option key={p.key} value={p.name} />
          ))}
        </datalist>
        {errors.country && (
          <p className="text-red-400 text-sm mt-1">{errors.country}</p>
        )}
      </div>

      <div>
        <div className={caixa}>
          <IconMapa />
          <input
            type="text"
            name="state"
            list="lista-estados"
            placeholder={
              estados.length > 0
                ? 'Estado (escolha ou digite)'
                : 'Estado (ex: Minas Gerais)'
            }
            value={state}
            onChange={onChange}
            onFocus={carregarPaises}
            autoComplete="address-level1"
            className={campo}
            maxLength={120}
          />
        </div>
        <datalist id="lista-estados">
          {estados.map((nome) => (
            <option key={nome} value={nome} />
          ))}
        </datalist>
        {errors.state && (
          <p className="text-red-400 text-sm mt-1">{errors.state}</p>
        )}
      </div>

      <div>
        <div className={caixa}>
          <IconCasa />
          <input
            type="text"
            name="city"
            list="lista-cidades"
            placeholder={
              carregandoCidades ? 'Carregando cidades...' : 'Cidade onde mora'
            }
            value={city}
            onChange={onChange}
            onFocus={carregarCidades}
            autoComplete="address-level2"
            className={campo}
            maxLength={170}
          />
        </div>
        <datalist id="lista-cidades">
          {cidadesSugeridas.map((nome) => (
            <option key={nome} value={nome} />
          ))}
        </datalist>
        {errors.city && (
          <p className="text-red-400 text-sm mt-1">{errors.city}</p>
        )}
      </div>
    </>
  );
};

const svgProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  viewBox: '0 0 24 24',
  strokeWidth: 2,
  stroke: 'currentColor',
  className: 'w-6 h-6 text-gray-400',
} as const;

const IconGlobo = () => (
  <svg {...svgProps}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.5-2.6 2.5-15.4 0-18m0 18c-2.5-2.6-2.5-15.4 0-18M3 12h18"
    />
  </svg>
);

const IconMapa = () => (
  <svg {...svgProps}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 6.75L3.75 4.5v12.75L9 19.5m0-12.75V19.5m0-12.75l6-2.25m-6 15l6-2.25m0 0l5.25 2.25V6.75L15 4.5m0 12.75V4.5"
    />
  </svg>
);

const IconCasa = () => (
  <svg {...svgProps}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
    />
  </svg>
);

export default LocationFields;
