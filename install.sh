#!/bin/sh
set -eu

fail() { printf '%s\n' "$*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || fail 'curl is required to download the installer and release.'
case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) fail 'Supported systems: macOS and Linux.' ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) fail 'Supported architectures: arm64 and x64.' ;; esac
bindir=${TASKS_TUI_BIN_DIR:-"$HOME/.local/bin"}
case "$bindir" in /*) ;; *) fail 'TASKS_TUI_BIN_DIR must be an absolute path.' ;; esac
bun_dir=${BUN_INSTALL:-"$HOME/.bun"}/bin
PATH="$bindir:$bun_dir:$PATH"
export PATH
bindir=${TASKS_TUI_BIN_DIR:-"$HOME/.local/bin"}
case "$bindir" in /*) ;; *) fail 'TASKS_TUI_BIN_DIR must be an absolute path.' ;; esac
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
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
url="https://github.com/itsmistermoon/tasks-tui/releases/latest/download/tasks-tui-$os-$arch.tar.gz"
curl -fL "$url" -o "$tmp/tasks-tui.tar.gz" || fail "Could not download $url."
mkdir "$tmp/package"
tar -xzf "$tmp/tasks-tui.tar.gz" -C "$tmp/package"
test -x "$tmp/package/bin/tasks-backend" && test -f "$tmp/package/opentui/app.ts" || fail 'Invalid release archive.'
printf '%s\n' 'Installing tasks-axi...'
mkdir "$tmp/package/axi"
(cd "$tmp/package/axi" && bun add tasks-axi) || fail 'Could not install tasks-axi with Bun.'
axi_dist="$tmp/package/axi/node_modules/tasks-axi/dist"
test -f "$axi_dist/bin/tasks-axi.js" && test -f "$axi_dist/src/backends/markdown-grammar.js" && test -f "$axi_dist/src/view.js" || fail 'The installed tasks-axi package lacks required modules.'
printf '#!/bin/sh\nentry=$0\nif [ -L "$entry" ]; then entry=$(readlink "$entry"); fi\nexec bun "$(dirname "$entry")/tasks-axi.js" "$@"\n' > "$axi_dist/bin/tasks-axi-bun"
chmod +x "$axi_dist/bin/tasks-axi-bun"
install_dir="$HOME/.local/share/tasks-tui"
rm -rf "$install_dir"
mv "$tmp/package" "$install_dir"
ln -sf "$install_dir/bin/tasks-tui" "$bindir/tasks-tui"
ln -sf "$install_dir/axi/node_modules/tasks-axi/dist/bin/tasks-axi-bun" "$bindir/tasks-axi"
case "${SHELL:-/bin/sh}" in
  */fish) profile="${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish"; style=fish ;;
  */zsh) profile="$HOME/.zprofile"; style=sh ;;
  */bash) profile="$HOME/.bash_profile"; style=sh ;;
  *) profile="$HOME/.profile"; style=sh ;;
esac
mkdir -p "$(dirname "$profile")"
touch "$profile"
for dir in "$bun_dir" "$bindir"; do
  quoted=$(printf '%s' "$dir" | sed "s/'/'\\\\''/g")
  if [ "$style" = fish ]; then line="fish_add_path '$quoted'"; else line="export PATH='$quoted':\"\$PATH\""; fi
  if ! grep -Fqx "$line" "$profile"; then
    printf '\n%s\n' "$line" >> "$profile"
    printf 'Added %s to PATH in %s.\n' "$dir" "$profile"
  fi
done
printf 'Installed tasks-tui. Open a new shell to run tasks-tui.\n'
