"use client";

import { useEffect } from "react";

/**
 * O que a pessoa vê quando alguma coisa quebra.
 *
 * O QUE HAVIA ANTES: nada. Sem este arquivo, o Next mostra a página dele —
 * "erro de aplicação", fundo branco, sem botão. Para quem está usando, o app
 * simplesmente morreu; para quem precisa consertar, a mensagem não diz nada.
 * Foi exatamente assim que a falha da aba Mundo apareceu, e foi por isso que
 * não deu para saber o que era.
 *
 * O QUE ACONTECE AGORA, nesta ordem de importância:
 *
 * 1. A PESSOA NÃO PERDE O APP. Um botão recarrega a parte que quebrou sem
 *    recarregar a página inteira. Na maioria das falhas — uma resposta
 *    estranha, uma corrida entre dois pedidos — a segunda tentativa funciona.
 *
 * 2. O ERRO DIZ O NOME DELE. A mensagem fica visível, e dá para copiar. Uma
 *    captura de tela do celular de alguém passa a valer um relatório.
 *
 * 3. ELE CHEGA ATÉ MIM. O relato vai para o servidor e aparece nos registros
 *    do Vercel, com a página e o aparelho. Sem isto, só sabemos de uma falha
 *    quando a pessoa resolve contar — e quase ninguém conta: fecha e não
 *    volta.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /*
     * `digest` é o identificador que o Next gera em produção, onde a mensagem
     * real some por segurança. É ele que liga o que a pessoa viu ao que está
     * no registro do servidor.
     */
    try {
      void fetch("/api/erro-do-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagem: String(error?.message ?? "").slice(0, 500),
          digest: error?.digest ?? null,
          pilha: String(error?.stack ?? "").slice(0, 2000),
          onde: typeof location !== "undefined" ? location.pathname : null,
          tela:
            typeof window !== "undefined"
              ? `${window.innerWidth}x${window.innerHeight}`
              : null,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* se nem isto deu, não há mais o que fazer aqui */
    }
  }, [error]);

  const detalhe = error?.digest
    ? `${error.message} (${error.digest})`
    : error?.message || "sem mensagem";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center">
      <p className="text-[17px] font-semibold text-white">
        Alguma coisa quebrou aqui.
      </p>
      <p className="max-w-sm text-[13px] leading-snug text-white/55">
        Não foi você. Tente de novo — quase sempre funciona na segunda. Se
        voltar a acontecer, me mande esta tela.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
        >
          Tentar de novo
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/";
          }}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/20"
        >
          Voltar ao globo
        </button>
      </div>

      {/*
        A MENSAGEM FICA VISÍVEL, em letra pequena. Ela não é para a pessoa
        entender — é para ela conseguir fotografar e mandar.
      */}
      <p className="mt-2 max-w-sm break-words font-mono text-[10px] leading-snug text-white/30">
        {detalhe}
      </p>
    </div>
  );
}
