/**
 * Do que a pessoa escreveu para a chave que o mapa do globo conhece.
 *
 * O `geo-mapping.json` guarda os nomes por extenso e COM acento: "são paulo",
 * "paraíba", "minas gerais". Quem se cadastra escreve o que quiser — "SP",
 * "Sao Paulo", "sp" — e nada disso casa.
 *
 * O estrago era desproporcional: quem escrevesse "SP" ficava sem coordenada,
 * e como a conexão do chat estava amarrada a ter um lugar no globo, a pessoa
 * simplesmente não conseguia conversar. A ligação com o chat já foi desfeita
 * (ver useLiveRealtime); isto aqui resolve a outra metade — ela aparecer no
 * globo, que é o ponto do produto.
 */

/** "São Paulo" -> "sao paulo". Serve para comparar, nunca para exibir. */
export function semAcento(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * As 27 unidades da federação pelas siglas.
 *
 * Vale a pena escrever à mão: é um produto brasileiro, "SP" é como as pessoas
 * escrevem, e o mapa só entende "são paulo". Os valores saem ACENTUADOS porque
 * é assim que estão as chaves do geo-mapping.
 */
const SIGLAS: Record<string, string> = {
  ac: 'acre',
  al: 'alagoas',
  am: 'amazonas',
  ap: 'amapá',
  ba: 'bahia',
  ce: 'ceará',
  df: 'distrito federal',
  es: 'espírito santo',
  go: 'goiás',
  ma: 'maranhão',
  mg: 'minas gerais',
  ms: 'mato grosso do sul',
  mt: 'mato grosso',
  pa: 'pará',
  pb: 'paraíba',
  pe: 'pernambuco',
  pi: 'piauí',
  pr: 'paraná',
  rj: 'rio de janeiro',
  rn: 'rio grande do norte',
  ro: 'rondônia',
  rr: 'roraima',
  rs: 'rio grande do sul',
  sc: 'santa catarina',
  se: 'sergipe',
  sp: 'são paulo',
  to: 'tocantins',
};

/**
 * Os palpites de chave para um lugar escrito por gente, do mais provável ao
 * menos.
 *
 * Devolve uma LISTA, e não um valor: quem chama tenta um por um contra o mapa
 * e para no primeiro que existir. Assim esta função não precisa conhecer o
 * conteúdo do mapa — e o mapa pode crescer sem que ela mude.
 */
export function chavesPossiveis(valor: string | undefined | null): string[] {
  if (!valor || !valor.trim()) return [];

  const cru = valor.trim().toLowerCase();
  const sem = semAcento(cru);

  const palpites = [cru];

  // Sigla de estado: o caso mais comum de tudo.
  if (SIGLAS[sem]) palpites.push(SIGLAS[sem]!);

  // Escrito sem acento: "sao paulo" -> tenta achar o acentuado pela sigla
  // inversa não dá; então fica o próprio, para mapas que aceitem sem acento.
  if (sem !== cru) palpites.push(sem);

  // "Estado de São Paulo", "Estado do Pará" — prefixo que as pessoas escrevem
  // e o mapa não tem.
  const semPrefixo = cru.replace(/^estado d[eoa]s?\s+/, '');
  if (semPrefixo !== cru) palpites.push(semPrefixo);

  return [...new Set(palpites)];
}

/**
 * Acha a chave acentuada correspondente a um texto sem acento.
 *
 * Precisa da lista de chaves do mapa, e é por isso que recebe a função de
 * busca: "sao paulo" só vira "são paulo" comparando forma normalizada com
 * forma normalizada.
 */
export function acharChaveEquivalente(
  valor: string,
  chavesDoMapa: Iterable<string>,
): string | null {
  const alvo = semAcento(valor);
  for (const chave of chavesDoMapa) {
    if (semAcento(chave) === alvo) return chave;
  }
  return null;
}
