#!/usr/bin/env bash
# Despliega Emupoke Together en este servidor, siguiendo docs/despliegue.md.
#
#   sudo bash deploy/instalar.sh
#
# Se puede volver a ejecutar: la segunda vez actualiza (git pull, compila y
# reinicia) sin romper lo que ya hay.
#
# Variables opcionales:
#   DOMINIO=juego.midominio.com   por defecto <ip-publica>.sslip.io
#   REPO=https://github.com/...   por defecto el de este proyecto
#   RAMA=main
#   SIN_RANDOMIZER=1              no instala Java ni el jar
set -euo pipefail

REPO="${REPO:-https://github.com/apraghatyus/pokemeeting.git}"
RAMA="${RAMA:-main}"
DIR=/opt/emupoke
USUARIO=emupoke
JAVA_DIR=/opt/java8

paso() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*"; }
fallo() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fallo "Ejecutalo con sudo."
command -v systemctl >/dev/null || fallo "Hace falta systemd."

if command -v apt-get >/dev/null; then PM=apt
elif command -v dnf >/dev/null; then PM=dnf
else fallo "Solo se soportan distribuciones con apt o dnf."; fi

instalar() {
  if [ "$PM" = apt ]; then DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  else dnf install -y "$@"; fi
}

case "$(uname -m)" in
  x86_64) ARCH_JAVA=x64 ;;
  aarch64|arm64) ARCH_JAVA=aarch64 ;;
  *) fallo "Arquitectura $(uname -m) no soportada." ;;
esac

paso "Paquetes basicos"
[ "$PM" = apt ] && apt-get update -y
instalar git curl ca-certificates tar unzip

paso "Node 20 o superior"
NODE_OK=0
if command -v node >/dev/null; then
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] && NODE_OK=1
fi
if [ "$NODE_OK" = 0 ]; then
  if [ "$PM" = apt ]; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  else curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -; fi
  instalar nodejs
fi
NPM="$(command -v npm)"
echo "node $(node -v), npm $("$NPM" -v)"

paso "Caddy (proxy inverso con HTTPS automatico)"
if ! command -v caddy >/dev/null; then
  if [ "$PM" = apt ]; then
    instalar debian-keyring debian-archive-keyring apt-transport-https gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    instalar caddy
  else
    dnf install -y 'dnf-command(copr)' && dnf copr enable -y @caddy/caddy && instalar caddy
  fi
fi
caddy version

paso "Usuario de servicio"
id "$USUARIO" >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/emupoke --shell /usr/sbin/nologin "$USUARIO"

paso "Codigo en $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch origin "$RAMA"
  git -C "$DIR" checkout "$RAMA"
  git -C "$DIR" reset --hard "origin/$RAMA"
else
  git clone --branch "$RAMA" "$REPO" "$DIR"
fi
chown -R "$USUARIO:$USUARIO" "$DIR"

paso "Dependencias y compilacion"
# Sin --omit=dev: los servidores corren TypeScript con tsx, que es de desarrollo.
# PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: los navegadores solo son para las pruebas.
sudo -u "$USUARIO" -H env PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bash -c "cd '$DIR' && '$NPM' ci && '$NPM' run build"
[ -f "$DIR/apps/web/dist/index.html" ] || fallo "La compilacion no dejo apps/web/dist/index.html"
# Caddy tiene que poder leer los ficheros estaticos.
chmod o+rx /opt "$DIR" "$DIR/apps" "$DIR/apps/web"
chmod -R o+rX "$DIR/apps/web/dist"

ENV_RANDOMIZER=""
if [ "${SIN_RANDOMIZER:-0}" != 1 ]; then
  paso "Java 8 (con jjs) en $JAVA_DIR"
  # Java 8 y no otro: el servicio necesita jjs, que desaparecio en Java 15.
  if [ ! -x "$JAVA_DIR/bin/jjs" ]; then
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/jdk.tar.gz" \
      "https://api.adoptium.net/v3/binary/latest/8/ga/linux/$ARCH_JAVA/jdk/hotspot/normal/eclipse"
    rm -rf "$JAVA_DIR" && mkdir -p "$JAVA_DIR"
    tar -xzf "$tmp/jdk.tar.gz" -C "$JAVA_DIR" --strip-components=1
    rm -rf "$tmp"
  fi
  JJS="$("$JAVA_DIR/bin/java" -XshowSettings:properties -version 2>&1 | sed -n 's/.*java.home = //p')/bin/jjs"
  [ -x "$JJS" ] || fallo "Java 8 instalado pero sin jjs en $JJS"
  "$JAVA_DIR/bin/java" -version 2>&1 | head -1

  paso "Universal Pokemon Randomizer ZX"
  JAR="$DIR/tools/randomizer/PokeRandoZX.jar"
  if [ ! -f "$JAR" ]; then
    url="$(curl -fsSL https://api.github.com/repos/Ajarmar/universal-pokemon-randomizer-zx/releases/latest \
      | grep -o '"browser_download_url": *"[^"]*\.zip"' | head -1 | sed 's/.*"\(http[^"]*\)"/\1/')"
    [ -n "$url" ] || fallo "No encontre el zip del randomizer en GitHub."
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/upr.zip" "$url"
    unzip -o -j "$tmp/upr.zip" '*PokeRandoZX.jar' -d "$tmp"
    install -o "$USUARIO" -g "$USUARIO" -m 644 "$tmp/PokeRandoZX.jar" "$JAR"
    rm -rf "$tmp"
  fi
  echo "jar: $JAR"
  ENV_RANDOMIZER="Environment=JAVA_HOME=$JAVA_DIR"
fi

paso "Servicios systemd"
cat > /etc/systemd/system/emupoke-salas.service <<UNIT
[Unit]
Description=Emupoke Together - servidor de salas
After=network.target

[Service]
WorkingDirectory=$DIR/apps/signaling
ExecStart=$NPM start
Environment=PORT=8787
Environment=PATH=$(dirname "$NPM"):/usr/local/bin:/usr/bin:/bin
Restart=always
User=$USUARIO

[Install]
WantedBy=multi-user.target
UNIT

if [ "${SIN_RANDOMIZER:-0}" != 1 ]; then
cat > /etc/systemd/system/emupoke-randomizer.service <<UNIT
[Unit]
Description=Emupoke Together - aleatorizacion
After=network.target

[Service]
WorkingDirectory=$DIR/apps/randomizer
ExecStart=$NPM start
Environment=PORT=8788
Environment=PATH=$JAVA_DIR/bin:$(dirname "$NPM"):/usr/local/bin:/usr/bin:/bin
$ENV_RANDOMIZER
Restart=always
User=$USUARIO

[Install]
WantedBy=multi-user.target
UNIT
fi

systemctl daemon-reload
systemctl enable emupoke-salas
systemctl restart emupoke-salas
if [ "${SIN_RANDOMIZER:-0}" != 1 ]; then
  systemctl enable emupoke-randomizer
  systemctl restart emupoke-randomizer
fi

paso "Dominio"
if [ -z "${DOMINIO:-}" ]; then
  IP="$(curl -fsS4 https://ifconfig.me || curl -fsS4 https://api.ipify.org)"
  DOMINIO="$(echo "$IP" | tr . -).sslip.io"
fi
echo "Se servira en https://$DOMINIO"

paso "Caddyfile"
[ -f /etc/caddy/Caddyfile ] && [ ! -f /etc/caddy/Caddyfile.antes-de-emupoke ] \
  && cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes-de-emupoke
cat > /etc/caddy/Caddyfile <<CADDY
$DOMINIO {
	encode gzip

	# Sin estas dos el nucleo del emulador arranca y falla en silencio.
	header {
		Cross-Origin-Opener-Policy same-origin
		Cross-Origin-Embedder-Policy require-corp
	}

	handle /signaling* {
		uri strip_prefix /signaling
		reverse_proxy 127.0.0.1:8787
	}

	handle /randomizer* {
		uri strip_prefix /randomizer
		reverse_proxy 127.0.0.1:8788 {
			transport http {
				read_timeout 300s
				write_timeout 300s
			}
		}
	}

	handle {
		root * $DIR/apps/web/dist
		try_files {path} /index.html
		file_server
	}
}
CADDY
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

paso "Firewall"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp; ufw allow 443/tcp; ufw deny 8787/tcp; ufw deny 8788/tcp
elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http --add-service=https && firewall-cmd --reload
else
  aviso "No hay firewall activo: 8787 queda expuesto si la maquina tiene IP publica directa."
fi

paso "Comprobaciones locales"
for i in $(seq 1 30); do curl -fs http://127.0.0.1:8787/health >/dev/null && break; sleep 1; done
echo -n "salas:      "; curl -fsS http://127.0.0.1:8787/health || aviso "el servidor de salas no responde (journalctl -u emupoke-salas)"
echo
if [ "${SIN_RANDOMIZER:-0}" != 1 ]; then
  for i in $(seq 1 30); do curl -fs http://127.0.0.1:8788/health >/dev/null && break; sleep 1; done
  echo -n "randomizer: "; curl -fsS http://127.0.0.1:8788/health || aviso "el randomizer no responde (journalctl -u emupoke-randomizer)"
  echo
fi

paso "Comprobaciones por HTTPS (pueden tardar si el certificado aun se esta emitiendo)"
ok=0
for i in $(seq 1 12); do
  if curl -fsSI "https://$DOMINIO" 2>/dev/null | grep -qi cross-origin-embedder; then ok=1; break; fi
  sleep 5
done
if [ "$ok" = 1 ]; then
  curl -fsSI "https://$DOMINIO" | grep -i cross-origin
  echo -n "salas:      "; curl -fsS "https://$DOMINIO/signaling/health"; echo
  [ "${SIN_RANDOMIZER:-0}" != 1 ] && { echo -n "randomizer: "; curl -fsS "https://$DOMINIO/randomizer/health"; echo; }
  printf '\n\033[1;32mListo: https://%s\033[0m\n' "$DOMINIO"
else
  aviso "https://$DOMINIO aun no responde con certificado."
  aviso "Casi siempre es que los puertos 80 y 443 no llegan a esta maquina desde internet"
  aviso "(redirigelos en el router si es un servidor casero). Mira: journalctl -u caddy -n 50"
fi
