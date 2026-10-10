"use client";

/**
 * A última rede: quando quebra o próprio layout, `error.tsx` não roda.
 *
 * Este arquivo é obrigado a desenhar `<html>` e `<body>` porque, neste ponto,
 * nem eles existem. É feio de propósito — sem fonte, sem Tailwind, nada que
 * possa depender do que acabou de falhar. O que ele promete é só isto: a
 * pessoa vê uma frase em português e um botão, em vez de uma tela branca.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          background: "#020617",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
          O app não conseguiu abrir.
        </p>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.55)",
            margin: 0,
            maxWidth: 360,
            lineHeight: 1.4,
          }}
        >
          Tente de novo. Se continuar, me mande esta tela.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: 0,
            borderRadius: 12,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            background: "#0891b2",
          }}
        >
          Tentar de novo
        </button>
        <p
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
            maxWidth: 360,
            wordBreak: "break-word",
            margin: 0,
          }}
        >
          {error?.digest ? `${error.message} (${error.digest})` : error?.message}
        </p>
      </body>
    </html>
  );
}
