// scripts/configurar-r2-web.mjs
//
// Uma pagina local, de uso unico, para colar as chaves do armazenamento.
//
// POR QUE ELA EXISTE: colar num terminal do Windows falha de varias formas
// (Ctrl+V so' funciona nos consoles novos, e o clique direito depende de uma
// opcao ligada). Num campo de formulario, colar sempre funciona.
//
// O QUE ELA NAO E': um servidor. Escuta so' em 127.0.0.1, so' nesta maquina,
// morre sozinha depois de salvar, e nao fala com lugar nenhum da internet. Os
// valores vao do seu navegador para o arquivo no seu disco, e nada mais.
//
//   node scripts/configurar-r2-web.mjs

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PORTA = 4545;
const ARQUIVO = '.env.local';

const CAMPOS = [
  ['R2_ACCOUNT_ID', 'Account ID', 'o que vem antes de .r2.cloudflarestorage.com'],
  ['R2_BUCKET', 'Nome do bucket', 'ex.: globo-midia'],
  ['R2_ACCESS_KEY_ID', 'Access Key ID', 'do token que voce criou no R2'],
  ['R2_SECRET_ACCESS_KEY', 'Secret Access Key', 'aparece uma vez so, ao criar o token'],
];

const lerAtual = () => {
  const texto = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, 'utf8') : '';
  const mapa = {};
  for (const linha of texto.split(/\r?\n/)) {
    const i = linha.indexOf('=');
    if (i > 0) mapa[linha.slice(0, i)] = linha.slice(i + 1);
  }
  return mapa;
};

const pagina = (recado = '') => {
  const atual = lerAtual();
  const campos = CAMPOS.map(
    ([nome, titulo, dica]) => `
      <label>
        <span class="t">${titulo}</span>
        <span class="d">${dica}</span>
        <input name="${nome}" value="${nome === 'R2_BUCKET' ? (atual[nome] ?? 'globo-midia') : ''}"
               autocomplete="off" spellcheck="false" />
      </label>`,
  ).join('');

  return `<!doctype html><meta charset="utf-8">
<title>Chaves do armazenamento</title>
<style>
  body{background:#0b1220;color:#e6edf5;font:15px system-ui,sans-serif;margin:0;
       display:flex;min-height:100vh;align-items:center;justify-content:center}
  form{width:min(92vw,32rem);background:#131c2e;padding:28px;border-radius:18px;
       box-shadow:0 20px 60px #0008}
  h1{font-size:19px;margin:0 0 4px}
  p.sub{color:#93a4bd;margin:0 0 20px;font-size:13px;line-height:1.5}
  label{display:block;margin-bottom:16px}
  .t{display:block;font-weight:600;font-size:13px}
  .d{display:block;color:#7c8ba3;font-size:12px;margin-bottom:6px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;
        border:1px solid #2b3a55;background:#0b1220;color:#e6edf5;font:14px monospace}
  input:focus{outline:none;border-color:#22d3ee}
  button{width:100%;padding:12px;border:0;border-radius:10px;background:#0891b2;
         color:#fff;font-weight:600;font-size:15px;cursor:pointer}
  .ok{background:#064e3b;color:#a7f3d0;padding:12px;border-radius:10px;margin-bottom:16px}
  .err{background:#4c1d24;color:#fecaca;padding:12px;border-radius:10px;margin-bottom:16px}
</style>
<form method="POST">
  <h1>Chaves do armazenamento de midia</h1>
  <p class="sub">Cole cada valor abaixo. Eles vao direto para o arquivo
     <code>.env.local</code> nesta maquina — nao passam pela internet nem pela conversa.</p>
  ${recado}
  ${campos}
  <button type="submit">Salvar</button>
</form>`;
};

const servidor = createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pagina());
    return;
  }

  let corpo = '';
  req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    const form = new URLSearchParams(corpo);
    const valores = {};
    const faltando = [];

    for (const [nome] of CAMPOS) {
      const v = (form.get(nome) ?? '').trim();
      if (!v) faltando.push(nome);
      valores[nome] = v;
    }

    if (faltando.length > 0) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(pagina(`<div class="err">Faltou preencher: ${faltando.join(', ')}</div>`));
      return;
    }

    // Reescreve as linhas existentes em vez de acumular duplicatas.
    const texto = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, 'utf8') : '';
    const linhas = texto
      .split(/\r?\n/)
      .filter((l) => !CAMPOS.some(([n]) => l.startsWith(n + '=')));
    while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();
    for (const [nome] of CAMPOS) linhas.push(`${nome}=${valores[nome]}`);
    writeFileSync(ARQUIVO, linhas.join('\n') + '\n', 'utf8');

    const digital = (v) => createHash('sha256').update(v).digest('hex').slice(0, 8);
    console.log('\nGravado em .env.local:');
    for (const [nome] of CAMPOS) {
      const v = valores[nome];
      const mostra = nome === 'R2_SECRET_ACCESS_KEY' ? `sha256:${digital(v)}` : v;
      console.log(`  ${nome.padEnd(22)} ${mostra}`);
    }
    console.log('\nPode fechar a aba. Volte ao chat e diga "pronto".\n');

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>Salvo</title>
       <body style="background:#0b1220;color:#a7f3d0;font:16px system-ui;display:flex;
                    min-height:100vh;align-items:center;justify-content:center;text-align:center">
       <div><h1>Salvo</h1><p style="color:#93a4bd">Pode fechar esta aba e voltar ao chat.</p></div>`,
    );

    // Uso unico: some assim que cumpre o que veio fazer.
    setTimeout(() => servidor.close(() => process.exit(0)), 500);
  });
});

// So' a propria maquina: nao aceita conexao de fora, nem da rede local.
servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`\nAbra no navegador:  http://localhost:${PORTA}\n`);
  console.log('A pagina fecha sozinha depois que voce salvar.\n');
});
