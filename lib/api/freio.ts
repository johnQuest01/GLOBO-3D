/**
 * Um freio de taxa por sessão, em memória.
 *
 * POR QUE ELE PRECISOU SAIR DE DENTRO DE UMA ROTA. Havia uma cópia na busca de
 * pessoas, e comentário e curtida precisam do mesmo freio com números
 * diferentes. Três cópias da mesma lógica divergem — e divergem calados: a que
 * ninguém olhou vira a porta aberta.
 *
 * MEMÓRIA É HONESTAMENTE FRACO, e vale dizer onde: cada instância serverless
 * tem o seu mapa, então o teto real é `instâncias × janela`. Vale mesmo assim,
 * porque o que ele barra é o script ingênuo — que é o caso comum — e custa
 * zero. Quem quiser furar isso de verdade precisa de várias conexões
 * simultâneas e ainda assim esbarra no banco: curtir é idempotente por chave
 * primária, e comentário repetido é visível.
 *
 * O FREIO QUE NÃO DÁ PARA FURAR é o do login, que mora no banco
 * (`login_attempts`), e o do tempo real, que é um processo só. Este aqui é
 * amortecedor, não porta de cofre — e é assim que ele deve ser lido.
 *
 * QUANDO TROCAR POR REDIS: quando o mesmo usuário passar a cair em instâncias
 * diferentes com frequência, ou quando o abuso deixar de ser script ingênuo. O
 * Redis do tempo real já está de pé e serviria; não está ligado aqui porque
 * ainda não há o problema, e ligar antes só faria cada curtida ter mais uma
 * rede no caminho.
 */

interface Balde {
  n: number;
  ate: number;
}

/** Um mapa por freio, para a busca não gastar o balde dos comentários. */
const mapas = new Map<string, Map<string, Balde>>();

/** Acima disto, varre e joga fora o que já venceu. */
const FAXINA_ACIMA_DE = 5_000;

export interface Freio {
  /** `true` = pode passar. */
  permitir: (chave: string) => boolean;
  /** Segundos para pôr no cabeçalho `retry-after`. */
  esperaSeg: number;
}

/**
 * Cria (ou recupera) um freio com nome.
 *
 * O NOME É A CHAVE DO MAPA, e não uma etiqueta: dois freios com o mesmo nome
 * são o mesmo freio de propósito — é o que permite duas rotas irmãs, como
 * curtir post e curtir comentário, dividirem um teto só em vez de somarem dois.
 */
export function freio(
  nome: string,
  maxPorJanela: number,
  janelaMs = 60_000,
): Freio {
  let mapa = mapas.get(nome);
  if (!mapa) {
    mapa = new Map();
    mapas.set(nome, mapa);
  }
  const meu = mapa;

  return {
    esperaSeg: Math.ceil(janelaMs / 1000),
    permitir(chave: string): boolean {
      const agora = Date.now();
      const balde = meu.get(chave);

      if (!balde || balde.ate < agora) {
        meu.set(chave, { n: 1, ate: agora + janelaMs });
        // Faxina preguiçosa: sem ela o mapa cresce para sempre com sessões
        // mortas, e um processo serverless de vida longa vaza memória devagar.
        if (meu.size > FAXINA_ACIMA_DE) {
          for (const [k, v] of meu) if (v.ate < agora) meu.delete(k);
        }
        return true;
      }

      balde.n += 1;
      return balde.n <= maxPorJanela;
    },
  };
}
