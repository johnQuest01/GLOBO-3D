/**
 * O arnês que todas as suítes usam.
 *
 * É pequeno de propósito. A alternativa seria trazer um Jest ou um Vitest, e o
 * que este projeto precisa testar não é o que essas ferramentas facilitam:
 * quase tudo aqui é conversa entre processos — um servidor de socket em outra
 * máquina, um banco em outra nuvem, um armazenamento de objetos em uma
 * terceira. O valor está em exercitar isso de verdade, e para isso um `try`, um
 * contador e um relógio bastam.
 *
 * TESTES QUE TOCAM PRODUÇÃO limpam o que criaram, sempre, inclusive quando
 * falham no meio — é para isso que serve o `aoFinal`. Um teste que deixa lixo
 * para trás envenena a próxima execução, e aí ninguém confia mais no relatório.
 */

export interface Resultado {
  suite: string;
  nome: string;
  passou: boolean;
  erro?: string;
  ms: number;
  /** Uma linha de observação: número medido, tamanho, latência. */
  nota?: string;
}

const AZUL = "\x1b[36m";
const VERDE = "\x1b[32m";
const VERMELHO = "\x1b[31m";
const CINZA = "\x1b[90m";
const FIM = "\x1b[0m";

export class Suite {
  readonly resultados: Resultado[] = [];
  private limpezas: (() => Promise<void> | void)[] = [];

  constructor(readonly nome: string) {
    console.log(`\n${AZUL}=== ${nome} ===${FIM}`);
  }

  /** Roda ao final da suíte, na ordem inversa — falhando ou não. */
  aoFinal(fn: () => Promise<void> | void): void {
    this.limpezas.push(fn);
  }

  async teste(
    nome: string,
    fn: () => Promise<string | void> | string | void,
  ): Promise<void> {
    const comecou = Date.now();
    try {
      const nota = await fn();
      const ms = Date.now() - comecou;
      this.resultados.push({
        suite: this.nome,
        nome,
        passou: true,
        ms,
        nota: nota || undefined,
      });
      console.log(
        `  ${VERDE}ok${FIM}  ${nome} ${CINZA}${ms}ms${FIM}${nota ? `\n        ${CINZA}${nota}${FIM}` : ""}`,
      );
    } catch (e) {
      const ms = Date.now() - comecou;
      const erro = e instanceof Error ? e.message : String(e);
      this.resultados.push({ suite: this.nome, nome, passou: false, erro, ms });
      console.log(`  ${VERMELHO}FALHOU${FIM}  ${nome} ${CINZA}${ms}ms${FIM}`);
      console.log(`          ${VERMELHO}${erro}${FIM}`);
    }
  }

  /** Chame sempre — de dentro de um `finally`. */
  async limpar(): Promise<void> {
    for (const fn of this.limpezas.reverse()) {
      try {
        await fn();
      } catch (e) {
        console.log(
          `  ${VERMELHO}(limpeza falhou: ${e instanceof Error ? e.message : String(e)})${FIM}`,
        );
      }
    }
    this.limpezas = [];
  }
}

// ---------------------------------------------------------------------------
// Afirmações
// ---------------------------------------------------------------------------

export function ok(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}

export function igual<T>(achado: T, esperado: T, oQue: string): void {
  if (achado !== esperado) {
    throw new Error(
      `${oQue}: esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(achado)}`,
    );
  }
}

export function diferente<T>(achado: T, proibido: T, oQue: string): void {
  if (achado === proibido)
    throw new Error(`${oQue}: não devia ser ${JSON.stringify(proibido)}`);
}

/**
 * Espera uma condição acontecer, ou desiste.
 *
 * Testar coisa assíncrona com `sleep` de tempo fixo produz duas doenças ao
 * mesmo tempo: lentidão quando o sistema responde rápido e falha intermitente
 * quando ele demora um pouco mais. Perguntar em intervalos curtos até o prazo
 * acabar não tem nenhuma das duas.
 */
export async function esperarAte(
  condicao: () => boolean | Promise<boolean>,
  oQue: string,
  prazoMs = 8000,
): Promise<void> {
  const limite = Date.now() + prazoMs;
  while (Date.now() < limite) {
    if (await condicao()) return;
    await pausa(50);
  }
  throw new Error(`${oQue}: não aconteceu em ${prazoMs}ms`);
}

export const pausa = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

export function relatorio(todos: Resultado[]): boolean {
  const falhas = todos.filter((r) => !r.passou);
  const porSuite = new Map<string, Resultado[]>();
  for (const r of todos)
    porSuite.set(r.suite, [...(porSuite.get(r.suite) ?? []), r]);

  console.log(`\n${AZUL}${"=".repeat(64)}${FIM}`);
  console.log(`${AZUL}RELATÓRIO${FIM}\n`);

  for (const [suite, rs] of porSuite) {
    const bons = rs.filter((r) => r.passou).length;
    const cor = bons === rs.length ? VERDE : VERMELHO;
    const ms = rs.reduce((s, r) => s + r.ms, 0);
    console.log(
      `  ${cor}${String(bons).padStart(3)}/${String(rs.length).padEnd(3)}${FIM} ${suite.padEnd(34)} ${CINZA}${ms}ms${FIM}`,
    );
  }

  if (falhas.length > 0) {
    console.log(`\n${VERMELHO}O que falhou:${FIM}`);
    for (const f of falhas) {
      console.log(`  ${VERMELHO}·${FIM} ${f.suite} / ${f.nome}`);
      console.log(`    ${CINZA}${f.erro}${FIM}`);
    }
  }

  const bons = todos.length - falhas.length;
  const cor = falhas.length === 0 ? VERDE : VERMELHO;
  console.log(`\n${cor}${bons} de ${todos.length} passaram${FIM}`);
  console.log(`${AZUL}${"=".repeat(64)}${FIM}\n`);

  return falhas.length === 0;
}
