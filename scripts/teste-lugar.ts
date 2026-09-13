/**
 * O lugar escolhido vira o ponto certo no globo?
 *
 * IMPORTA `lib/geo/lugar.ts` DE VERDADE, e essa é a parte que importa: a
 * primeira versão deste arquivo reimplementava a regra para poder testá-la, e
 * um teste assim passa alegremente enquanto o aplicativo erra — ele estava
 * conferindo a si mesmo.
 *
 * O caso que deu origem a tudo isto está aqui como teste: Rússia + Moscou
 * precisa cair em Moscou, e não na Sibéria — e precisa cair lá MESMO com um
 * estado errado preenchido, que foi exatamente o que aconteceu.
 */
import { readFileSync } from 'node:fs';

import {
  CidadeLinha,
  LinhaComCoordenada,
  Lugar,
  coordenadaValida,
  ondeFica,
} from '../lib/geo/lugar';

const ler = (p: string) => JSON.parse(readFileSync(`public/data/${p}`, 'utf8'));

const paises: LinhaComCoordenada[] = ler('country-labels.json');
const cidades: CidadeLinha[] = ler('city-search.json').cities;

/** Os arquivos de estado são indexados pela CHAVE do país ("Russia"), não pelo nome. */
const rotulos: { name: string; key: string }[] = ler('country-labels.json');
const estadosDe = (pais: string): LinhaComCoordenada[] => {
  const achado = rotulos.find(
    (p) => p.name.toLowerCase() === pais.toLowerCase() || p.key.toLowerCase() === pais.toLowerCase(),
  );
  try {
    return ler(`state-labels-tiled/${achado?.key ?? pais}.json`);
  } catch {
    return [];
  }
};

/** Quilômetros — é a unidade em que o defeito foi sentido. */
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const r = (g: number) => (g * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

let passou = 0;
let falhou = 0;

const teste = (nome: string, fn: () => void) => {
  try {
    fn();
    passou++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhou++;
    console.log(`  FALHOU  ${nome}`);
    console.log(`          ${(e as Error).message}`);
  }
};

const perto = (achado: Lugar | null, alvo: { lat: number; lon: number }, tolKm: number) => {
  if (!achado) throw new Error('nao situou');
  const d = km(achado, alvo);
  if (d > tolKm) throw new Error(`caiu a ${d} km do esperado`);
};

const russia = { paises, cidades, estados: estadosDe('Rússia') };
const brasil = { paises, cidades, estados: estadosDe('Brasil') };
const eua = { paises, cidades, estados: estadosDe('Estados Unidos') };
const semEstados = { paises, cidades, estados: [] as LinhaComCoordenada[] };
const MOSCOU = { lat: 55.76, lon: 37.62 };

console.log('\n--- o caso que originou o conserto ---');

teste('Russia + Moscou cai em Moscou', () => {
  perto(ondeFica({ country: 'Rússia', city: 'Moscou' }, russia), MOSCOU, 50);
});

teste('a cidade certa ganha do estado errado (era a Siberia)', () => {
  const r = ondeFica(
    { country: 'Rússia', state: 'Krai de Zabaykalsky', city: 'Moscou' },
    russia,
  );
  perto(r, MOSCOU, 50);
  if (r!.precisao !== 'cidade') throw new Error(`resolveu por ${r!.precisao}`);
});

teste('pela ordem antiga isto daria milhares de km de erro', () => {
  const zab = russia.estados.find((e) => e.name === 'Krai de Zabaykalsky');
  if (!zab) throw new Error('o estado sumiu da lista');
  const d = km(zab, MOSCOU);
  if (d < 3000) throw new Error(`Zabaykalsky esta a so ${d} km de Moscou`);
  console.log(`      (a ordem antiga errava por ${d} km)`);
});

console.log('\n--- do mais especifico para o menos ---');

teste('so pais -> ponto do pais', () => {
  if (ondeFica({ country: 'Rússia' }, russia)?.precisao !== 'pais') {
    throw new Error('nao resolveu por pais');
  }
});

teste('pais + estado -> ponto do estado', () => {
  const r = ondeFica({ country: 'Brasil', state: 'Minas Gerais' }, brasil);
  if (r?.precisao !== 'estado') throw new Error(`resolveu por ${r?.precisao}`);
  perto(r, { lat: -18.5, lon: -44.5 }, 400);
});

teste('pais + estado + cidade -> ponto da cidade', () => {
  const r = ondeFica(
    { country: 'Brasil', state: 'Minas Gerais', city: 'Belo Horizonte' },
    brasil,
  );
  if (r?.precisao !== 'cidade') throw new Error(`resolveu por ${r?.precisao}`);
  perto(r, { lat: -19.92, lon: -43.94 }, 30);
});

console.log('\n--- homonimas ---');

teste('Odessa: o pais desempata (Ucrania x Estados Unidos)', () => {
  const ua = ondeFica({ country: 'Ucrânia', city: 'Odessa' }, semEstados);
  const us = ondeFica({ country: 'Estados Unidos', city: 'Odessa' }, semEstados);
  if (!ua || !us) throw new Error('faltou situar uma das duas');
  const d = km(ua, us);
  if (d < 1000) throw new Error(`as duas cairam a ${d} km — nao desempatou`);
  console.log(`      (${d} km entre elas)`);
});

teste('Portland: o ESTADO desempata dentro do mesmo pais', () => {
  const oregon = ondeFica(
    { country: 'Estados Unidos', state: 'Oregon', city: 'Portland' },
    eua,
  );
  const maine = ondeFica(
    { country: 'Estados Unidos', state: 'Maine', city: 'Portland' },
    eua,
  );
  perto(oregon, { lat: 45.52, lon: -122.68 }, 150);
  perto(maine, { lat: 43.66, lon: -70.26 }, 150);
  console.log(`      (${km(oregon!, maine!)} km entre elas, e cada uma no seu estado)`);
});

teste('Springfield esta em cinco estados e cada um acha o seu', () => {
  const vistos = new Set<string>();
  for (const uf of ['Massachusetts', 'Missouri', 'Illinois', 'Ohio', 'Oregon']) {
    const r = ondeFica({ country: 'Estados Unidos', state: uf, city: 'Springfield' }, eua);
    if (!r) throw new Error(`nao situou Springfield em ${uf}`);
    vistos.add(`${r.lat.toFixed(2)},${r.lon.toFixed(2)}`);
  }
  if (vistos.size < 4) {
    throw new Error(`cinco estados deram so ${vistos.size} pontos distintos`);
  }
  console.log(`      (${vistos.size} pontos distintos para cinco estados)`);
});

teste('sem estado, uma homonima ainda resolve (nao trava o cadastro)', () => {
  if (!ondeFica({ country: 'Estados Unidos', city: 'Portland' }, eua)) {
    throw new Error('recusou uma cidade que existe');
  }
});

console.log('\n--- recusa e robustez ---');

teste('lugar inventado nao resolve (o formulario recusa salvar)', () => {
  const r = ondeFica({ country: 'Narnia', state: 'Ninguendia', city: 'Lugarnenhum' }, brasil);
  if (r !== null) throw new Error(`situou o que nao existe: ${JSON.stringify(r)}`);
});

teste('cidade que nao existe cai para o pais, e nao para o nada', () => {
  const r = ondeFica({ country: 'Brasil', city: 'Cidadeinventada' }, brasil);
  if (r?.precisao !== 'pais') throw new Error(`deu ${r?.precisao ?? 'nulo'}`);
});

teste('campos vazios nao resolvem', () => {
  if (ondeFica({ country: '', state: '', city: '' }, brasil) !== null) {
    throw new Error('situou o vazio');
  }
});

teste('so espacos nao resolvem', () => {
  if (ondeFica({ country: '   ', state: '  ', city: ' ' }, brasil) !== null) {
    throw new Error('situou o espaco em branco');
  }
});

teste('espaco em volta do nome nao atrapalha', () => {
  const r = ondeFica({ country: '  Brasil ', city: ' São Paulo  ' }, brasil);
  if (r?.precisao !== 'cidade') throw new Error('o espaco quebrou a busca');
});

teste('caixa e acento nao mudam o resultado', () => {
  const a = ondeFica({ country: 'brasil', city: 'são paulo' }, brasil);
  const b = ondeFica({ country: 'BRASIL', city: 'São Paulo' }, brasil);
  if (!a || !b || a.lat !== b.lat) throw new Error('a caixa mudou o resultado');
});

teste('listas vazias nao explodem', () => {
  const r = ondeFica(
    { country: 'Brasil', state: 'São Paulo', city: 'São Paulo' },
    { paises: [], cidades: [], estados: [] },
  );
  if (r !== null) throw new Error('inventou um ponto sem listas');
});

console.log('\n--- a guarda da coordenada que chega pela rede ---');

teste('recusa NaN, texto, nulo e fora do planeta', () => {
  const ruins: [unknown, unknown][] = [
    [NaN, 0],
    [0, NaN],
    ['-23', '-46'],
    [null, null],
    [undefined, undefined],
    [91, 0],
    [-91, 0],
    [0, 181],
    [0, -181],
    [Infinity, 0],
    [{}, []],
  ];
  for (const [la, lo] of ruins) {
    if (coordenadaValida(la, lo)) throw new Error(`aceitou ${String(la)}, ${String(lo)}`);
  }
});

teste('aceita um ponto de verdade, inclusive o zero absoluto', () => {
  if (!coordenadaValida(-23.55, -46.63)) throw new Error('recusou São Paulo');
  if (!coordenadaValida(0, 0)) throw new Error('recusou o ponto zero');
  if (!coordenadaValida(90, 180)) throw new Error('recusou a borda do planeta');
});

console.log('\n--- as listas tem coordenada em toda linha? ---');

teste('todo pais tem ponto valido', () => {
  const ruins = paises.filter((p) => !coordenadaValida(p.lat, p.lon));
  if (ruins.length) throw new Error(`${ruins.length} paises sem ponto`);
});

teste('toda cidade tem ponto valido', () => {
  const ruins = cidades.filter((c) => !coordenadaValida(c[2], c[3]));
  if (ruins.length) throw new Error(`${ruins.length} cidades sem ponto`);
});

teste('todo estado de todo pais tem ponto valido', () => {
  let total = 0;
  let ruins = 0;
  for (const p of rotulos) {
    for (const e of estadosDe(p.key)) {
      total++;
      if (!coordenadaValida(e.lat, e.lon)) ruins++;
    }
  }
  if (ruins) throw new Error(`${ruins} de ${total} estados sem ponto`);
  console.log(`      (${total} estados conferidos)`);
});

console.log(`\npassou: ${passou} | falhou: ${falhou}`);
process.exit(falhou ? 1 : 0);
