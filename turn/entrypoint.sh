#!/bin/sh
set -e

# O coturn precisa ANUNCIAR o endereço público, e ele não consegue descobri-lo
# sozinho: dentro do contêiner o que existe é um endereço privado do Fly. Se
# ele anunciar o privado, o navegador recebe um candidato de relay para um
# endereço inalcançável e a chamada falha sem erro claro — é o defeito clássico
# de TURN atrás de NAT.
#
# Por isso TURN_PUBLIC_IP é obrigatório, e a falta dele derruba o processo aqui
# em vez de virar um servidor que sobe bonito e não funciona.
if [ -z "$TURN_PUBLIC_IP" ]; then
  echo "TURN_PUBLIC_IP ausente. Defina com o IPv4 dedicado do app (fly ips list)." >&2
  exit 1
fi

if [ -z "$TURN_USER" ] || [ -z "$TURN_PASSWORD" ]; then
  echo "TURN_USER e TURN_PASSWORD sao obrigatorios." >&2
  exit 1
fi

echo "coturn: anunciando ${TURN_PUBLIC_IP}, usuario ${TURN_USER}"

exec turnserver \
  -c /etc/coturn/turnserver.conf \
  --external-ip="${TURN_PUBLIC_IP}" \
  --user="${TURN_USER}:${TURN_PASSWORD}"
