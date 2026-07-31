# Configuração do Backend (Supabase) — Rede Social do GLOBO-3D

O GLOBO-3D funciona **sem backend** por padrão: as mensagens voam pelo globo,
mas ficam só na sua tela. Ao ligar o Supabase, o projeto vira uma **rede
social**: as mensagens são salvas e **aparecem em tempo real** para todos os
outros usuários, voando até a região de destino no globo.

Tudo é opcional e com **degradação graciosa** — se as variáveis de ambiente
não existirem, nada quebra.

## Passo a passo

### 1. Crie um projeto Supabase (grátis)
1. Acesse https://supabase.com e crie uma conta.
2. Clique em **New project**, dê um nome e defina uma senha de banco.
3. Aguarde ~2 minutos até o projeto ficar pronto.

### 2. Crie as tabelas
1. No painel do Supabase, abra **SQL Editor**.
2. Cole o conteúdo de [`supabase/schema.sql`](../supabase/schema.sql) e clique em **Run**.
   - Isso cria a tabela `region_messages` (com RLS e realtime ligados) e
     tabelas prontas para as próximas fases (`region_news`, `ads`).

### 3. Pegue as credenciais
1. Vá em **Project Settings → API**.
2. Copie:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4. Configure o app
1. Na raiz do projeto, copie `.env.example` para `.env.local`.
2. Cole as duas credenciais.
3. Reinicie o servidor (`npm run dev`).

Pronto! Agora, ao enviar uma mensagem, ela é salva no banco e transmitida em
tempo real. Abra o app em duas abas/dispositivos diferentes para ver a mensagem
de um voando até a região no globo do outro.

## Como funciona no código

| Arquivo | Papel |
|---------|-------|
| `lib/supabase/client.ts` | Cria o cliente só se houver credenciais (`isSupabaseEnabled`) |
| `lib/supabase/regionMessages.ts` | Inserir mensagem + assinar realtime |
| `app/hooks/useMessageSystem.ts` | Exibe local + persiste/recebe mensagens de outros |
| `supabase/schema.sql` | Estrutura do banco (tabelas, RLS, realtime) |

Cada mensagem carrega um `client_id` de sessão, então a mensagem que **você**
enviou não volta duplicada pelo realtime.

## Segurança (importante para produção)

As policies em `schema.sql` permitem **envio público** para facilitar os testes.
Antes de ir para produção:
- Ative **Authentication** no Supabase e troque a policy de INSERT para
  `to authenticated`.
- Considere rate-limiting e moderação de conteúdo.

## Próximas fases (tabelas já criadas)

- **`region_news`**: notícias reais por região para o painel de cada local.
- **`ads`**: anúncios/marketing interativo exibidos ao dar zoom.
