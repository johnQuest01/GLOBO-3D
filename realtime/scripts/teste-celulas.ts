/**
 * As células fazem o que prometem?
 *
 *   npx tsx scripts/teste-celulas.ts
 *
 * São três promessas, e todas as três importam: agrupar quem está perto,
 * separar quem está longe, e não entregar a posição de ninguém.
 */

import {
  celulaDe,
  celulasVizinhas,
  centroDaCelula,
  GRAUS_POR_CELULA,
  numeroDaCelula,
} from '../shared/celulas.js';

let passou = 0;
let falhou = 0;

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log(`PASS  ${nome}`);
  } else {
    falhou += 1;
    console.log(`FALHOU  ${nome}${detalhe ? ' — ' + detalhe : ''}`);
  }
}

console.log('\n=== agrupar quem esta perto ===');

// Duas pessoas a ~300 m uma da outra, na Avenida Paulista.
const a = celulaDe(-23.5614, -46.6558);
const b = celulaDe(-23.5631, -46.6585);
ok('vizinhos de rua caem na mesma celula', a === b, `${a} vs ${b}`);

console.log('\n=== separar quem esta longe ===');

const paulista = celulaDe(-23.5614, -46.6558);
const guarulhos = celulaDe(-23.4543, -46.5337);
ok('bairros diferentes, celulas diferentes', paulista !== guarulhos);

const tokyo = celulaDe(35.6812, 139.7671);
ok('cidades diferentes, celulas diferentes', paulista !== tokyo);

console.log('\n=== nao entregar a posicao ===');

const centro = centroDaCelula(paulista);
ok('a celula tem centro', centro !== null);
if (centro) {
  const distanciaLat = Math.abs(centro.lat - -23.5614) * 111;
  ok(
    'o centro fica a menos de 1,5 km da pessoa',
    distanciaLat < 1.5,
    `${distanciaLat.toFixed(2)} km`,
  );
  // O ponto publicado e' o mesmo para todos na celula.
  const outro = centroDaCelula(b);
  ok(
    'duas pessoas da mesma celula publicam o MESMO ponto',
    outro !== null && outro.lat === centro.lat && outro.lon === centro.lon,
  );
}

ok(
  'a celula nao contem nome de lugar',
  !/[a-z]{3}/i.test(paulista.replace(/^c:/, '')),
  paulista,
);

console.log('\n=== vizinhanca ===');

const vizinhas = celulasVizinhas(paulista);
ok('sao nove celulas (a propria e as oito ao redor)', vizinhas.length === 9, String(vizinhas.length));
ok('a propria esta na lista', vizinhas.includes(paulista));

// Alguem na borda: a celula ao lado precisa estar entre as vizinhas.
const naBorda = celulaDe(-23.5614, -46.6558 + GRAUS_POR_CELULA);
ok('a celula ao lado e vizinha', vizinhas.includes(naBorda), naBorda);

console.log('\n=== a volta do mundo ===');
const perto180 = celulaDe(0, 179.99);
const vizinhas180 = celulasVizinhas(perto180);
ok(
  'quem esta perto de 180 tem vizinho do outro lado',
  vizinhas180.some((c) => c.endsWith(':-180.00')),
  vizinhas180.join(' '),
);

console.log('\n=== o rotulo ===');
const n1 = numeroDaCelula(paulista);
const n2 = numeroDaCelula(paulista);
ok('o numero e estavel', n1 === n2, `${n1} vs ${n2}`);
ok('o numero cabe em tres digitos', n1 >= 1 && n1 <= 999, String(n1));
ok('celulas diferentes tendem a numeros diferentes', numeroDaCelula(tokyo) !== n1);

console.log(`\npassou: ${passou} | falhou: ${falhou}\n`);
process.exit(falhou === 0 ? 0 : 1);
