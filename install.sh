#!/bin/sh
set -eu

fail() { printf '%s\n' "$*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || fail 'curl is required to download the installer and release.'
case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) fail 'Supported systems: macOS and Linux.' ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) fail 'Supported architectures: arm64 and x64.' ;; esac
bindir=${TASKS_TUI_BIN_DIR:-"$HOME/.local/bin"}
case "$bindir" in /*) ;; *) fail 'TASKS_TUI_BIN_DIR must be an absolute path.' ;; esac
install_dir="$HOME/.local/share/tasks-tui"
if [ -e "$install_dir" ] || [ -L "$install_dir" ]; then
  if [ -L "$install_dir" ] || [ ! -d "$install_dir" ] || [ ! -f "$install_dir/.tasks-tui-managed" ] || [ -L "$install_dir/.tasks-tui-managed" ]; then
    fail "Cannot install tasks-tui: $install_dir is not managed by this installer."
  fi
fi
if [ -e "$bindir/tasks-tui" ] || [ -L "$bindir/tasks-tui" ]; then
  if [ ! -L "$bindir/tasks-tui" ] || [ "$(readlink "$bindir/tasks-tui")" != "$install_dir/bin/tasks-tui" ]; then
    fail "Cannot install tasks-tui: $bindir/tasks-tui already exists and is not managed by this installer."
  fi
fi
bun_dir=${BUN_INSTALL:-"$HOME/.bun"}/bin
export PATH="$bun_dir:$bindir:$PATH"
if ! command -v bun >/dev/null 2>&1 || ! bun -e 'const v = Bun.version.split(".").map(Number); process.exit(v[0] > 1 || (v[0] === 1 && (v[1] > 3 || (v[1] === 3 && v[2] >= 14))) ? 0 : 1)'; then
  printf '%s\n' 'Installing Bun using its official installer...'
  tmp_bun=$(mktemp "${TMPDIR:-/tmp}/tasks-tui-bun.XXXXXX")
  trap 'rm -f "$tmp_bun"' EXIT HUP INT TERM
  curl -fsSL https://bun.sh/install -o "$tmp_bun" || fail 'Could not download the official Bun installer.'
  bash "$tmp_bun" || fail 'The official Bun installer failed.'
  rm -f "$tmp_bun"
  trap - EXIT HUP INT TERM
  hash -r
fi
bun -e 'const v = Bun.version.split(".").map(Number); process.exit(v[0] > 1 || (v[0] === 1 && (v[1] > 3 || (v[1] === 3 && v[2] >= 14))) ? 0 : 1)' || fail 'Bun 1.3.14 or newer could not be installed.'
mkdir -p "$bindir" "$HOME/.local/share"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/tasks-tui.XXXXXX")
backup=
committed=0
cleanup() {
  if [ "$committed" -eq 0 ] && [ -n "$backup" ] && [ -d "$backup/previous" ]; then
    rm -rf "$install_dir"
    mv "$backup/previous" "$install_dir" || printf 'Could not restore the previous installation from %s.\n' "$backup/previous" >&2
  fi
  if [ -n "$backup" ]; then rmdir "$backup" 2>/dev/null || :; fi
  rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
url="https://github.com/itsmistermoon/tasks-tui/releases/latest/download/tasks-tui-$os-$arch.tar.gz"
curl -fL "$url" -o "$tmp/tasks-tui.tar.gz" || fail "Could not download $url."
mkdir "$tmp/package"
tar -xzf "$tmp/tasks-tui.tar.gz" -C "$tmp/package"
test -x "$tmp/package/bin/tasks-backend" && test -f "$tmp/package/opentui/app.ts" || fail 'Invalid release archive.'
touch "$tmp/package/.tasks-tui-managed"
if [ -d "$install_dir/axi" ]; then
  cp -R "$install_dir/axi" "$tmp/package/axi"
fi
axi=$(command -v tasks-axi || true)
if [ -z "$axi" ] && [ -x "$install_dir/axi/node_modules/tasks-axi/dist/bin/tasks-axi-bun" ]; then
  axi="$install_dir/axi/node_modules/tasks-axi/dist/bin/tasks-axi-bun"
  link_axi=1
else
  link_axi=0
fi
if [ "$link_axi" -eq 1 ] && { [ -e "$bindir/tasks-axi" ] || [ -L "$bindir/tasks-axi" ]; }; then
  fail "Cannot install tasks-axi: $bindir/tasks-axi already exists."
fi
if [ -n "$axi" ]; then
  axi_real=$(bun -e 'process.stdout.write(require("node:fs").realpathSync(process.argv[1]))' "$axi") || fail 'Could not resolve the existing tasks-axi executable.'
  "$axi" --version >/dev/null 2>&1 || fail 'The existing tasks-axi executable failed; it was not replaced.'
  bun -e 'const fs = require("node:fs"), path = require("node:path"); const base = path.dirname(path.dirname(process.argv[1])); for (const file of ["src/backends/markdown-grammar.js", "src/view.js"]) fs.accessSync(path.join(base, file));' "$axi_real" || fail 'The existing tasks-axi lacks required parser modules; it was not replaced.'

else
  if [ -e "$bindir/tasks-axi" ] || [ -L "$bindir/tasks-axi" ]; then
    fail "Cannot install tasks-axi: $bindir/tasks-axi already exists."
  fi
  printf '%s\n' 'Installing tasks-axi...'
  mkdir -p "$tmp/package/axi"
  (cd "$tmp/package/axi" && bun add tasks-axi) || fail 'Could not install tasks-axi with Bun.'
  axi_dist="$tmp/package/axi/node_modules/tasks-axi/dist"
  test -f "$axi_dist/bin/tasks-axi.js" && test -f "$axi_dist/src/backends/markdown-grammar.js" && test -f "$axi_dist/src/view.js" || fail 'The installed tasks-axi package lacks required modules.'
  printf '#!/bin/sh\nentry=$0\nif [ -L "$entry" ]; then entry=$(readlink "$entry"); fi\nexec bun "$(dirname "$entry")/tasks-axi.js" "$@"\n' > "$axi_dist/bin/tasks-axi-bun"
  chmod +x "$axi_dist/bin/tasks-axi-bun"
fi
if [ -e "$install_dir" ]; then
  backup=$(mktemp -d "$HOME/.local/share/tasks-tui-backup.XXXXXX")
  mv "$install_dir" "$backup/previous"
fi
mv "$tmp/package" "$install_dir"
if [ ! -L "$bindir/tasks-tui" ]; then
  ln -s "$install_dir/bin/tasks-tui" "$bindir/tasks-tui"
fi
if [ -z "$axi" ] || [ "$link_axi" -eq 1 ]; then
  ln -s "$install_dir/axi/node_modules/tasks-axi/dist/bin/tasks-axi-bun" "$bindir/tasks-axi"
fi
committed=1
if [ -n "$backup" ]; then rm -rf "$backup"; fi
case "${SHELL:-/bin/sh}" in
  */fish) profiles="${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish"; style=fish ;;
  */zsh) profiles=zsh; style=sh ;;
  */bash) profiles=bash; style=sh ;;
  *) profiles="$HOME/.profile"; style=sh ;;
esac
quoted_bun=$(printf '%s' "$bun_dir" | sed "s/'/'\\\\''/g")
quoted_bin=$(printf '%s' "$bindir" | sed "s/'/'\\\\''/g")
if [ "$style" = fish ]; then
  line="fish_add_path --move '$quoted_bun' '$quoted_bin'"
else
  line="export PATH='$quoted_bun':'$quoted_bin':\"\$PATH\""
fi
if [ "$profiles" = bash ]; then
  if [ -f "$HOME/.bash_profile" ]; then
    login_profile="$HOME/.bash_profile"
  elif [ -f "$HOME/.bash_login" ]; then
    login_profile="$HOME/.bash_login"
  elif [ -f "$HOME/.profile" ]; then
    login_profile="$HOME/.profile"
  else
    login_profile="$HOME/.bash_profile"
  fi
  set -- "$login_profile" "$HOME/.bashrc"
elif [ "$profiles" = zsh ]; then
  set -- "${ZDOTDIR:-$HOME}/.zprofile" "${ZDOTDIR:-$HOME}/.zshrc"
else
  set -- "$profiles"
fi
for profile do
  mkdir -p "$(dirname "$profile")"
  touch "$profile"
  if ! grep -Fqx "$line" "$profile"; then
    printf '\n%s\n' "$line" >> "$profile"
    printf 'Added %s and %s to PATH in %s.\n' "$bun_dir" "$bindir" "$profile"
  fi
done
printf 'Installed tasks-tui. Open a new shell to run tasks-tui.\n'
