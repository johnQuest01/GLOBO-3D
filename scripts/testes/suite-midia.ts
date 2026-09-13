/**
 * A mídia: subir o arquivo, buscar de volta, e quem tem direito a quê.
 *
 * ESTA SUÍTE SOBE BYTES DE VERDADE PARA O R2. Não há dublê, e não poderia
 * haver: o que se está testando é uma assinatura AWS SigV4 escrita à mão contra
 * um serviço da Cloudflare. Um dublê confirmaria que a nossa assinatura é igual
 * à nossa ideia de assinatura, que é a única coisa que não interessa saber.
 *
 * O DESENHO QUE ELA CONFERE. Os bytes não passam pelo servidor do aplicativo:
 * ele só assina uma permissão temporária e o navegador fala direto com o
 * armazenamento. Isso tem duas consequências que são justamente o que os testes
 * perseguem — a permissão precisa funcionar de fora, e precisa parar de
 * funcionar depois.
 *
 * E O QUE PROTEGE O ARQUIVO É O NOME DELE: 24 bytes sorteados que só viajam
 * dentro do envelope da mensagem. Por isso há um teste que tenta adivinhar
 * chave, e outro que tenta sair da pasta com `..`.
 */

import { createHash, randomBytes } from "node:crypto";

import { Suite, igual, ok } from "./arnes";
import { ContaDeTeste, apagarConta, criarConta } from "./contas";

interface RespostaEnvio {
  ok: boolean;
  chave?: string;
  envio?: string;
  reason?: string;
}

const soma = (b: Buffer | Uint8Array) =>
  createHash("sha256").update(b).digest("hex").slice(0, 16);

/** Um PNG de 1x1 de verdade, para quando o tipo precisa ser plausível. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function suiteMidia(base: string): Promise<Suite> {
  const s = new Suite("mídia — R2, assinatura e permissão");

  let conta: ContaDeTeste | null = null;

  try {
    conta = await criarConta(base, "midia");
    const c = conta;
    s.aoFinal(() => apagarConta(c.id));

    /** O ciclo inteiro de um arquivo: pedir, subir, pedir de volta, baixar. */
    const idaEVolta = async (mime: string, bytes: Buffer) => {
      const pedido = await c.cliente.post<RespostaEnvio>("/api/midia", {
        mime,
        bytes: bytes.length,
      });
      if (pedido.status !== 200 || !pedido.corpo.envio || !pedido.corpo.chave) {
        throw new Error(
          `nao assinou o envio: ${pedido.status} ${pedido.corpo.reason ?? ""}`,
        );
      }

      const subida = await fetch(pedido.corpo.envio, {
        method: "PUT",
        body: new Uint8Array(bytes),
        headers: { "content-type": mime },
      });
      if (!subida.ok) {
        throw new Error(
          `o R2 recusou o envio: ${subida.status} ${(await subida.text()).slice(0, 200)}`,
        );
      }

      const leitura = await c.cliente.get<{ ok: boolean; url?: string }>(
        `/api/midia?chave=${encodeURIComponent(pedido.corpo.chave)}`,
      );
      if (leitura.status !== 200 || !leitura.corpo.url) {
        throw new Error(`nao assinou a leitura: ${leitura.status}`);
      }

      const baixado = await fetch(leitura.corpo.url);
      if (!baixado.ok)
        throw new Error(`o R2 recusou a leitura: ${baixado.status}`);
      const voltou = Buffer.from(await baixado.arrayBuffer());

      return { chave: pedido.corpo.chave, voltou, envio: pedido.corpo.envio };
    };

    // -----------------------------------------------------------------------
    // Os bytes voltam iguais
    // -----------------------------------------------------------------------

    await s.teste("foto: sobe e volta byte a byte", async () => {
      const { voltou } = await idaEVolta("image/png", PNG_1X1);
      igual(soma(voltou), soma(PNG_1X1), "a soma dos bytes");
      return `${PNG_1X1.length} bytes, sha ${soma(PNG_1X1)}`;
    });

    await s.teste("áudio de 1 MB: sobe e volta inteiro", async () => {
      const audio = randomBytes(1024 * 1024);
      const { voltou } = await idaEVolta("audio/webm", audio);
      igual(voltou.length, audio.length, "tamanho");
      igual(soma(voltou), soma(audio), "a soma dos bytes");
      return "1 MB aleatório, ida e volta idêntica";
    });

    await s.teste("vídeo de 5 MB: sobe e volta inteiro", async () => {
      const video = randomBytes(5 * 1024 * 1024);
      const comecou = Date.now();
      const { voltou } = await idaEVolta("video/mp4", video);
      igual(soma(voltou), soma(video), "a soma dos bytes");
      return `5 MB em ${Date.now() - comecou}ms`;
    });

    await s.teste("documento: um PDF passa", async () => {
      const pdf = Buffer.concat([
        Buffer.from("%PDF-1.4\n"),
        randomBytes(2048),
        Buffer.from("\n%%EOF\n"),
      ]);
      const { voltou, chave } = await idaEVolta("application/pdf", pdf);
      igual(soma(voltou), soma(pdf), "a soma dos bytes");
      ok(chave.endsWith(".pdf"), `a extensão veio do tipo: ${chave}`);
    });

    // -----------------------------------------------------------------------
    // O que NÃO pode subir
    // -----------------------------------------------------------------------

    await s.teste("executável é recusado", async () => {
      for (const mime of [
        "application/x-msdownload",
        "application/octet-stream",
        "application/x-sh",
        "text/html",
      ]) {
        const r = await c.cliente.post<RespostaEnvio>("/api/midia", {
          mime,
          bytes: 100,
        });
        igual(r.status, 400, `recusou ${mime}`);
        igual(r.corpo.reason, "tipo-nao-aceito", "motivo");
      }
      return "4 tipos perigosos recusados";
    });

    await s.teste(
      "arquivo acima de 25 MB é recusado antes de subir",
      async () => {
        const r = await c.cliente.post<RespostaEnvio>("/api/midia", {
          mime: "video/mp4",
          bytes: 30 * 1024 * 1024,
        });
        igual(r.status, 400, "status");
        igual(r.corpo.reason, "tamanho", "motivo");
      },
    );

    await s.teste(
      "tamanho zero, negativo ou não-numérico é recusado",
      async () => {
        for (const bytes of [0, -5, "muitos", null, NaN]) {
          const r = await c.cliente.post<RespostaEnvio>("/api/midia", {
            mime: "image/png",
            bytes,
          });
          igual(r.status, 400, `recusou bytes=${String(bytes)}`);
        }
      },
    );

    // -----------------------------------------------------------------------
    // Quem pode pedir permissão
    // -----------------------------------------------------------------------

    await s.teste("sem sessão não se assina nada", async () => {
      const { Conta } = await import("./cliente");
      const anonimo = new Conta(base, "anonimo");
      const envio = await anonimo.post("/api/midia", {
        mime: "image/png",
        bytes: 100,
      });
      igual(envio.status, 401, "envio");
      const leitura = await anonimo.get(
        "/api/midia?chave=m/2026-01-01/aaaaaaaaaaaaaaaaaaaaaaaa.png",
      );
      igual(leitura.status, 401, "leitura");
    });

    await s.teste(
      "chave fora do formato é recusada (inclusive com ..)",
      async () => {
        for (const chave of [
          "../../etc/senha",
          "m/2026-01-01/../../outro.png",
          "outro-lugar/arquivo.png",
          "m/2026-01-01/curta.png",
          "",
        ]) {
          const r = await c.cliente.get<{ reason?: string }>(
            `/api/midia?chave=${encodeURIComponent(chave)}`,
          );
          igual(r.status, 400, `recusou "${chave}"`);
        }
        return "5 caminhos recusados";
      },
    );

    await s.teste("chave sorteada não é adivinhável", async () => {
      const a = await c.cliente.post<RespostaEnvio>("/api/midia", {
        mime: "image/png",
        bytes: 100,
      });
      const b = await c.cliente.post<RespostaEnvio>("/api/midia", {
        mime: "image/png",
        bytes: 100,
      });
      const nomeA = a.corpo.chave!.split("/").pop()!.split(".")[0]!;
      const nomeB = b.corpo.chave!.split("/").pop()!.split(".")[0]!;
      ok(nomeA !== nomeB, "duas chaves iguais");
      ok(nomeA.length >= 20, `nome curto demais: ${nomeA.length} caracteres`);
      return `${nomeA.length} caracteres sorteados por arquivo`;
    });

    // -----------------------------------------------------------------------
    // A permissão vence
    // -----------------------------------------------------------------------

    await s.teste("uma assinatura adulterada é recusada pelo R2", async () => {
      const pedido = await c.cliente.post<RespostaEnvio>("/api/midia", {
        mime: "image/png",
        bytes: PNG_1X1.length,
      });
      const url = new URL(pedido.corpo.envio!);
      // Troca um caractere da assinatura: o R2 é quem precisa recusar, não nós.
      const assinatura = url.searchParams.get("X-Amz-Signature")!;
      url.searchParams.set(
        "X-Amz-Signature",
        assinatura.slice(0, -1) + (assinatura.endsWith("a") ? "b" : "a"),
      );

      const r = await fetch(url.toString(), {
        method: "PUT",
        body: new Uint8Array(PNG_1X1),
      });
      ok(!r.ok, `o R2 aceitou uma assinatura falsa (${r.status})`);
      return `recusado com ${r.status}`;
    });

    await s.teste("a permissão de envio não serve para APAGAR", async () => {
      const pedido = await c.cliente.post<RespostaEnvio>("/api/midia", {
        mime: "image/png",
        bytes: PNG_1X1.length,
      });
      await fetch(pedido.corpo.envio!, {
        method: "PUT",
        body: new Uint8Array(PNG_1X1),
      });

      // A mesma URL assinada, com outro verbo. A assinatura inclui o método,
      // então isto tem de falhar — senão qualquer permissão de envio seria
      // também uma permissão de destruição.
      const r = await fetch(pedido.corpo.envio!, { method: "DELETE" });
      ok(!r.ok, `apagou com uma permissão de envio (${r.status})`);
      return `recusado com ${r.status}`;
    });

    await s.teste(
      "a permissão de leitura não serve para ESCREVER",
      async () => {
        const { chave } = await idaEVolta("image/png", PNG_1X1);
        const leitura = await c.cliente.get<{ url: string }>(
          `/api/midia?chave=${encodeURIComponent(chave)}`,
        );
        const r = await fetch(leitura.corpo.url, {
          method: "PUT",
          body: new Uint8Array(randomBytes(64)),
        });
        ok(!r.ok, `escreveu com uma permissão de leitura (${r.status})`);

        // E o arquivo continua o que era.
        const conferir = await fetch(leitura.corpo.url);
        igual(
          soma(Buffer.from(await conferir.arrayBuffer())),
          soma(PNG_1X1),
          "o conteúdo",
        );
        return `recusado com ${r.status}, conteúdo intacto`;
      },
    );

    await s.teste("o bucket não pode ser listado", async () => {
      // Se listar fosse possível, o sorteio da chave não protegeria nada.
      const pedido = await c.cliente.post<RespostaEnvio>("/api/midia", {
        mime: "image/png",
        bytes: 10,
      });
      const raiz = new URL(pedido.corpo.envio!);
      raiz.pathname = raiz.pathname.split("/").slice(0, 2).join("/") + "/";
      const r = await fetch(raiz.toString(), { method: "GET" });
      const texto = await r.text();
      ok(
        !r.ok || !texto.includes("<ListBucketResult"),
        "o bucket respondeu uma listagem",
      );
      return `listagem recusada (${r.status})`;
    });
  } finally {
    await s.limpar();
  }

  return s;
}
