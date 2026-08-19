// scripts/db-apply.mjs
//
// Aplica arquivos .sql no banco apontado por DATABASE_URL:
//
//   node scripts/db-apply.mjs db/schema.sql db/schema-behavior.sql
//
// Existe porque o driver HTTP do Neon nao aceita varios comandos numa
// requisicao so — e preciso separar e enviar um a um. A divisao respeita os
// blocos $$ ... $$, senao um `create function` seria cortado no meio.
//
// Os arquivos usam `create ... if not exists`, entao rodar de novo e seguro.

import fs from 'fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) { console.error('sem DATABASE_URL'); process.exit(1); }
const sql = neon(url);

/** Divide em statements respeitando blocos $$ ... $$ (funcoes). */
function split(text) {
  const out = [];
  let buf = '';
  let inDollar = false;
  for (const line of text.split(/\r?\n/)) {
    const semComentario = line.replace(/--.*$/, '');
    if (semComentario.includes('$$')) {
      const n = (semComentario.match(/\$\$/g) || []).length;
      if (n % 2 === 1) inDollar = !inDollar;
    }
    buf += line + '\n';
    if (!inDollar && /;\s*$/.test(semComentario.trim())) {
      const s = buf.trim();
      if (s.replace(/--.*$/gm, '').trim()) out.push(s);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const arquivos = process.argv.slice(2);
for (const arquivo of arquivos) {
  const statements = split(fs.readFileSync(arquivo, 'utf8'));
  console.log(`\n== ${arquivo} (${statements.length} statements) ==`);
  for (const stmt of statements) {
    const rotulo = stmt.replace(/--.*$/gm, '').trim().split('\n')[0].slice(0, 62);
    try {
      await sql.query(stmt);
      console.log('  ok   ' + rotulo);
    } catch (e) {
      console.log('  ERRO ' + rotulo + '  ->  ' + e.message);
    }
  }
}
