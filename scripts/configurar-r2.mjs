// scripts/configurar-r2.mjs
//
// Pergunta as quatro chaves do armazenamento e escreve no .env.local.
//
// POR QUE ELE EXISTE: montar um comando com segredo dentro convida ao erro —
// uma aspa a menos, um espaco a mais, e o valor entra torto sem ninguem
// perceber. Aqui voce cola cada um no seu proprio terminal; o valor vai direto
// para o arquivo e nao passa por lugar nenhum.
//
//   node scripts/configurar-r2.mjs
//
// Rodar de novo SUBSTITUI o que ja' estava la', entao serve tambem para trocar
// uma chave vazada.

import { createInterface } from 'node:readline/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ARQUIVO = '.env.local';

const CAMPOS = [
  {
    nome: 'R2_ACCOUNT_ID',
    pergunta: 'Account ID (o que vem antes de .r2.cloudflarestorage.com)',
    valida: (v) => /^[a-f0-9]{20,40}$/i.test(v) || 'parece curto demais para um Account ID',
  },
  {
    nome: 'R2_BUCKET',
    pergunta: 'Nome do bucket',
    padrao: 'globo-midia',
    valida: (v) => /^[a-z0-9][a-z0-9-]{1,61}$/.test(v) || 'so minusculas, numeros e hifen',
  },
  {
    nome: 'R2_ACCESS_KEY_ID',
    pergunta: 'Access Key ID',
    valida: (v) => v.length >= 16 || 'parece curto demais',
  },
  {
    nome: 'R2_SECRET_ACCESS_KEY',
    pergunta: 'Secret Access Key',
    valida: (v) => v.length >= 32 || 'parece curto demais',
  },
];

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log('\nConfigurar o armazenamento de midia (Cloudflare R2)');
console.log('Cole cada valor e tecle Enter. Nada disto sai deste computador.\n');

const valores = {};
for (const campo of CAMPOS) {
  for (;;) {
    const dica = campo.padrao ? ` [${campo.padrao}]` : '';
    const resposta = (await rl.question(`${campo.pergunta}${dica}: `)).trim();
    const valor = resposta || campo.padrao || '';

    if (!valor) {
      console.log('  -> nao pode ficar vazio.');
      continue;
    }
    const ok = campo.valida(valor);
    if (ok !== true) {
      console.log(`  -> ${ok}. Confira e cole de novo.`);
      continue;
    }
    valores[campo.nome] = valor;
    break;
  }
}
rl.close();

// Reescreve as linhas que ja' existiam, em vez de acumular duplicatas — duas
// linhas com a mesma chave e' a receita de "mudei e nao surtiu efeito".
const atual = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, 'utf8') : '';
const linhas = atual.split(/\r?\n/).filter((l) => !CAMPOS.some((c) => l.startsWith(c.nome + '=')));
while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();

for (const c of CAMPOS) linhas.push(`${c.nome}=${valores[c.nome]}`);
writeFileSync(ARQUIVO, linhas.join('\n') + '\n', 'utf8');

const digital = (v) => createHash('sha256').update(v).digest('hex').slice(0, 8);

console.log(`\nGravado em ${ARQUIVO}. Confira as impressoes digitais:`);
for (const c of CAMPOS) {
  const v = valores[c.nome];
  const mostra = c.nome === 'R2_SECRET_ACCESS_KEY' ? `sha256:${digital(v)}` : v;
  console.log(`  ${c.nome.padEnd(22)} ${mostra}`);
}
console.log('\nPronto. Volte ao chat e diga "pronto".\n');
