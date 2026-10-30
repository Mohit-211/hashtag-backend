#!/usr/bin/env bash
# Puts a commit of main live on this server. GitHub Actions runs it over SSH after every push to
# main (.github/workflows/deploy.yml); the deploy key in /root/.ssh/authorized_keys can run
# nothing else. By hand, as root: bash scripts/deploy.sh <full commit id> [--migrations-done]
#
# Changes nothing when files on the server differ from git, or when the commit adds database
# migrations not confirmed as run. After the restart, puts the previous commit back if the app
# doesn't answer its health check. Details: docs/deployment.md.
#
# Everything runs inside main(): bash reads a script while running it, and a deploy changes
# this file on disk.

set -euo pipefail

APP_DIR=/var/www/backend
PM2_APP=backend
LOCK_FILE=/run/lock/hashtag-backend-deploy.lock

# A deploy that changes only these keeps the app running instead of restarting it.
NO_RESTART='(\.md$|^docs/|^\.github/|^migrations/|^scripts/deploy\.sh$|^eslint-suppressions\.json$)'

log() { echo "==> $*"; }
die() {
  echo "!!! $*" >&2
  exit 1
}

health_url() {
  local port
  port=$(sed -n 's/^PORT=//p' "$APP_DIR/.env" | tr -d "\"' \r")
  echo "http://127.0.0.1:${port:-5000}/api/healthcheck"
}

# Waits up to a minute for the app to answer, then checks it's still answering 5 seconds later.
app_is_healthy() {
  local url
  url=$(health_url)
  for _ in $(seq 30); do
    if curl -fsS -m 3 "$url" 2>/dev/null | grep -q '"ok"'; then
      sleep 5
      curl -fsS -m 3 "$url" 2>/dev/null | grep -q '"ok"'
      return
    fi
    sleep 2
  done
  return 1
}

install_packages() {
  local status=0
  npm install --omit=dev --no-audit --no-fund || status=$?
  # npm can rewrite the lockfile's metadata; keep the checkout identical to git, even on failure.
  git checkout -- package-lock.json
  return "$status"
}

main() {
  # From GitHub Actions the arguments arrive in SSH_ORIGINAL_COMMAND (see authorized_keys).
  local -a args
  if [[ -n "${SSH_ORIGINAL_COMMAND:-}" ]]; then
    read -ra args <<<"$SSH_ORIGINAL_COMMAND"
  else
    args=("$@")
  fi

  local usage="Usage: deploy.sh <full commit id> [--migrations-done]"
  local target="${args[0]:-}" migrations_done=no
  [[ "$target" =~ ^[0-9a-f]{40}$ ]] || die "$usage"
  case "${args[1]:-}" in
    "") ;;
    --migrations-done) migrations_done=yes ;;
    *) die "$usage" ;;
  esac
  ((${#args[@]} <= 2)) || die "$usage"

  exec 9>"$LOCK_FILE"
  flock -n 9 || die "Another deploy is running. Try again when it's done."

  cd "$APP_DIR"

  # Files edited on the server (by hand or uploaded over SFTP) would be overwritten or block the update.
  local edited
  edited=$(git status --porcelain --untracked-files=no)
  if [[ -n "$edited" ]]; then
    echo "$edited"
    die "These files on the server differ from git. Nothing was deployed. Commit the changes, or discard them on the server (git checkout -- <file>), then deploy again."
  fi

  git fetch --quiet origin main
  git merge-base --is-ancestor "$target" origin/main 2>/dev/null ||
    die "$target is not on main. Nothing was deployed."

  local previous
  previous=$(git rev-parse HEAD)
  if git merge-base --is-ancestor "$target" "$previous"; then
    log "The server already runs ${previous:0:7}, which includes ${target:0:7}. Nothing to do."
    return
  fi
  git merge-base --is-ancestor "$previous" "$target" ||
    die "${target:0:7} doesn't build on the running commit ${previous:0:7} (was main rewritten?). Nothing was deployed."

  # Schema changes are run by hand, some before the code that needs them (migrations/README.md).
  local migrations
  migrations=$(git diff --name-only --diff-filter=AM "$previous" "$target" -- migrations/ |
    grep '\.sql$' | grep -v '\.rollback\.sql$' || true)
  if [[ -n "$migrations" && "$migrations_done" != yes ]]; then
    echo "$migrations"
    die "This deploy adds or changes the database migrations above. Nothing was deployed. Run the ones marked 'before deploy' by hand (migrations/README.md), then run the Deploy workflow from GitHub's Actions tab with 'migrations done' ticked."
  fi

  local changed
  changed=$(git diff --name-only "$previous" "$target")
  log "Deploying ${previous:0:7} -> ${target:0:7}:"
  git log --oneline "$previous..$target"
  git merge --ff-only --quiet "$target"

  local packages_changed=no
  if grep -qxE 'package(-lock)?\.json' <<<"$changed"; then
    packages_changed=yes
    log "Installing packages"
    if ! install_packages; then
      git reset --hard --quiet "$previous"
      install_packages ||
        die "npm install failed, and so did reinstalling the packages of ${previous:0:7}. The code is back at ${previous:0:7} and the app is still running, but don't restart it until 'npm install --omit=dev' succeeds in $APP_DIR."
      die "npm install failed. The code is back at ${previous:0:7} and the app wasn't restarted."
    fi
  fi

  if ! grep -qvE "$NO_RESTART" <<<"$changed"; then
    log "Deployed ${target:0:7}. Only docs, migrations or deploy files changed, so the app wasn't restarted."
    return
  fi

  log "Restarting the app"
  # A plain restart keeps the process's environment as it is; the app reads .env again at start.
  pm2 restart "$PM2_APP" >/dev/null || true
  if app_is_healthy; then
    log "Deployed ${target:0:7}. Health check: ok."
    return
  fi

  log "The app didn't pass its health check. Putting ${previous:0:7} back."
  git reset --hard --quiet "$previous"
  if [[ "$packages_changed" == yes ]]; then
    install_packages || true
  fi
  pm2 restart "$PM2_APP" >/dev/null || true
  if app_is_healthy; then
    die "Deploy of ${target:0:7} failed and was rolled back: the site runs ${previous:0:7} again. 'pm2 logs $PM2_APP' on the server shows why it didn't start."
  fi
  die "Deploy of ${target:0:7} failed, and the app doesn't answer after going back to ${previous:0:7} either. Check 'pm2 logs $PM2_APP' on the server now."
}

main "$@"
exit
