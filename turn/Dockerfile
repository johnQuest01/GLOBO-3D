# coturn — o servidor de TURN.
#
# PARA QUE ELE SERVE, em uma frase: quando os dois navegadores não conseguem se
# enxergar diretamente (o caso comum entre dois celulares em operadoras
# diferentes, atrás de CGNAT), alguém precisa ficar no meio repassando os
# pacotes de áudio e vídeo. Esse alguém é este processo.
#
# O QUE ELE NÃO FAZ: nada de mensagem. Texto, foto e áudio da conversa passam
# pela caixa postal do servidor de realtime. O TURN só entra em CHAMADA de
# vídeo/voz, e só quando a conexão direta falha.
#
# Imagem minúscula de propósito: coturn no Alpine dá ~15 MB, e este processo
# não precisa de mais nada.

FROM alpine:3.20

RUN apk add --no-cache coturn

COPY turnserver.conf /etc/coturn/turnserver.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 3478: onde o navegador fala com o TURN (UDP e TCP).
# 49160-49200: as portas de RELAY — por onde o áudio e o vídeo de fato passam.
# O intervalo é pequeno de propósito: cada chamada usa um par, e cada porta
# precisa estar declarada no fly.toml. Quarenta portas comportam bem mais
# conversas simultâneas do que este projeto vai ter tão cedo.
EXPOSE 3478/udp 3478/tcp 49160-49200/udp

ENTRYPOINT ["/entrypoint.sh"]
