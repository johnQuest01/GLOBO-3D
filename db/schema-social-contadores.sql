-- Os contadores passam a acompanhar TAMBEM o que some sem ser apagado.
--
-- O DEFEITO, encontrado testando: apagar um comentario marca `removido_em` em
-- vez de apagar a linha — de proposito, para a moderacao poder olhar depois.
-- Mas o gatilho so' ouvia INSERT e DELETE, entao a linha sumia da lista e
-- continuava contada. O cartao dizia "3 comentarios" e a conversa mostrava
-- zero. Numero que mente e' pior que numero ausente: ele nao avisa.
--
-- O MESMO VALE PARA `oculto_em`, que e' o que a denuncia por volume faz. Um
-- comentario escondido sai da leitura; se continuasse contado, a contagem
-- seria um vazamento — diria que ha' algo ali que ninguem consegue ver.
--
-- POR QUE NAO CONTAR NA HORA DE LER, entao. Porque e' exatamente o `count(*)`
-- que este desenho existe para evitar: ele percorre todos os comentarios da
-- publicacao a cada abertura do feed, e o custo cresce com o sucesso do post.
-- O contador continua na linha; o que muda e' que agora ele escuta os quatro
-- eventos que mexem na visibilidade, e nao so' dois.

create or replace function mexer_contadores_de_comentario() returns trigger as $$
declare
  visivel_antes boolean;
  visivel_agora boolean;
  delta int := 0;
  o_post uuid;
  a_raiz uuid;
begin
  if tg_op = 'INSERT' then
    delta := case when new.removido_em is null and new.oculto_em is null
                  then 1 else 0 end;
  elsif tg_op = 'DELETE' then
    delta := case when old.removido_em is null and old.oculto_em is null
                  then -1 else 0 end;
  else
    visivel_antes := old.removido_em is null and old.oculto_em is null;
    visivel_agora := new.removido_em is null and new.oculto_em is null;
    if visivel_antes and not visivel_agora then
      delta := -1;
    elsif not visivel_antes and visivel_agora then
      delta := 1;
    end if;
  end if;

  if delta = 0 then return null; end if;

  o_post := coalesce(new.post_id, old.post_id);
  a_raiz := coalesce(new.raiz_id, old.raiz_id);

  update posts set comentarios = greatest(0, comentarios + delta)
   where id = o_post;

  if a_raiz is not null then
    update comentarios set respostas = greatest(0, respostas + delta)
     where id = a_raiz;
  end if;

  return null;
end;
$$ language plpgsql;

drop trigger if exists comentarios_contador on comentarios;
create trigger comentarios_contador
  after insert or delete on comentarios
  for each row execute function mexer_contadores_de_comentario();

-- O `when` e' o que impede a recursao: a linha acima mexe em `respostas` da
-- raiz, o que e' um UPDATE nesta mesma tabela. Sem a condicao, esse UPDATE
-- reentraria no gatilho a cada resposta contada.
drop trigger if exists comentarios_visibilidade on comentarios;
create trigger comentarios_visibilidade
  after update of removido_em, oculto_em on comentarios
  for each row
  when (old.removido_em is distinct from new.removido_em
     or old.oculto_em   is distinct from new.oculto_em)
  execute function mexer_contadores_de_comentario();

-- O conserto ja' contava so' os nao-removidos; agora conta so' os visiveis,
-- para casar com o gatilho. Rodar isto e ver zero linhas mudadas e' a prova de
-- que o desenho esta' de pe'.
create or replace function recontar_social() returns void as $$
  update posts p set
    curtidas    = (select count(*) from curtidas c where c.post_id = p.id),
    comentarios = (select count(*) from comentarios k
                    where k.post_id = p.id
                      and k.removido_em is null and k.oculto_em is null);

  update comentarios k set
    curtidas  = (select count(*) from curtidas_comentario c
                  where c.comentario_id = k.id),
    respostas = (select count(*) from comentarios r
                  where r.raiz_id = k.id
                    and r.removido_em is null and r.oculto_em is null);
$$ language sql;
