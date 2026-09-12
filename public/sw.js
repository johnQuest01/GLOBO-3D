/*
 * O service worker — o pedaço do app que continua vivo com o site fechado.
 *
 * É POR AQUI QUE A MENSAGEM CHEGA quando ninguém está com a página aberta. O
 * socket morre junto com a aba; o navegador, não. Ele guarda esta inscrição e
 * acorda este arquivo quando o servidor empurra alguma coisa — mesmo dias
 * depois, mesmo com o telefone bloqueado.
 *
 * NÃO HÁ CACHE AQUI, de propósito. Um service worker também serve para guardar
 * o site e abri-lo offline, e é tentador fazer as duas coisas de uma vez. Mas
 * cache mal feito é a origem clássica do "atualizei e continua a versão
 * velha", e o app depende de uma conexão viva para o que ele faz de mais
 * importante. Quando o cache entrar, entra com estratégia pensada, não de
 * carona.
 *
 * O CONTEÚDO DA MENSAGEM NÃO VEM AQUI. O que o servidor empurra é só quem
 * mandou e de que tipo era ("mandou uma foto"). O texto continua no envelope,
 * que só é entregue ao aparelho quando o app abre. Notificação atravessa
 * servidores de terceiros (Google, Apple, Mozilla) — é o único caminho que
 * existe —, e mandar o texto por ali seria entregá-lo a quem não precisa dele.
 */

self.addEventListener('install', () => {
  // Assume o lugar do anterior sem esperar todas as abas fecharem: o custo de
  // esperar seria uma versão nova que só começa a valer no dia seguinte.
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener('push', (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    /* empurrão sem corpo legível: mostra o genérico abaixo */
  }

  const de = dados.de || 'Alguém';
  const tipo = dados.tipo || 'texto';

  const resumo =
    tipo === 'imagem'
      ? 'mandou uma foto'
      : tipo === 'audio'
        ? 'mandou um áudio'
        : tipo === 'video'
          ? 'mandou um vídeo'
          : 'te mandou uma mensagem';

  evento.waitUntil(
    self.registration.showNotification(`@${de}`, {
      body: resumo,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      /*
       * `tag` por remetente: cinco mensagens da mesma pessoa viram UM aviso
       * que se atualiza, e não cinco empilhados. `renotify` faz o telefone
       * vibrar de novo mesmo substituindo o anterior — senão a segunda
       * mensagem chegaria em silêncio.
       */
      tag: `msg:${de}`,
      renotify: true,
      data: { com: de },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const com = evento.notification.data?.com;
  const destino = com ? `/?conversa=${encodeURIComponent(com)}` : '/';

  evento.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      /*
       * REAPROVEITA A ABA QUE JÁ EXISTE, em vez de abrir outra.
       *
       * Abrir uma segunda aba do mesmo app significaria dois globos rodando,
       * duas conexões, e a conversa aberta na aba errada. Se já há uma, ela é
       * trazida para a frente e avisada de qual conversa abrir.
       */
      for (const aba of abas) {
        if (new URL(aba.url).origin !== self.location.origin) continue;
        aba.postMessage({ tipo: 'abrir-conversa', com });
        return aba.focus();
      }
      return self.clients.openWindow(destino);
    })(),
  );
});
