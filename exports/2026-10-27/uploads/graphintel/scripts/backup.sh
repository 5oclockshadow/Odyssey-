#!/bin/sh
# Backup and restore of the one thing that matters: the `state` volume (graph, rounds, publish batches, security log, secrets file).
#   scripts/backup.sh backup  [dest_dir]        writes dest_dir/state-<UTC time>.tar.gz and a .sha256
#   scripts/backup.sh restore <archive.tar.gz>  verifies the checksum, stops the agent, restores, starts it, checks /health
# Run `backup` daily from cron (RPO 24 h) and run `restore` against a scratch host each quarter. Keep archives where the stack cannot write.
set -eu
VOL="${STATE_VOLUME:-$(basename "$(pwd)")_state}"
case "${1:-}" in
  backup)
    DEST="${2:-./backups}"; mkdir -p "$DEST"
    NAME="state-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
    docker run --rm -v "$VOL":/state:ro -v "$(cd "$DEST" && pwd)":/out busybox:1.36 tar czf "/out/$NAME" -C /state .
    (cd "$DEST" && sha256sum "$NAME" > "$NAME.sha256")
    echo "wrote $DEST/$NAME"
    ;;
  restore)
    ARC="${2:?archive path}"; DIR="$(cd "$(dirname "$ARC")" && pwd)"; F="$(basename "$ARC")"
    (cd "$DIR" && sha256sum -c "$F.sha256")
    docker compose stop agent
    docker run --rm -v "$VOL":/state -v "$DIR":/in busybox:1.36 sh -c "rm -rf /state/* && tar xzf /in/$F -C /state && chown -R 1000:1000 /state"
    docker compose start agent
    for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
      if docker compose exec -T agent python -c "import urllib.request as u; u.urlopen('http://localhost:8000/health', timeout=4)"; then echo "restored and healthy"; exit 0; fi
      sleep 5
    done
    echo "restored but /health did not answer" >&2; exit 1
    ;;
  *) echo "usage: $0 backup [dir] | restore <archive>" >&2; exit 2 ;;
esac
