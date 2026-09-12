-- Notificação com o app fechado.
--
-- O QUE ESTA TABELA GUARDA: o endereço para onde o navegador da pessoa pediu
-- que os empurrões sejam mandados, mais as duas chaves com que ele decifra o
-- que chega. Não é conteúdo de conversa e não é endereço de rede dela — é um
-- endpoint no servidor do Google, da Apple ou da Mozilla, que só aceita
-- mensagens assinadas pela nossa chave VAPID.
--
-- UMA LINHA POR APARELHO, e não por conta: a mesma pessoa tem o celular e o
-- computador, e a mensagem precisa tocar nos dois. O `endpoint` é a chave
-- primária porque é o navegador que o gera e ele já é único no mundo.

create table if not exists push_subscriptions (
  endpoint     text primary key,

  user_id      uuid not null references users(id) on delete cascade,

  -- As duas chaves do padrão Web Push (RFC 8291). Sem elas o empurrão sai, mas
  -- chega como lixo indecifrável do outro lado.
  p256dh       text not null,
  auth         text not null,

  created_at   timestamptz not null default now(),

  -- Para limpar inscrições que morreram sem avisar: navegador desinstalado,
  -- app removido da tela de início, permissão revogada. O servidor de push
  -- responde 404 ou 410 nesses casos, e é aí que a linha é apagada.
  last_ok_at   timestamptz
);

-- "Todos os aparelhos desta pessoa" é a única consulta que existe.
create index if not exists push_subscriptions_user_idx
  on push_subscriptions (user_id);
