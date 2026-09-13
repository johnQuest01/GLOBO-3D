'use client';

import React, { ChangeEvent, useCallback, useEffect, useState } from 'react';

import { CidadeLinha, Lugar, ondeFica } from '@/lib/geo/lugar';

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
 *
 * E A LISTA SABE ONDE CADA LUGAR FICA. Os três arquivos trazem `lat` e `lon`
 * em cada linha, e este componente passou a devolver essa coordenada pelo
 * `onLugar` em vez de ficar só com o rótulo. Quem recebe grava o ponto junto
 * com os nomes — e ninguém mais precisa reconstruir a coordenada a partir do
 * texto depois, que era de onde vinham os erros de lugar (ver lib/geo/lugar.ts).
 */

interface Props {
  country: string;
  state: string;
  city: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  errors: { [key: string]: string };
  className?: string;
  /**
   * Onde o lugar escrito fica — ou nulo, enquanto nada do que está escrito
   * existe nas listas. Dispara a cada mudança dos campos.
   */
  onLugar?: (lugar: Lugar | null) => void;
}

interface PaisJson {
  name: string;
  key: string;
  lat: number;
  lon: number;
}
interface EstadoJson {
  name: string;
  lat: number;
  lon: number;
}

const ordenar = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

const LocationFields: React.FC<Props> = ({
  country,
  state,
  city,
  onChange,
  errors,
  onLugar,
}) => {
  const [paises, setPaises] = useState<PaisJson[]>([]);
  const [estados, setEstados] = useState<EstadoJson[]>([]);
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
        /*
         * O nome do estado se repete dentro do mesmo país — a Rússia tem dois
         * "Moscovo", a cidade e a região em volta. Ficamos com a primeira
         * ocorrência de cada nome, e não com um `Set` de textos, porque agora o
         * que importa é levar a COORDENADA junto: um conjunto de nomes a
         * descartaria, e voltaríamos a ter que adivinhar depois.
         */
        const porNome = new Map<string, EstadoJson>();
        for (const e of dados) if (!porNome.has(e.name)) porNome.set(e.name, e);
        setEstados([...porNome.values()].sort((a, b) => ordenar(a.name, b.name)));
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

  /*
   * AS LISTAS PRECISAM ESTAR CARREGADAS PARA A COORDENADA SAIR, e nem sempre a
   * pessoa passa pelos campos na ordem que carrega cada arquivo: um formulário
   * já preenchido (voltar para editar, autocompletar do navegador) traz cidade
   * escrita sem que o campo de cidade tenha recebido foco algum. Sem isto, o
   * lugar resolveria pelo estado — a aproximação pior — só porque o arquivo das
   * cidades ainda não tinha sido buscado.
   */
  useEffect(() => {
    if (country.trim()) carregarPaises();
    if (city.trim()) carregarCidades();
  }, [country, city, carregarPaises, carregarCidades]);

  /*
   * Avisa onde fica o que está escrito, a cada mudança.
   *
   * Quem recebe grava essa coordenada junto com os nomes. É o ponto do
   * conserto: a coordenada nasce aqui, onde a escolha acontece e o dado está na
   * mão, e não é reconstruída depois a partir do rótulo.
   */
  useEffect(() => {
    if (!onLugar) return;
    onLugar(ondeFica({ country, state, city }, { paises, estados, cidades }));
  }, [country, state, city, paises, estados, cidades, onLugar]);

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
          {estados.map((e) => (
            <option key={e.name} value={e.name} />
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
