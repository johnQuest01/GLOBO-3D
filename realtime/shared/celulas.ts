/**
 * O mundo dividido em células — o que substitui "a região" quando há gente.
 *
 * O PROBLEMA QUE ISTO RESOLVE. A presença era agrupada por NOME de lugar:
 * "são paulo" era uma sala só. Quem entrava recebia todo mundo que estivesse
 * nela, e o servidor anunciava cada entrada para todos. Com mil pessoas isso
 * já é pesado; com cinquenta mil é impossível, e não por falta de máquina: é a
 * conta que não fecha, porque o trabalho cresce com o QUADRADO da audiência
 * daquele lugar.
 *
 * A célula quebra isso. São Paulo deixa de ser uma sala e passa a ser algumas
 * centenas, cada uma com o seu punhado de gente. O servidor anuncia dentro da
 * célula, não da cidade — e é isso que permite dividir o trabalho entre
 * máquinas depois, porque cada célula é independente das outras.
 *
 * POR QUE NÃO NOME DE BAIRRO OU RUA. Porque a célula é publicada: ela viaja na
 * presença, aparece na tela de quem olha o globo. "Rua tal, bairro tal" é
 * endereço de gente. Um código sem significado geográfico diz ao aplicativo
 * tudo o que ele precisa — quem está perto de quem — e não diz a ninguém onde
 * a pessoa mora.
 *
 * E A COORDENADA É ARREDONDADA para o centro da célula antes de sair daqui.
 * Não é enfeite: sem isso, a célula protegeria o rótulo e a latitude entregaria
 * a casa.
 */

/**
 * O tamanho da célula, em graus.
 *
 * 0,02° são cerca de 2,2 km no sentido norte-sul — da ordem de um bairro. É um
 * meio-termo: célula grande demais volta ao problema de juntar muita gente;
 * pequena demais espalha tanto que ninguém encontra ninguém, e multiplica o
 * número de salas que o servidor precisa manter.
 *
 * São Paulo, com ~1.500 km², cai em algo como trezentas células.
 */
export const GRAUS_POR_CELULA = 0.02;

/** Quantas casas decimais o passo acima exige para não perder precisão. */
const CASAS = 2;

/**
 * A célula de uma coordenada.
 *
 * O formato é `c:<lat>:<lon>`, com os dois já arredondados para o canto da
 * célula. É estável (a mesma coordenada dá sempre a mesma célula), é
 * comparável por igualdade de string, e não carrega nome de lugar nenhum.
 */
export function celulaDe(lat: number, lon: number): string {
  const passo = GRAUS_POR_CELULA;
  const y = Math.floor(lat / passo) * passo;
  const x = Math.floor(lon / passo) * passo;
  return `c:${y.toFixed(CASAS)}:${x.toFixed(CASAS)}`;
}

/**
 * O centro da célula — a coordenada que a pessoa publica no lugar da dela.
 *
 * Todo mundo da mesma célula publica O MESMO ponto. Quem olha o globo vê um
 * lugar aproximado, e não uma posição; e duas pessoas na mesma célula são
 * indistinguíveis pela coordenada, que é exatamente o que se quer.
 */
export function centroDaCelula(celula: string): { lat: number; lon: number } | null {
  const partes = celula.split(':');
  if (partes.length !== 3 || partes[0] !== 'c') return null;

  const lat = Number(partes[1]);
  const lon = Number(partes[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const meio = GRAUS_POR_CELULA / 2;
  return { lat: lat + meio, lon: lon + meio };
}

/**
 * As células vizinhas, incluindo a própria.
 *
 * Nove no total: a pessoa está numa e enxerga as oito em volta. Isso resolve o
 * caso de quem mora na borda — sem os vizinhos, duas pessoas separadas por uma
 * rua ficariam invisíveis uma para a outra por estarem em células diferentes.
 */
export function celulasVizinhas(celula: string): string[] {
  const partes = celula.split(':');
  if (partes.length !== 3) return [celula];

  const lat = Number(partes[1]);
  const lon = Number(partes[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [celula];

  const passo = GRAUS_POR_CELULA;
  const saida: string[] = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const y = lat + dy * passo;
      // Longitude dá a volta: quem está em 179,99° tem vizinho em -180°.
      let x = lon + dx * passo;
      if (x >= 180) x -= 360;
      if (x < -180) x += 360;
      // Latitude não dá volta: acima do polo não há célula.
      if (y > 90 || y < -90) continue;
      saida.push(`c:${y.toFixed(CASAS)}:${x.toFixed(CASAS)}`);
    }
  }
  return saida;
}

/**
 * O número que a pessoa vê: "Proximidade 42".
 *
 * PRECISA SER ESTÁVEL e não pode significar nada. Estável porque duas pessoas
 * na mesma célula têm que ler o mesmo número, hoje e amanhã; sem significado
 * porque o número é mostrado na tela, e um rótulo que revelasse a posição
 * desfaria o motivo de a célula existir.
 *
 * É um hash da célula reduzido a três dígitos. Duas células distantes podem
 * cair no mesmo número, e isso não atrapalha: ninguém vê as duas ao mesmo
 * tempo — a pessoa só enxerga o punhado de células à sua volta.
 */
export function numeroDaCelula(celula: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < celula.length; i++) {
    h ^= celula.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 999) + 1;
}
