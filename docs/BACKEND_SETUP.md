# Configuração do Backend (Neon / PostgreSQL) — Rede Social do GLOBO-3D

O GLOBO-3D funciona **sem backend** por padrão: as mensagens voam pelo globo,
mas ficam só na sua tela. Ao ligar o Neon, o projeto vira uma **rede social**:
as mensagens são salvas e **aparecem para os outros usuários** voando até a
região de destino no globo.

Tudo é opcional e com **degradação graciosa** — se a variável de ambiente não
existir, nada quebra.

## Como funciona a arquitetura (Neon é PostgreSQL puro)

Diferente de plataformas com SDK de navegador, o Neon é um Postgres. Por isso:

- A **connection string é secreta** e usada **apenas no servidor** (nas rotas
  `app/api/messages`). O navegador nunca a vê.
- O "tempo real" é feito por **polling**: o cliente pergunta ao servidor a cada
  ~4 segundos "há mensagens novas?". É simples, robusto e funciona bem em
  serverless (Vercel). Dá para evoluir para SSE/WebSockets depois.

```
Navegador  ──POST /api/messages──►  Rota (servidor)  ──►  Neon (Postgres)
Navegador  ◄─GET /api/messages?since=…─  Rota (servidor)  ◄──  Neon
```

## Passo a passo

### 1. Crie o banco no Neon (você já tem conta)
1. No painel do Neon, crie um projeto (ou use um existente).
2. Abra **SQL Editor**.
3. Cole o conteúdo de [`db/schema.sql`](../db/schema.sql) e execute (**Run**).
   - Cria a tabela `region_messages` e as tabelas `region_news` e `ads` para as
     próximas fases.

### 2. Pegue a connection string
1. No painel do projeto, abra **Connection Details**.
2. Copie a string **Pooled connection** (recomendada para serverless).
   Ela se parece com:
   `postgresql://user:pass@ep-xxxx-pooler.regiao.aws.neon.tech/neondb?sslmode=require`

### 3. Configure o app
1. Copie `.env.example` para `.env.local`.
2. Cole a connection string em `DATABASE_URL`.
3. Reinicie o servidor (`npm run dev`).

### 4. Na Vercel (deploy)
Adicione `DATABASE_URL` em **Project Settings → Environment Variables** com a
mesma connection string. Não precisa de `NEXT_PUBLIC_` — é variável de servidor.

Pronto! Ao enviar uma mensagem, ela é salva e, em segundos, aparece voando até a
região no globo dos outros usuários. Teste abrindo o app em duas abas.

## Arquivos do backend

| Arquivo | Papel |
|---------|-------|
| `lib/db/messages.ts` · `news.ts` · `ads.ts` | Acesso ao Neon (server-only) |
| `app/api/messages` · `news` · `ads` | Rotas — a ponte segura navegador↔banco |
| `app/hooks/useMessageSystem.ts` | Mensagens: exibe local + envia + recebe (polling) |
| `app/hooks/useRegionNews.ts` | Notícias reais mescladas ao popup de cada região |
| `app/hooks/useDbAds.ts` + `components/globe/canvas/DbAds.tsx` | Anúncios no globo (zoom) |
| `db/schema.sql` | Estrutura do banco |

## Como adicionar conteúdo (SQL de exemplo)

Rode no **SQL Editor** do Neon para testar as notícias e os anúncios.

### Notícia por região
O `region_key` deve bater com a chave do local (país como `Brazil`, estado em
minúsculas como `são paulo`, ou o nome da cidade como `São Paulo`). A notícia
aparece na aba **Notícias** do popup daquela região, na categoria escolhida.

```sql
insert into region_news (region_key, category, title, body, image_url) values
('Brazil', 'local',
 'Nova linha de metrô inaugurada',
 'A cidade ganhou uma nova linha de metrô que liga a zona sul ao centro.\n\nO trajeto reduz o tempo de viagem em 40 minutos.',
 'https://images.unsplash.com/photo-1541959833400-049d37f98ccd?w=600');
```

### Anúncio SEGMENTADO (marketing no globo)
Aparece como um marcador clicável quando o usuário dá zoom — **mas só para quem
tem o nicho compatível**. Use `niches` para segmentar; deixe `'{}'` para um
anúncio geral (aparece para todos). Posicione por `lat`/`lon` (ou `region_key`).

```sql
-- Anúncio de passagem: só aparece para quem curte VIAGEM ou LUXO
insert into ads (region_key, title, image_url, link_url, lat, lon, niches, active) values
('Brazil', 'Passagens em promoção',
 'https://placehold.co/100x64/1E293B/FBBF24?text=Voe+Barato',
 'https://exemplo.com', -23.55, -46.63, '{viagem,luxo}', true);

-- Anúncio geral (sem nicho): aparece para todos
insert into ads (title, image_url, link_url, lat, lon, niches, active) values
('Chocolate Globo', 'https://placehold.co/100x64/1E293B/FBBF24?text=Choco',
 'https://exemplo.com', 48.85, 2.35, '{}', true);
```

**Nichos válidos:** `viagem, luxo, gastronomia, aventura, praia, cultura,
negocios, tecnologia, natureza, familia, esportes, compras, saude`.

Os interesses do usuário são derivados automaticamente do comportamento dele
(categorias de notícias salvas, locais de viagem salvos) — veja
`app/hooks/useUserInterests.ts`. O match acontece em `lib/ads/targeting.ts`.

Cada mensagem carrega um `client_id` de sessão, então a mensagem que **você**
enviou não volta duplicada pelo polling.

## Segurança (para produção)

As rotas aceitam envio público para facilitar os testes. Antes de produção:
- Adicione **autenticação** (hoje o login é mock) e associe mensagens ao usuário.
- Adicione **rate-limiting** e **moderação** de conteúdo.
- Considere validar origem/CORS conforme o deploy.

## Autenticação real (Neon Auth / Stack Auth)

O login atual é mock. Para ligar o **login de verdade** (com perfis de usuário),
o projeto já vem integrado com o **Neon Auth** (motor: Stack Auth), com
degradação graciosa: sem as chaves, o app segue com o login mock.

### Passos
1. No console do **Neon → Auth**, ative o Neon Auth e copie as 3 chaves:
   - `NEXT_PUBLIC_STACK_PROJECT_ID`
   - `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`
   - `STACK_SECRET_SERVER_KEY`
2. Copie também a **JWKS URL** (algo como
   `https://<projeto>.neonauth.<regiao>.aws.neon.tech/neondb/auth/.well-known/jwks.json`)
   para `NEON_AUTH_JWKS_URL`.
3. Cole tudo no `.env.local` (veja `.env.example`) e reinicie.

Com as chaves presentes:
- as telas de login/cadastro ficam em **`/handler/sign-in`** e **`/handler/sign-up`**;
- o servidor verifica os tokens via JWKS (`lib/auth/verify.ts`);
- as mensagens enviadas passam a registrar o **autor** autenticado.

| Arquivo | Papel |
|---------|-------|
| `lib/auth/config.ts` | Lê as variáveis e diz se a auth está ligada |
| `lib/auth/stack.ts` | App do Stack Auth (só criado com as chaves) |
| `lib/auth/verify.ts` | Verifica tokens do Neon Auth via JWKS (server) |
| `app/handler/[...stack]/page.tsx` | Rotas de login/cadastro/callback |

## Status das funcionalidades

- ✅ **`region_messages`**: rede social (mensagens que voam até a região).
- ✅ **`region_news`**: notícias reais mescladas ao popup de cada local.
- ✅ **`ads`**: anúncios/marketing interativo exibidos ao dar zoom (segmentados).
- ✅ **Neon Auth**: login real opcional (Stack Auth) + verificação por JWKS.

Todas com degradação graciosa: sem as variáveis, o app funciona em modo local.
