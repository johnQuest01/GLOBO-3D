/**
 * O `.env`, carregado ANTES de qualquer outro módulo.
 *
 * A ordem aqui não é preciosismo — é a diferença entre a configuração valer ou
 * não. Em ESM, os imports são avaliados antes do corpo do arquivo que os
 * declara: um `process.loadEnvFile()` escrito no topo do `index.ts` roda DEPOIS
 * de todo módulo importado por ele. E módulos que leem `process.env` no escopo
 * do módulo (o `db.ts` faz isso, para montar o cliente do banco uma vez só) já
 * teriam lido tudo vazio.
 *
 * Foi exatamente o que aconteceu: a caixa postal subiu anunciando "falta
 * DATABASE_URL" com a variável escrita no `.env`, ao lado. O sintoma é
 * traiçoeiro porque a configuração ESTÁ lá — só chegou tarde.
 *
 * Por isso este arquivo existe e não tem nada além do efeito colateral: ele é
 * o PRIMEIRO import do `index.ts`, e assim o `.env` está de pé antes de
 * qualquer um olhar para `process.env`.
 *
 * Em produção o arquivo não existe (Railway injeta as variáveis no processo), e
 * é por isso que a falta dele não é erro.
 */

try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env: produção, ou dev sem arquivo. As variáveis vêm do ambiente. */
}

export {};
