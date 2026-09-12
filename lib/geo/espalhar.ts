/**
 * Separar no mapa pessoas que o mapa coloca no mesmo lugar.
 *
 * O PROBLEMA, e ele não é de desenho: a coordenada de uma pessoa não é a dela,
 * é a da REGIÃO onde ela disse que mora. O `geo-mapping.json` tem um ponto por
 * estado e por cidade, então todo mundo em Minas Gerais recebe exatamente a
 * mesma latitude e longitude. Dois sinais acesos ali não ficam perto: ficam no
 * mesmo pixel, um escondendo o outro — e o de baixo deixa de existir para quem
 * olha e para quem clica.
 *
 * A SOLUÇÃO É UM DESLOCAMENTO DETERMINÍSTICO, tirado do identificador da
 * pessoa. Determinístico importa por duas razões, e as duas doem quando falta:
 * o sinal não pode pular de lugar a cada quadro ou a cada atualização da lista,
 * e o mesmo sinal precisa aparecer NO MESMO PONTO para todo mundo que estiver
 * olhando — senão duas pessoas conversando sobre "aquele ali" não estão falando
 * do mesmo ponto.
 *
 * O RAIO É PEQUENO de propósito (meio grau, algo como 55 km na direção
 * norte-sul). Grande o bastante para separar à vista de longe, pequeno o
 * bastante para ninguém ser jogado no estado vizinho.
 */

/** O maior afastamento do centro da região, em graus. */
const RAIO_MAX_GRAUS = 0.5;

/**
 * Hash estável de uma string.
 *
 * FNV-1a: não é criptografia e não precisa ser — o que se quer aqui é que o
 * mesmo identificador dê sempre o mesmo número, em qualquer navegador, sem
 * depender de biblioteca.
 */
function semente(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Coordenada {
  lat: number;
  lon: number;
}

/**
 * Espalha um ponto dentro de um disco em volta da coordenada da região.
 *
 * A RAIZ QUADRADA no raio não é enfeite matemático: sem ela os pontos se
 * amontoam no centro, porque a área de um anel cresce com a distância. Com
 * ela, a distribuição fica pareja dentro do círculo.
 *
 * A LONGITUDE É DIVIDIDA PELO COSSENO DA LATITUDE porque os meridianos se
 * fecham na direção dos polos: meio grau de longitude em Belém é largo, e em
 * Reykjavík é estreito. Sem a correção, o espalhamento vira uma faixa achatada
 * quanto mais longe do Equador.
 */
export function espalharNaRegiao(
  lat: number,
  lon: number,
  identificador: string,
): Coordenada {
  if (!identificador) return { lat, lon };

  const s = semente(identificador);
  // Dois números independentes do mesmo hash: os bits de cima e os de baixo.
  const angulo = ((s >>> 16) / 0x10000) * Math.PI * 2;
  const raio = Math.sqrt((s & 0xffff) / 0x10000) * RAIO_MAX_GRAUS;

  const dLat = Math.sin(angulo) * raio;
  const cos = Math.cos((lat * Math.PI) / 180);
  // Perto dos polos o cosseno tende a zero e a divisão explodiria; o piso
  // segura isso sem mudar nada no resto do mundo.
  const dLon = (Math.cos(angulo) * raio) / Math.max(0.2, cos);

  return {
    lat: Math.max(-89.9, Math.min(89.9, lat + dLat)),
    // Passou de 180, volta pelo outro lado: o mundo é redondo.
    lon: ((((lon + dLon + 180) % 360) + 360) % 360) - 180,
  };
}
