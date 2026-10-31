#!/bin/sh
set -eu

fail() { printf '%s\n' "$*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || fail 'curl is required: install curl with your system package manager.'
command -v bun >/dev/null 2>&1 || fail 'Bun is required: curl -fsSL https://bun.sh/install | bash (then add ~/.bun/bin to PATH).'
bun -e 'const v = Bun.version.split(".").map(Number); process.exit(v[0] > 1 || (v[0] === 1 && (v[1] > 3 || (v[1] === 3 && v[2] >= 14))) ? 0 : 1)' || fail 'Bun 1.3.14+ is required: curl -fsSL https://bun.sh/install | bash'
command -v node >/dev/null 2>&1 || fail 'Node.js 20+ is required: install it from https://nodejs.org/ and add node to PATH.'
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || fail 'Node.js 20+ is required: install it from https://nodejs.org/ and add node to PATH.'
command -v tasks-axi >/dev/null 2>&1 || fail 'tasks-axi is required: npm install -g tasks-axi'
node -e 'const fs = require("fs"), path = require("path"); try { const base = path.dirname(path.dirname(fs.realpathSync(process.argv[1]))); for (const file of ["src/backends/markdown-grammar.js", "src/view.js"]) fs.accessSync(path.join(base, file)); } catch { process.exit(1); }' "$(command -v tasks-axi)" || fail 'The installed tasks-axi lacks required parser modules: npm install -g tasks-axi@latest'

case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) fail 'Supported systems: macOS and Linux.' ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) fail 'Supported architectures: arm64 and x64.' ;; esac
bindir=${TASKS_TUI_BIN_DIR:-"$HOME/.local/bin"}
case ":$PATH:" in *":$bindir:"*) ;; *) fail "Add $bindir to PATH, then rerun the installer: export PATH=\"$bindir:\$PATH\"" ;; esac
mkdir -p "$bindir" "$HOME/.local/share"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/tasks-tui.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
url="https://github.com/itsmistermoon/tasks-tui/releases/latest/download/tasks-tui-$os-$arch.tar.gz"
curl -fL "$url" -o "$tmp/tasks-tui.tar.gz" || fail "Could not download $url. A release with installation artifacts is required."
mkdir "$tmp/package"
tar -xzf "$tmp/tasks-tui.tar.gz" -C "$tmp/package"
test -x "$tmp/package/bin/tasks-backend" && test -f "$tmp/package/opentui/app.ts" || fail 'Invalid release archive.'
install_dir="$HOME/.local/share/tasks-tui"
rm -rf "$install_dir"
mv "$tmp/package" "$install_dir"
ln -sf "$install_dir/bin/tasks-tui" "$bindir/tasks-tui"
printf 'Installed tasks-tui in %s. Run tasks-tui from any directory.\n' "$bindir"
