-- O perfil: o que a pessoa mostra, e para quem.
--
-- ATÉ AQUI A CONTA ERA SÓ CADASTRO. Nome, cidade e idade existiam porque o
-- formulário pediu, e apareciam numa tela de leitura que ninguém além do dono
-- via. Num aplicativo para conhecer gente isso é pouco: quem recebe um convite
-- de um desconhecido precisa de alguma coisa para decidir, e um nickname não é
-- alguma coisa.
--
-- A VISIBILIDADE É O CENTRO DISTO, e não um detalhe de configuração. Abrir um
-- perfil ao mundo é uma decisão com consequências que a pessoa sente na pele —
-- por isso ela escolhe, e por isso são três níveis e não um interruptor: entre
-- "todo mundo vê tudo" e "ninguém vê nada" existe o caso mais comum, que é
-- mostrar a cara e o nome e guardar o resto.

-- Uma frase sobre si. Curta de propósito: perfil de conversa não é currículo, e
-- campo grande convida a colar telefone e endereço.
alter table users add column if not exists descricao text;

-- A data de nascimento, e não a idade.
--
-- Idade guardada como número envelhece errado: quem tinha 29 ao se cadastrar
-- continua com 29 para sempre. A data é o fato; a idade é conta que se faz na
-- hora de mostrar.
alter table users add column if not exists nascimento date;

/*
 * O que os outros enxergam:
 *
 *   'publico'   — foto, nickname, descrição, idade e lugar
 *   'reservado' — só foto e nickname
 *   'privado'   — só o nickname, e fora da busca e das recomendações
 *
 * O PADRÃO É 'reservado', e é uma escolha deliberada: as contas que já existem
 * nunca disseram que queriam ser públicas, e assumir que sim seria publicar
 * dados de gente que não pediu. Quem quiser abrir, abre num toque.
 */
alter table users
  add column if not exists perfil_visibilidade text not null default 'reservado';

alter table users drop constraint if exists users_visibilidade_valida;
alter table users add constraint users_visibilidade_valida
  check (perfil_visibilidade in ('publico', 'reservado', 'privado'));
