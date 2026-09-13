/**
 * Contas descartáveis para os testes.
 *
 * ELAS SÃO CRIADAS E APAGADAS A CADA EXECUÇÃO, e isso não é capricho: o banco
 * destes testes é o de produção. Uma conta de teste esquecida lá vira uma
 * pessoa falsa que aparece no globo, entra nas recomendações e recebe convite
 * de gente de verdade.
 *
 * O PREFIXO `zzt_` EXISTE PARA A FAXINA DE EMERGÊNCIA: se uma execução for
 * interrompida no meio (Ctrl+C, queda de rede), sobram contas órfãs, e é
 * preciso conseguir achá-las depois sem adivinhar nomes. Ver `faxina()`.
 *
 * A SENHA É SORTEADA A CADA VEZ e não é escrita em lugar nenhum. Senha fixa em
 * arquivo de teste acaba, sempre, virando uma conta de verdade com senha
 * pública.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";

import { Conta } from "./cliente";

/** Curto porque o nickname só aceita 20 caracteres, e ainda cabe o sorteio. */
export const PREFIXO = "zzt_";

/** Uma variável do `.env.local`, ou string vazia. */
function doEnv(chave: string): string {
  const linha = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${chave}=`));
  return linha
    ? linha
        .slice(chave.length + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "")
    : "";
}

const DATABASE_URL = doEnv("DATABASE_URL");
if (!DATABASE_URL) throw new Error("sem DATABASE_URL em .env.local");

export const sql = neon(DATABASE_URL);

/**
 * As credenciais de administrador.
 *
 * SÃO PRECISAS PARA TESTAR A MODERAÇÃO PELA PORTA DE VERDADE. A alternativa —
 * chamar a função do banco direto — testaria a regra e pularia justamente a
 * parte que decide quem pode aplicá-la, que num painel com poder de tirar post
 * do ar é a metade que importa.
 *
 * Devolve nulo quando não estão configuradas, e aí a suíte diz isso em vez de
 * falhar de um jeito que parece defeito do aplicativo.
 */
export function credenciaisDeAdmin(): { email: string; senha: string } | null {
  const email = doEnv("ADMIN_EMAIL");
  const senha = doEnv("ADMIN_PASSWORD");
  return email && senha ? { email, senha } : null;
}

export interface ContaDeTeste {
  cliente: Conta;
  nickname: string;
  email: string;
  senha: string;
  id: string;
}

export interface Lugar {
  country: string;
  state?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

const SAO_PAULO: Lugar = {
  country: "Brasil",
  state: "São Paulo",
  city: "São Paulo",
  lat: -23.55,
  lon: -46.63,
};

/** Cria a conta pelo cadastro de verdade — a mesma porta que uma pessoa usa. */
export async function criarConta(
  base: string,
  apelido: string,
  lugar: Lugar = SAO_PAULO,
): Promise<ContaDeTeste> {
  const sufixo = randomBytes(3).toString("hex");
  // O nickname tem teto de 20 caracteres, e o apelido é o que cede espaço: o
  // sorteio precisa sobreviver inteiro, senão duas execuções simultâneas
  // colidem e a segunda falha sem motivo aparente.
  const nickname = `${PREFIXO}${apelido.slice(0, 19 - PREFIXO.length - sufixo.length)}_${sufixo}`;
  const email = `${nickname}@exemplo-teste.invalid`;
  const senha = `T${randomUUID()}!9`;

  const cliente = new Conta(base, apelido);
  const r = await cliente.post("/api/auth/register", {
    email,
    password: senha,
    confirmPassword: senha,
    fullName: `Teste ${apelido}`,
    nickname,
    ...lugar,
  });

  if (r.status !== 200) {
    throw new Error(
      `nao consegui criar a conta ${apelido}: ${r.status} ${JSON.stringify(r.corpo).slice(0, 300)}`,
    );
  }

  const linhas = (await sql`
    select id from users where lower(nickname) = ${nickname.toLowerCase()} limit 1`) as {
    id: string;
  }[];
  if (!linhas[0]) throw new Error(`a conta ${nickname} nao apareceu no banco`);

  return { cliente, nickname, email, senha, id: linhas[0].id };
}

/**
 * Apaga a conta e tudo que ela gerou.
 *
 * A ORDEM IMPORTA por causa das chaves estrangeiras, e as tabelas filhas são
 * apagadas uma a uma em vez de confiar num `on delete cascade`: nem todas o
 * têm, e descobrir isso no meio de uma faxina deixa metade do lixo para trás.
 */
export async function apagarConta(id: string): Promise<void> {
  await sql`delete from post_reports where reporter_id = ${id}::uuid`;
  await sql`delete from posts where author_id = ${id}::uuid`;
  await sql`delete from envelopes where from_user_id = ${id}::uuid or to_user_id = ${id}::uuid`;
  await sql`delete from user_blocks where blocker_user_id = ${id}::uuid or blocked_user_id = ${id}::uuid`;
  await sql`delete from policy_reports where target_user_id = ${id}::uuid`;
  await sql`delete from push_subscriptions where user_id = ${id}::uuid`;
  await sql`delete from sessions where user_id = ${id}::uuid`;
  await sql`delete from users where id = ${id}::uuid`;
}

/** Para quando uma execução foi interrompida e deixou contas para trás. */
export async function faxina(): Promise<number> {
  const linhas = (await sql`
    select id, nickname from users where nickname like ${PREFIXO + "%"}`) as {
    id: string;
    nickname: string;
  }[];
  for (const l of linhas) await apagarConta(l.id);
  return linhas.length;
}
