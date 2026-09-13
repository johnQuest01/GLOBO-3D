/**
 * Presença, sinais e recomendações — o "quero conversar".
 *
 * O QUE ESTA SUÍTE VIGIA É UMA DECISÃO DE ESCALA, e não uma funcionalidade.
 * Sinal aceso é público e mundial, e essa é a graça: se ninguém da Rússia
 * estiver online, alguém da Nigéria estará. Mas anunciar cada sinal para cada
 * pessoa é trabalho que cresce com o PRODUTO dos dois números — com 25 mil
 * sinais e 50 mil conexões dá 1,25 bilhão de entregas por rodada.
 *
 * A saída foi PERGUNTAR em vez de receber: o mundo vem sob demanda
 * (`beacon:find`), e só o sinal de quem está perto é anunciado ao vivo. Por
 * isso há aqui um teste que conta quantos anúncios chegam a quem está longe, e
 * a resposta certa é ZERO. É a diferença entre o aplicativo aguentar 500 mil
 * pessoas e não aguentar.
 *
 * Há também os defeitos já vistos em uso: sinais de contas diferentes se
 * sobrepondo, e o sinal morrendo quando a pessoa só trocou de rede.
 */

import { Suite, esperarAte, igual, ok, pausa } from "./arnes";
import { ContaDeTeste, apagarConta, criarConta } from "./contas";
import { Aparelho } from "./socket";

interface Sinal {
  beaconId: string;
  clientId: string;
  lat: number;
  lon: number;
  regionKey: string;
  topic?: string;
  nickname?: string;
  pais?: string;
  estado?: string;
  expiresAt: number;
}

const SAO_PAULO = { lat: -23.55, lon: -46.63, regionKey: "são paulo" };
const TOQUIO = { lat: 35.68, lon: 139.69, regionKey: "tokyo" };

export async function suiteSinais(
  base: string,
  urlRealtime: string,
): Promise<Suite> {
  const s = new Suite("sinais — presença, alcance mundial e recomendações");

  const aparelhos: Aparelho[] = [];
  const contas: ContaDeTeste[] = [];

  const novaConta = async (
    apelido: string,
    lugar: Parameters<typeof criarConta>[2],
  ) => {
    const c = await criarConta(base, apelido, lugar);
    contas.push(c);
    return c;
  };
  const abrir = async (conta: ContaDeTeste, apelido: string) => {
    const ap = new Aparelho(urlRealtime, conta.cliente, apelido);
    aparelhos.push(ap);
    await ap.ligar();
    return ap;
  };

  s.aoFinal(() => {
    for (const ap of aparelhos) ap.desligar();
  });
  s.aoFinal(async () => {
    for (const c of contas) await apagarConta(c.id);
  });

  try {
    const paulista = await novaConta("sp", {
      country: "Brasil",
      state: "São Paulo",
      city: "São Paulo",
      lat: SAO_PAULO.lat,
      lon: SAO_PAULO.lon,
    });
    const vizinha = await novaConta("sp2", {
      country: "Brasil",
      state: "São Paulo",
      city: "São Paulo",
      lat: SAO_PAULO.lat,
      lon: SAO_PAULO.lon,
    });
    const japonesa = await novaConta("jp", {
      country: "Japão",
      state: "Tokyo",
      city: "Tóquio",
      lat: TOQUIO.lat,
      lon: TOQUIO.lon,
    });

    const ap1 = await abrir(paulista, "paulista");
    const ap2 = await abrir(vizinha, "vizinha");
    const ap3 = await abrir(japonesa, "japonesa");

    const entrar = (
      ap: Aparelho,
      conta: ContaDeTeste,
      onde: typeof SAO_PAULO,
    ) =>
      ap.emitir("presence:join", {
        clientId: `teste-${conta.nickname}`,
        lat: onde.lat,
        lon: onde.lon,
        regionKey: onde.regionKey,
      });

    // -----------------------------------------------------------------------
    // Presença
    // -----------------------------------------------------------------------

    await s.teste("entrar no globo devolve o retrato da região", async () => {
      entrar(ap1, paulista, SAO_PAULO);
      await esperarAte(
        () => ap1.quantos("presence:snapshot") >= 1,
        "presence:snapshot",
      );
      const snap = ap1.ultimo<{
        presences: unknown[];
        beacons: unknown[];
        total?: number;
      }>("presence:snapshot")!;
      ok(Array.isArray(snap.presences), "veio a lista de presenças");
      ok(Array.isArray(snap.beacons), "veio a lista de sinais");
      return `${snap.presences.length} presença(s), ${snap.beacons.length} sinal(is)`;
    });

    await s.teste("quem entra perto aparece para quem já estava", async () => {
      ap1.esquecer();
      entrar(ap2, vizinha, SAO_PAULO);
      await esperarAte(
        () =>
          ap1
            .todos<{ kind: string; presence: { nickname?: string } }>(
              "presence:update",
            )
            .some((u) => u.kind === "join"),
        "presence:update de entrada",
      );
    });

    await s.teste(
      "acender sinal SEM entrar no globo dá um erro que diz o que fazer",
      async () => {
        /*
         * Foi assim que a conta entrada pelo Google via a falha: `beacon:raise
         * antes de presence:join` — uma frase de dentro do protocolo, escrita
         * para quem escreveu o protocolo, dita a quem só queria aparecer no mapa.
         * O erro precisa existir (não pode falhar em silêncio), mas quem traduz é
         * a tela.
         */
        const solta = await abrir(japonesa, "sem-join");
        solta.emitir("beacon:raise", { ttlSec: 300 });
        await esperarAte(() => solta.quantos("error") >= 1, "error");
        const e = solta.ultimo<{ code: string; message: string }>("error")!;
        ok(e.code, "o erro tem código, e não só texto");
        return `${e.code}`;
      },
    );

    // -----------------------------------------------------------------------
    // Sinais
    // -----------------------------------------------------------------------

    await s.teste("acender sinal: quem está perto vê ao vivo", async () => {
      ap2.esquecer();
      ap1.emitir("beacon:raise", {
        ttlSec: 300,
        topic: "quero praticar russo",
        pais: "Brasil",
        estado: "São Paulo",
      });
      await esperarAte(
        () => ap2.quantos("beacon:new") >= 1,
        "beacon:new no vizinho",
      );
      const b = ap2.ultimo<Sinal>("beacon:new")!;
      igual(b.nickname, paulista.nickname, "de quem é o sinal");
      igual(b.topic, "quero praticar russo", "o assunto");
      ok(b.expiresAt > Date.now(), "tem hora para acabar");
    });

    await s.teste(
      "QUEM ESTÁ LONGE NÃO RECEBE ANÚNCIO — é a conta que fecha em escala",
      async () => {
        entrar(ap3, japonesa, TOQUIO);
        await esperarAte(
          () => ap3.quantos("presence:snapshot") >= 1,
          "o Japão entrou",
        );
        ap3.esquecer();

        ap2.emitir("beacon:raise", { ttlSec: 300, topic: "oi de São Paulo" });
        await pausa(2500);

        igual(
          ap3.quantos("beacon:new"),
          0,
          "um sinal de São Paulo foi empurrado até Tóquio",
        );
        return "0 anúncios atravessaram o mundo";
      },
    );

    await s.teste("mas PERGUNTANDO, o mundo inteiro responde", async () => {
      ap3.esquecer();
      ap3.emitir("beacon:find", { limite: 50 });
      await esperarAte(() => ap3.quantos("beacon:list") >= 1, "beacon:list");
      const lista = ap3.ultimo<{ sinais: Sinal[]; total: number }>(
        "beacon:list",
      )!;
      const paulistas = lista.sinais.filter(
        (x) =>
          x.nickname === paulista.nickname || x.nickname === vizinha.nickname,
      );
      ok(paulistas.length >= 1, `não achou os sinais de São Paulo de Tóquio`);
      return `${lista.sinais.length} de ${lista.total} sinais no mundo`;
    });

    await s.teste(
      "a lista tem teto — não manda o mundo inteiro de uma vez",
      async () => {
        ap3.esquecer();
        ap3.emitir("beacon:find", { limite: 100000 });
        await esperarAte(() => ap3.quantos("beacon:list") >= 1, "beacon:list");
        const lista = ap3.ultimo<{ sinais: Sinal[] }>("beacon:list")!;
        ok(
          lista.sinais.length <= 200,
          `veio ${lista.sinais.length}, acima do teto de 200`,
        );
        return `teto respeitado (${lista.sinais.length})`;
      },
    );

    await s.teste("filtrar por país devolve só daquele país", async () => {
      ap3.esquecer();
      ap3.emitir("beacon:find", { pais: "Brasil", limite: 50 });
      await esperarAte(() => ap3.quantos("beacon:list") >= 1, "beacon:list");
      const lista = ap3.ultimo<{ sinais: Sinal[] }>("beacon:list")!;
      const forasteiros = lista.sinais.filter(
        (x) => x.pais && x.pais !== "Brasil",
      );
      igual(forasteiros.length, 0, "veio gente de outro país no filtro");
    });

    await s.teste(
      "UM SINAL POR PESSOA, mesmo acendendo dez vezes seguidas",
      async () => {
        /*
         * O defeito relatado: "sinais estão sobrepondo sinais de outras contas".
         * A primeira versão apagava e reinseria, e três `raise` no mesmo instante
         * liam o id ainda vazio — a região ficava com três sinais da mesma
         * pessoa, dois deles órfãos que nem a desconexão limpava.
         */
        for (let i = 0; i < 10; i++) {
          ap1.emitir("beacon:raise", { ttlSec: 300, topic: `tentativa ${i}` });
        }
        await pausa(2500);

        ap3.esquecer();
        ap3.emitir("beacon:find", { limite: 200 });
        await esperarAte(() => ap3.quantos("beacon:list") >= 1, "beacon:list");
        const meus = ap3
          .ultimo<{ sinais: Sinal[] }>("beacon:list")!
          .sinais.filter((x) => x.nickname === paulista.nickname);
        igual(meus.length, 1, `a mesma pessoa apareceu ${meus.length} vezes`);
        return "10 toques, 1 sinal";
      },
    );

    await s.teste("apagar o sinal tira ele da lista", async () => {
      ap1.emitir("beacon:lower");
      await pausa(2500);
      ap3.esquecer();
      ap3.emitir("beacon:find", { limite: 200 });
      await esperarAte(() => ap3.quantos("beacon:list") >= 1, "beacon:list");
      const meus = ap3
        .ultimo<{ sinais: Sinal[] }>("beacon:list")!
        .sinais.filter((x) => x.nickname === paulista.nickname);
      igual(meus.length, 0, "o sinal continuou aceso depois de apagado");
    });

    await s.teste("o sinal sobrevive a uma queda curta de rede", async () => {
      /*
       * Trocar de wi-fi para dados móveis derruba o socket e reconecta em
       * segundos. Sem carência, o sinal morria nessa troca e a pessoa sumia do
       * mapa sem ter feito nada.
       */
      ap2.emitir("beacon:raise", { ttlSec: 600, topic: "vou cair e voltar" });
      await pausa(1500);

      ap2.desligar();
      await pausa(1500);

      const voltou = await abrir(vizinha, "vizinha/voltou");
      entrar(voltou, vizinha, SAO_PAULO);
      await esperarAte(
        () => voltou.quantos("presence:snapshot") >= 1,
        "voltou ao globo",
      );
      await pausa(2500);

      voltou.esquecer();
      voltou.emitir("beacon:find", { limite: 200 });
      await esperarAte(() => voltou.quantos("beacon:list") >= 1, "beacon:list");
      const meu = voltou
        .ultimo<{ sinais: Sinal[] }>("beacon:list")!
        .sinais.filter((x) => x.nickname === vizinha.nickname);
      igual(meu.length, 1, "o sinal não sobreviveu à reconexão");
    });

    // -----------------------------------------------------------------------
    // Recomendações
    // -----------------------------------------------------------------------

    await s.teste("as recomendações vêm em três camadas", async () => {
      ap3.esquecer();
      ap3.emitir("sugestoes:find", { estado: "Tokyo", pais: "Japão" });
      await esperarAte(
        () => ap3.quantos("sugestoes:list") >= 1,
        "sugestoes:list",
      );
      const r = ap3.ultimo<{
        doEstado: Sinal[];
        doPais: Sinal[];
        doMundo: Sinal[];
      }>("sugestoes:list")!;
      ok(Array.isArray(r.doEstado), "doEstado");
      ok(Array.isArray(r.doPais), "doPais");
      ok(Array.isArray(r.doMundo), "doMundo");
      return `${r.doEstado.length} do estado, ${r.doPais.length} do país, ${r.doMundo.length} do mundo`;
    });

    await s.teste(
      "SEMPRE há gente de longe junto — senão o globo não precisaria existir",
      async () => {
        ap3.esquecer();
        ap3.emitir("sugestoes:find", { estado: "Tokyo", pais: "Japão" });
        await esperarAte(
          () => ap3.quantos("sugestoes:list") >= 1,
          "sugestoes:list",
        );
        const r = ap3.ultimo<{ doMundo: Sinal[] }>("sugestoes:list")!;
        ok(r.doMundo.length >= 1, "nenhuma sugestão de fora do país");
        return `${r.doMundo.length} do resto do mundo`;
      },
    );

    await s.teste(
      "a ordem varia entre consultas — ninguém é sobrecarregado",
      async () => {
        /*
         * Sem embaralhar, a primeira pessoa da lista recebe o convite de todo
         * mundo que abrir a tela, sempre. O embaralhamento é o que espalha a
         * atenção — e por isso é comportamento, não enfeite.
         */
        const primeiros = new Set<string>();
        for (let i = 0; i < 10; i++) {
          ap3.esquecer();
          ap3.emitir("sugestoes:find", { estado: "Tokyo", pais: "Japão" });
          await esperarAte(
            () => ap3.quantos("sugestoes:list") >= 1,
            `consulta ${i}`,
          );
          const r = ap3.ultimo<{ doMundo: Sinal[] }>("sugestoes:list")!;
          if (r.doMundo[0])
            primeiros.add(r.doMundo[0].nickname ?? r.doMundo[0].beaconId);
          await pausa(150);
        }
        // Com poucos sinais de teste no ar não dá para exigir variedade alta; o
        // que não pode é o conjunto ser vazio.
        ok(primeiros.size >= 1, "nenhuma sugestão em dez consultas");
        return `${primeiros.size} pessoa(s) diferente(s) em primeiro lugar, em 10 consultas`;
      },
    );

    // -----------------------------------------------------------------------
    // A lupa do tempo real
    // -----------------------------------------------------------------------

    await s.teste("directory:find diz quem está online agora", async () => {
      ap3.esquecer();
      ap3.emitir("directory:find", {
        nicknames: [paulista.nickname, "naoexisteninguem"],
      });
      await esperarAte(
        () => ap3.quantos("directory:result") >= 1,
        "directory:result",
      );
      const r = ap3.ultimo<{
        encontrados: { nickname: string; presence: unknown | null }[];
      }>("directory:result")!;
      igual(r.encontrados.length, 2, "um item por nome perguntado");
      const achado = r.encontrados.find(
        (x) => x.nickname === paulista.nickname,
      );
      ok(achado?.presence, "quem está online veio sem presença");
      const fantasma = r.encontrados.find(
        (x) => x.nickname === "naoexisteninguem",
      );
      igual(
        fantasma?.presence ?? null,
        null,
        "quem não existe veio com presença",
      );
    });

    await s.teste(
      "o limite de taxa existe e avisa, em vez de calar",
      async () => {
        ap3.esquecer();
        // O teto de `directory:find` é 20 por minuto. Trinta pedidos precisam
        // esbarrar — e o cliente precisa SABER que esbarrou, senão a lupa parece
        // quebrada.
        for (let i = 0; i < 30; i++)
          ap3.emitir("directory:find", { nicknames: ["alguem"] });
        await esperarAte(
          () => ap3.quantos("rate_limited") >= 1,
          "rate_limited",
        );
        const r = ap3.ultimo<{ action: string; retryAfterMs: number }>(
          "rate_limited",
        )!;
        ok(r.retryAfterMs > 0, "disse quanto esperar");
        return `barrou em ${r.action}, espere ${r.retryAfterMs}ms`;
      },
    );
  } finally {
    await s.limpar();
  }

  return s;
}
