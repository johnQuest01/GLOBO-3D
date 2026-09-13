/**
 * A conversa, de ponta a ponta e contra os servidores de verdade.
 *
 * OS DEFEITOS QUE ESTA SUÍTE EXISTE PARA PEGAR já aconteceram todos, e nenhum
 * deles aparecia com duas pessoas conversando numa tela só:
 *
 *   · o áudio mandado do celular não existia no computador;
 *   · a mensagem já lida voltava a aparecer como não lida ao reabrir a conversa;
 *   · o aviso de "digitando" chegava depois, sobre algo que já tinha passado;
 *   · a mensagem mandada para quem estava offline se perdia.
 *
 * Todos são defeitos de SINCRONIA entre aparelhos, não de lógica dentro de um
 * arquivo. Por isso quase todo teste aqui abre dois aparelhos, e vários abrem
 * dois aparelhos DA MESMA CONTA.
 */

import { randomUUID } from "node:crypto";

import { Suite, esperarAte, igual, ok, pausa } from "./arnes";
import { ContaDeTeste, apagarConta, criarConta, sql } from "./contas";
import { Aparelho } from "./socket";

interface Envelope {
  msgId: string;
  from: string;
  to?: string;
  minha?: boolean;
  entregue?: boolean;
  lida?: boolean;
  kind: string;
  payload: string;
  sentAt: string;
}

/** Um payload do tamanho de um arquivo de verdade, sem ser o arquivo. */
const recheio = (bytes: number) => "x".repeat(bytes);

export async function suiteConversa(
  base: string,
  urlRealtime: string,
): Promise<Suite> {
  const s = new Suite("conversa — envio, entrega, leitura e sincronia");

  const aparelhos: Aparelho[] = [];
  let ana: ContaDeTeste | null = null;
  let bia: ContaDeTeste | null = null;

  try {
    ana = await criarConta(base, "ana");
    bia = await criarConta(base, "bia");
    const A = ana;
    const B = bia;
    s.aoFinal(() => {
      for (const ap of aparelhos) ap.desligar();
    });
    s.aoFinal(() => apagarConta(A.id));
    s.aoFinal(() => apagarConta(B.id));

    const abrir = async (conta: ContaDeTeste, apelido: string) => {
      const ap = new Aparelho(urlRealtime, conta.cliente, apelido);
      aparelhos.push(ap);
      await ap.ligar();
      return ap;
    };

    // O celular e o computador da Ana: a mesma conta, duas conexões.
    const anaCel = await abrir(A, "ana/celular");
    const anaPc = await abrir(A, "ana/computador");
    const biaCel = await abrir(B, "bia/celular");

    // -----------------------------------------------------------------------
    // O caminho feliz
    // -----------------------------------------------------------------------

    await s.teste("três conexões abertas, duas contas", () => {
      ok(anaCel.ligado && anaPc.ligado && biaCel.ligado, "alguma não conectou");
      return `${urlRealtime}`;
    });

    let primeiraMsg = "";

    await s.teste("mandar texto: o remetente vê o primeiro tique", async () => {
      primeiraMsg = randomUUID();
      anaCel.emitir("msg:send", {
        msgId: primeiraMsg,
        to: B.nickname,
        kind: "texto",
        payload: "Oi, tudo bem? Acentuação: ção, ñ, 日本語, 🌍",
      });
      await esperarAte(
        () => anaCel.quantos("msg:accepted") === 1,
        "msg:accepted",
      );
      const aceito = anaCel.ultimo<{ msgId: string; sentAt: string }>(
        "msg:accepted",
      )!;
      igual(aceito.msgId, primeiraMsg, "msgId");
      ok(!Number.isNaN(Date.parse(aceito.sentAt)), "sentAt é data válida");
    });

    await s.teste("a outra pessoa recebe, com o texto intacto", async () => {
      await esperarAte(() => biaCel.quantos("msg:new") >= 1, "msg:new na Bia");
      const e = biaCel.ultimo<Envelope>("msg:new")!;
      igual(e.msgId, primeiraMsg, "msgId");
      igual(e.from, A.nickname, "de quem");
      igual(e.kind, "texto", "tipo");
      ok(e.payload.includes("🌍"), "o emoji sobreviveu");
      ok(e.payload.includes("ção"), "o acento sobreviveu");
      ok(!e.minha, "não é dela");
    });

    await s.teste(
      "a mensagem chega ao OUTRO aparelho da própria remetente",
      async () => {
        // Este é o defeito relatado: o áudio mandado do celular não aparecia no
        // computador. A mensagem é da Ana, e precisa existir nos dois lugares.
        anaPc.esquecer();
        anaPc.emitir("msg:sync", { desde: null });
        await esperarAte(
          () =>
            anaPc
              .todos<Envelope>("msg:new")
              .some((e) => e.msgId === primeiraMsg),
          "a mensagem no computador da Ana",
        );
        const e = anaPc
          .todos<Envelope>("msg:new")
          .find((x) => x.msgId === primeiraMsg)!;
        ok(e.minha, "veio marcada como minha");
        igual(e.to, B.nickname, "para quem");
      },
    );

    await s.teste(
      "o segundo tique chega quando o aparelho do outro confirma",
      async () => {
        anaCel.esquecer();
        biaCel.emitir("msg:ack", { msgIds: [primeiraMsg] });
        await esperarAte(
          () => anaCel.quantos("msg:delivered") >= 1,
          "msg:delivered",
        );
        const d = anaCel.ultimo<{ msgIds: string[] }>("msg:delivered")!;
        ok(d.msgIds.includes(primeiraMsg), "o msgId certo");
      },
    );

    await s.teste("o aviso de leitura chega a quem mandou", async () => {
      anaCel.esquecer();
      biaCel.emitir("msg:read", { to: A.nickname, msgIds: [primeiraMsg] });
      await esperarAte(() => anaCel.quantos("msg:read") >= 1, "msg:read");
      const r = anaCel.ultimo<{ from: string; msgIds: string[] }>("msg:read")!;
      igual(r.from, B.nickname, "de quem");
    });

    await s.teste(
      "LIDA CONTINUA LIDA depois de reabrir a conversa",
      async () => {
        // O defeito relatado: "saímos da conversa e entramos de novo, mensagens
        // já visualizadas aparecem como não visualizadas". Uma sincronia do zero
        // precisa devolver a marca de lida junto.
        anaPc.esquecer();
        anaPc.emitir("msg:sync", { desde: null });
        await esperarAte(
          () =>
            anaPc
              .todos<Envelope>("msg:new")
              .some((e) => e.msgId === primeiraMsg),
          "a mensagem voltou na sincronia",
        );
        const e = anaPc
          .todos<Envelope>("msg:new")
          .find((x) => x.msgId === primeiraMsg)!;
        ok(e.entregue, "perdeu a marca de entregue");
        ok(e.lida, "perdeu a marca de LIDA — era este o defeito");
      },
    );

    // -----------------------------------------------------------------------
    // Os quatro tipos de mídia
    // -----------------------------------------------------------------------

    for (const tipo of ["imagem", "audio", "video", "documento"] as const) {
      await s.teste(`mandar ${tipo}`, async () => {
        const id = randomUUID();
        // O que trafega hoje é a CHAVE no R2, e não mais o arquivo — é o que
        // tirou 1,9 MB de dentro do banco. O teste manda o formato real.
        const payload = JSON.stringify({
          chave: `teste/${id}.bin`,
          tamanho: 123456,
          nome: tipo === "documento" ? "contrato.pdf" : undefined,
        });
        biaCel.esquecer();
        anaCel.emitir("msg:send", {
          msgId: id,
          to: B.nickname,
          kind: tipo,
          payload,
        });
        await esperarAte(
          () => biaCel.todos<Envelope>("msg:new").some((e) => e.msgId === id),
          `${tipo} na Bia`,
        );
        const e = biaCel
          .todos<Envelope>("msg:new")
          .find((x) => x.msgId === id)!;
        igual(e.kind, tipo, "tipo preservado");
        igual(e.payload, payload, "payload intacto");
        biaCel.emitir("msg:ack", { msgIds: [id] });
        return `${payload.length} bytes de payload`;
      });
    }

    await s.teste("payload grande (1 MB) passa", async () => {
      const id = randomUUID();
      const payload = recheio(1_000_000);
      biaCel.esquecer();
      anaCel.esquecer();
      anaCel.emitir("msg:send", {
        msgId: id,
        to: B.nickname,
        kind: "imagem",
        payload,
      });
      await esperarAte(
        () => anaCel.quantos("msg:accepted") >= 1,
        "aceitou 1 MB",
        20000,
      );
      await esperarAte(
        () => biaCel.todos<Envelope>("msg:new").some((e) => e.msgId === id),
        "entregou 1 MB",
        20000,
      );
      const e = biaCel.todos<Envelope>("msg:new").find((x) => x.msgId === id)!;
      igual(e.payload.length, payload.length, "chegou inteiro");
      biaCel.emitir("msg:ack", { msgIds: [id] });
      return "1 MB ida e volta";
    });

    await s.teste("payload acima do teto é recusado com motivo", async () => {
      const id = randomUUID();
      anaCel.esquecer();
      anaCel.emitir("msg:send", {
        msgId: id,
        to: B.nickname,
        kind: "imagem",
        payload: recheio(2_100_000),
      });
      await esperarAte(
        () => anaCel.quantos("msg:failed") >= 1,
        "msg:failed",
        20000,
      );
      const f = anaCel.ultimo<{ msgId: string; code: string }>("msg:failed")!;
      igual(f.code, "GRANDE_DEMAIS", "motivo");
    });

    // -----------------------------------------------------------------------
    // Recusas e portas fechadas
    // -----------------------------------------------------------------------

    await s.teste("mandar para quem não existe falha com motivo", async () => {
      const id = randomUUID();
      anaCel.esquecer();
      anaCel.emitir("msg:send", {
        msgId: id,
        to: "naoexisteninguem",
        kind: "texto",
        payload: "oi",
      });
      await esperarAte(() => anaCel.quantos("msg:failed") >= 1, "msg:failed");
      igual(
        anaCel.ultimo<{ code: string }>("msg:failed")!.code,
        "SEM_DESTINATARIO",
        "motivo",
      );
    });

    await s.teste(
      "tipo inventado é ignorado, e não derruba a conexão",
      async () => {
        anaCel.esquecer();
        anaCel.emitir("msg:send", {
          msgId: randomUUID(),
          to: B.nickname,
          kind: "telepatia",
          payload: "oi",
        });
        await pausa(1200);
        igual(anaCel.quantos("msg:accepted"), 0, "não aceitou");
        ok(anaCel.ligado, "a conexão sobreviveu");
      },
    );

    await s.teste("quem fechou a porta não recebe de estranho", async () => {
      const carla = await criarConta(base, "carla");
      s.aoFinal(() => apagarConta(carla.id));
      const carlaCel = await abrir(carla, "carla");

      // A Bia fecha a porta para quem ela não conhece.
      const r = await B.cliente.post("/api/users/aberto", { aberto: false });
      igual(r.status, 200, "fechou a porta");

      const id = randomUUID();
      carlaCel.esquecer();
      carlaCel.emitir("msg:send", {
        msgId: id,
        to: B.nickname,
        kind: "texto",
        payload: "oi",
      });
      await esperarAte(() => carlaCel.quantos("msg:failed") >= 1, "msg:failed");
      igual(
        carlaCel.ultimo<{ code: string }>("msg:failed")!.code,
        "NAO_ACEITA",
        "motivo",
      );
    });

    await s.teste(
      "mas quem JÁ conversou continua conversando com a porta fechada",
      async () => {
        // A porta fechada da Bia (do teste acima) não pode calar a Ana, que já
        // conversou com ela. Fechar uma conversa existente é outra coisa — é o
        // bloqueio, e ele é explícito.
        const id = randomUUID();
        anaCel.esquecer();
        anaCel.emitir("msg:send", {
          msgId: id,
          to: B.nickname,
          kind: "texto",
          payload: "ainda dá para falar?",
        });
        await esperarAte(
          () => anaCel.quantos("msg:accepted") >= 1,
          "msg:accepted",
        );
        igual(anaCel.quantos("msg:failed"), 0, "não falhou");
        await B.cliente.post("/api/users/aberto", { aberto: true });
      },
    );

    await s.teste(
      "bloquear pelo NICKNAME grava o bloqueio de conta",
      async () => {
        /*
         * Este teste nasceu de um defeito achado por ele mesmo: `bloquearConta`
         * não era chamada por nada no projeto inteiro. O evento recebia o
         * `targetNickname` e o descartava, gravando só o bloqueio do NAVEGADOR —
         * que a caixa postal não consulta e que a outra pessoa desfaz trocando
         * de aparelho. A tela dizia "Pessoa bloqueada" e as mensagens seguiam
         * chegando.
         */
        biaCel.emitir("block", {
          targetClientId: "sem-cliente",
          targetNickname: A.nickname,
        });
        await esperarAte(async () => {
          const l = (await sql`
          select 1 from user_blocks
           where blocker_user_id = ${B.id}::uuid and blocked_user_id = ${A.id}::uuid`) as unknown[];
          return l.length > 0;
        }, "o bloqueio no banco");

        const id = randomUUID();
        anaCel.esquecer();
        biaCel.esquecer();
        anaCel.emitir("msg:send", {
          msgId: id,
          to: B.nickname,
          kind: "texto",
          payload: "consegue me ouvir?",
        });
        await esperarAte(() => anaCel.quantos("msg:failed") >= 1, "msg:failed");
        igual(
          anaCel.ultimo<{ code: string }>("msg:failed")!.code,
          "BLOQUEADO",
          "motivo",
        );
        igual(biaCel.quantos("msg:new"), 0, "não chegou nada na Bia");

        await sql`delete from user_blocks
                 where blocker_user_id = ${B.id}::uuid and blocked_user_id = ${A.id}::uuid`;
      },
    );

    // -----------------------------------------------------------------------
    // Reenvio, offline e digitação
    // -----------------------------------------------------------------------

    await s.teste(
      "a mesma mensagem mandada duas vezes é guardada uma vez",
      async () => {
        const id = randomUUID();
        biaCel.esquecer();
        anaCel.esquecer();
        const enviar = () =>
          anaCel.emitir("msg:send", {
            msgId: id,
            to: B.nickname,
            kind: "texto",
            payload: "a rede caiu no meio",
          });
        enviar();
        await esperarAte(
          () => anaCel.quantos("msg:accepted") >= 1,
          "primeiro aceite",
        );
        enviar();
        await esperarAte(
          () => anaCel.quantos("msg:accepted") >= 2,
          "segundo aceite",
        );
        await pausa(1500);
        const chegadas = biaCel
          .todos<Envelope>("msg:new")
          .filter((e) => e.msgId === id);
        igual(chegadas.length, 1, "entregas");
        biaCel.emitir("msg:ack", { msgIds: [id] });
        return "dois aceites, uma entrega";
      },
    );

    await s.teste(
      "mensagem para quem está offline espera e é entregue depois",
      async () => {
        biaCel.desligar();
        await esperarAte(() => !biaCel.ligado, "a Bia saiu");
        await pausa(500);

        const id = randomUUID();
        anaCel.esquecer();
        anaCel.emitir("msg:send", {
          msgId: id,
          to: B.nickname,
          kind: "texto",
          payload: "mandei com você offline",
        });
        await esperarAte(
          () => anaCel.quantos("msg:accepted") >= 1,
          "aceitou mesmo offline",
        );

        const biaVolta = await abrir(B, "bia/voltou");
        biaVolta.emitir("msg:sync", { desde: null });
        await esperarAte(
          () => biaVolta.todos<Envelope>("msg:new").some((e) => e.msgId === id),
          "a mensagem estava esperando",
        );
        biaVolta.emitir("msg:ack", { msgIds: [id] });
        return "guardada e entregue na volta";
      },
    );

    await s.teste('"digitando" chega ao vivo e NÃO é guardado', async () => {
      const biaAgora = aparelhos.find((a) => a.apelido === "bia/voltou")!;
      biaAgora.esquecer();
      anaCel.emitir("msg:typing", { to: B.nickname, typing: true });
      await esperarAte(
        () => biaAgora.quantos("msg:typing") >= 1,
        "msg:typing ao vivo",
      );
      const t = biaAgora.ultimo<{ from: string; typing: boolean }>(
        "msg:typing",
      )!;
      igual(t.from, A.nickname, "de quem");
      igual(t.typing, true, "estava digitando");

      // Agora com o outro lado fora: o aviso tem de se perder, e não esperar.
      biaAgora.desligar();
      await pausa(400);
      anaCel.emitir("msg:typing", { to: B.nickname, typing: true });
      await pausa(800);

      const biaNova = await abrir(B, "bia/terceira");
      biaNova.emitir("msg:sync", { desde: null });
      await pausa(1500);
      igual(
        biaNova.quantos("msg:typing"),
        0,
        "um aviso de digitação velho chegou",
      );
    });

    await s.teste(
      "a sincronia por corte só traz o que veio depois",
      async () => {
        const biaAgora = aparelhos.find((a) => a.apelido === "bia/terceira")!;

        /*
         * O CORTE VEM DO RELÓGIO DO SERVIDOR, e não do desta máquina.
         *
         * É o que o aplicativo faz — `guardarCorte` só recebe o `sentAt` que
         * veio de fora —, e escrever o teste de outro jeito custou uma
         * investigação: o relógio desta máquina estava três minutos atrasado em
         * relação ao banco, e um corte local fazia toda mensagem dos últimos
         * minutos parecer mais nova que ele.
         */
        const marcador = randomUUID();
        anaCel.esquecer();
        anaCel.emitir("msg:send", {
          msgId: marcador,
          to: B.nickname,
          kind: "texto",
          payload: "marco do corte",
        });
        await esperarAte(
          () => anaCel.quantos("msg:accepted") >= 1,
          "o marco foi aceito",
        );
        const corte = anaCel.ultimo<{ sentAt: string }>("msg:accepted")!.sentAt;
        biaAgora.emitir("msg:ack", { msgIds: [marcador] });
        await pausa(1100);

        const id = randomUUID();
        biaAgora.esquecer();
        anaCel.emitir("msg:send", {
          msgId: id,
          to: B.nickname,
          kind: "texto",
          payload: "esta é depois do corte",
        });
        await esperarAte(
          () => biaAgora.todos<Envelope>("msg:new").some((e) => e.msgId === id),
          "a nova chegou ao vivo",
        );

        biaAgora.esquecer();
        biaAgora.emitir("msg:sync", { desde: corte });
        await pausa(2000);
        const vindas = biaAgora.todos<Envelope>("msg:new");

        /*
         * O CONTRATO TEM DUAS PARTES, e a segunda não é defeito.
         *
         * Vem tudo o que é mais novo que o corte — e TAMBÉM o que nenhum
         * aparelho confirmou ainda, por mais velho que seja. A segunda metade
         * existe para o caso de a entrega ao vivo se perder num soluço de rede
         * enquanto o aparelho segue conectado: o corte avançaria por cima da
         * mensagem perdida e ela nunca mais voltaria.
         *
         * Este teste afirma as duas: nada que já foi confirmado e é anterior ao
         * corte pode reaparecer.
         */
        const velhasJaEntregues = vindas.filter(
          (e) => Date.parse(e.sentAt) < Date.parse(corte) - 1000 && e.entregue,
        );
        igual(
          velhasJaEntregues.length,
          0,
          "reapareceu mensagem velha já entregue",
        );
        ok(
          vindas.some((e) => e.msgId === id),
          "a mensagem nova não veio",
        );

        const pendentes = vindas.filter(
          (e) => Date.parse(e.sentAt) < Date.parse(corte) - 1000,
        );
        return `${vindas.length} vindas: 1 nova + ${pendentes.length} ainda não confirmada(s)`;
      },
    );

    await s.teste(
      "denunciar FICA GRAVADO, e nao so' num contador",
      async () => {
        /*
         * A tabela de denuncias existia, a funcao que escreve nela existia, e
         * nada no projeto inteiro a chamava: o handler somava um contador em
         * memoria, que morre a cada reinicio do processo. Quem denunciava lia
         * "denuncia registrada" na tela e nao havia registro nenhum — nao havia
         * o que moderar.
         */
        const antes = (await sql`
        select count(*)::int as n from policy_reports
         where target_user_id = ${B.id}::uuid`) as { n: number }[];

        anaCel.emitir("report", {
          targetClientId: "sem-cliente",
          targetNickname: B.nickname,
          reason: "teste automatizado de moderacao",
        });

        await esperarAte(async () => {
          const agora = (await sql`
          select count(*)::int as n from policy_reports
           where target_user_id = ${B.id}::uuid`) as { n: number }[];
          return agora[0]!.n > antes[0]!.n;
        }, "a denuncia no banco");

        const [linha] = (await sql`
        select reason, reporter_client_id from policy_reports
         where target_user_id = ${B.id}::uuid
         order by created_at desc limit 1`) as {
          reason: string;
          reporter_client_id: string | null;
        }[];
        igual(
          linha!.reason,
          "teste automatizado de moderacao",
          "o motivo escrito",
        );

        // Denunciar implica nao querer mais contato: o bloqueio de CONTA vem
        // junto, senao a pessoa denuncia e continua recebendo mensagem.
        await esperarAte(async () => {
          const b = (await sql`
          select 1 from user_blocks
           where blocker_user_id = ${A.id}::uuid
             and blocked_user_id = ${B.id}::uuid`) as unknown[];
          return b.length > 0;
        }, "o bloqueio que acompanha a denuncia");

        await sql`delete from policy_reports where target_user_id = ${B.id}::uuid`;
        await sql`delete from user_blocks
                 where blocker_user_id = ${A.id}::uuid and blocked_user_id = ${B.id}::uuid`;
        return "gravada, com bloqueio de conta junto";
      },
    );

    await s.teste("sem conta não se entra no tempo real", async () => {
      const { Conta } = await import("./cliente");
      const anonimo = new Conta(base, "anonimo");
      const r = await anonimo.get("/api/realtime/token");
      igual(r.status, 401, "o crachá foi negado");
    });
  } finally {
    await s.limpar();
  }

  return s;
}
