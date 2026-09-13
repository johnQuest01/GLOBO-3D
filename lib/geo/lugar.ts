/**
 * Onde fica o lugar que a pessoa escolheu.
 *
 * ESTE ARQUIVO EXISTE PARA ACABAR COM A ADIVINHAÇÃO. Até aqui, o aplicativo
 * guardava só os NOMES ("Rússia", "Moscovo", "Moscou") e ia procurar a
 * coordenada depois, casando esses nomes com as chaves do mapa do globo. O
 * problema é que os nomes não batem, e não batem por construção: a lista mostra
 * "Moscou", o mapa indexa "moscow city"; a lista mostra "Rússia", o mapa indexa
 * "Russia". São dois vocabulários diferentes para a mesma coisa.
 *
 * O QUE ISSO CAUSAVA. A busca tentava estado, depois cidade, depois país, e
 * parava no primeiro nome que existisse no mapa. Uma conta com Rússia e Moscou
 * preenchidos caiu na Sibéria, a 6 mil km de casa: o nome da cidade não
 * resolvia, o do estado resolvia — e o estado tinha sido escolhido por engano
 * numa lista de 86 itens onde "Moscovo" e "Krai de Zabaykalsky" são vizinhos de
 * rolagem. O país, que estava certo, nunca chegava a ser consultado.
 *
 * A SAÍDA ESTAVA NOS PRÓPRIOS ARQUIVOS. `country-labels.json`,
 * `state-labels-tiled/*.json` e `city-search.json` trazem `lat` e `lon` em cada
 * linha — o formulário sempre teve a coordenada na mão e a jogava fora, ficando
 * só com o rótulo. Aqui ela é recolhida no instante da escolha e guardada. Não
 * há mais nome para traduzir depois, e portanto não há mais tradução para
 * errar.
 *
 * DO MAIS ESPECÍFICO PARA O MENOS, que é a outra metade do conserto: cidade,
 * depois estado, depois país. A ordem antiga começava pelo estado, então um
 * estado errado ganhava de uma cidade certa — exatamente o caso acima.
 */

export type Precisao = "cidade" | "estado" | "pais";

export interface Lugar {
  lat: number;
  lon: number;
  /** O quanto o globo consegue aproximar. Vira o `regionKey` da presença. */
  precisao: Precisao;
  /** O nome que casou. Serve para explicar a escolha a quem preenche. */
  rotulo: string;
}

/** Uma linha de qualquer um dos três arquivos: todas têm nome e coordenada. */
export interface LinhaComCoordenada {
  name: string;
  lat: number;
  lon: number;
}

/** [chave, nome, lat, lon, regiao, pais] — ver public/data/city-search.json. */
export type CidadeLinha = [string, string, number, number, string, string];

/**
 * "SÃO PAULO" e "sao paulo" são o mesmo lugar.
 *
 * SEM ISTO O CONSERTO FICAVA PELA METADE, e o efeito era invisível: quem tinha
 * digitado o nome sem acento ou em caixa alta não casava com a lista, caía para
 * o país, e ia parar no CENTRO GEOGRÁFICO do Brasil — a 900 km de casa, sem
 * nenhum erro na tela. Foram quatro contas assim, achadas conferindo o banco
 * depois de preencher as coordenadas.
 */
const achatar = (v: string) =>
  v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const igual = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && achatar(a) === achatar(b);

const ehCoordenada = (lat: unknown, lon: unknown): boolean =>
  typeof lat === "number" &&
  typeof lon === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lon) <= 180;

/** Quilômetros entre dois pontos. Serve só para desempatar homônimas. */
function distanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Listas {
  paises: LinhaComCoordenada[];
  estados: LinhaComCoordenada[];
  cidades: CidadeLinha[];
}

/**
 * A coordenada do que foi escolhido — ou nulo, se nada do que está escrito
 * existe nas listas.
 *
 * NULO É UMA RESPOSTA ÚTIL, e o formulário depende dela: só deixa salvar um
 * lugar que o globo reconhece. Foi o que faltava quando o pedido "onde você
 * está?" voltava para sempre — o nome era aceito, gravado, e o globo continuava
 * sem saber onde pôr a pessoa, então perguntava de novo. Salvando só o que tem
 * coordenada, esse laço não tem como se formar.
 */
export function ondeFica(
  campos: {
    country?: string | null;
    state?: string | null;
    city?: string | null;
  },
  listas: Listas,
): Lugar | null {
  const { country, state, city } = campos;

  // O estado é achado antes da cidade mesmo sendo a resposta MENOS precisa:
  // quando o nome da cidade é ambíguo, é a coordenada dele que desempata.
  const noEstado = state?.trim()
    ? (listas.estados.find((e) => igual(e.name, state)) ?? null)
    : null;

  // 1. Cidade — a melhor aproximação, e a que o globo usa para chegar perto.
  if (city?.trim()) {
    const comEsseNome = listas.cidades.filter(
      (c) => igual(c[1], city) && ehCoordenada(c[2], c[3]),
    );

    /*
     * O PAÍS FILTRA — o nome de cidade se repete pelo mundo. São 126 nomes em
     * mais de um país, entre eles Odessa e São Petersburgo; sem o filtro, a
     * pessoa iria parar no continente errado.
     */
    const doPais = country?.trim()
      ? comEsseNome.filter((c) => igual(c[5], country))
      : comEsseNome;

    /*
     * MAS O PAÍS DA LISTA E O PAÍS DIGITADO NEM SEMPRE SÃO O MESMO TEXTO, e aí
     * o filtro tira a cidade certa em vez de desempatar. A linha de Hong Kong
     * traz o país como "Hong Kong S.A.R."; quem escreve "China" não casa com
     * ela, e uma conta com "Hong Kong, China" preenchidos foi parar no meio da
     * China continental, a 1.500 km de distância.
     *
     * Quando o nome é ÚNICO no mundo (6.926 dos 7.135 são), não há o que
     * desempatar e a divergência de rótulo não deveria custar a cidade. Com
     * nome repetido o filtro continua valendo: ali o país é a única coisa que
     * separa duas cidades de verdade.
     */
    const candidatas =
      doPais.length > 0 ? doPais : comEsseNome.length === 1 ? comEsseNome : [];

    /*
     * O NOME SE REPETE DENTRO DO PRÓPRIO PAÍS, e essa é a parte que engana.
     * Há 64 casos com mais de 50 km entre as homônimas: Portland fica em
     * Oregon e no Maine, a 4 mil km uma da outra; Springfield fica em cinco
     * estados. Ficar com a primeira linha da lista seria decidir por ordem de
     * arquivo.
     *
     * QUEM DESEMPATA É A DISTÂNCIA ATÉ O ESTADO, e não o nome dele. Os nomes de
     * região vêm em vocabulários diferentes nos dois arquivos — a lista de
     * cidades diz "Primor'ye" onde a de estados diz outra coisa —, e comparar
     * texto voltaria a ser o palpite que este arquivo existe para eliminar. A
     * coordenada do estado é um número, e o número está certo nos dois.
     */
    const escolhida =
      candidatas.length > 1 &&
      noEstado &&
      ehCoordenada(noEstado.lat, noEstado.lon)
        ? candidatas.reduce((melhor, c) =>
            distanciaKm(c[2], c[3], noEstado.lat, noEstado.lon) <
            distanciaKm(melhor[2], melhor[3], noEstado.lat, noEstado.lon)
              ? c
              : melhor,
          )
        : candidatas[0];

    if (escolhida) {
      return {
        lat: escolhida[2],
        lon: escolhida[3],
        precisao: "cidade",
        rotulo: escolhida[1],
      };
    }
  }

  // 2. Estado.
  if (noEstado && ehCoordenada(noEstado.lat, noEstado.lon)) {
    return {
      lat: noEstado.lat,
      lon: noEstado.lon,
      precisao: "estado",
      rotulo: noEstado.name,
    };
  }

  // 3. País — grosso, mas põe a pessoa no mapa, que é o mínimo para existir ali.
  if (country?.trim()) {
    const linha = listas.paises.find((p) => igual(p.name, country));
    if (linha && ehCoordenada(linha.lat, linha.lon)) {
      return {
        lat: linha.lat,
        lon: linha.lon,
        precisao: "pais",
        rotulo: linha.name,
      };
    }
  }

  return null;
}

/**
 * A coordenada que chegou pela rede é mesmo uma coordenada?
 *
 * O servidor não confere se a pessoa mora ali — não teria como, e mentir sobre
 * a própria cidade já era possível digitando outra. Confere que é um ponto do
 * planeta, para o globo não receber `NaN` e sumir com todo mundo da tela.
 */
export function coordenadaValida(lat: unknown, lon: unknown): boolean {
  return ehCoordenada(lat, lon);
}
