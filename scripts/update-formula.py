#!/usr/bin/env python3
"""Render the Homebrew formula from the four exact release archives."""
import hashlib
import pathlib
import re
import sys

if len(sys.argv) != 4 or not re.fullmatch(r"v?[0-9]+\.[0-9]+\.[0-9]+", sys.argv[1]):
    raise SystemExit("usage: update-formula.py vX.Y.Z ARCHIVE_DIR OUTPUT")
tag, archive_dir, output = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
version = tag.removeprefix("v")
checksums = {}
for platform in ("darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"):
    archive = archive_dir / f"tasks-tui-{platform}.tar.gz"
    checksums[platform] = hashlib.sha256(archive.read_bytes()).hexdigest()

formula = f'''# frozen_string_literal: true

# Homebrew package for the tasks-tui release archives.
class TasksTui < Formula
  desc "Read-only terminal viewer for tasks-axi backlogs"
  homepage "https://github.com/itsmistermoon/tasks-tui"
  version "{version}"

  depends_on "bun"
  depends_on "node"

  on_macos do
    on_arm do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/{tag}/tasks-tui-darwin-arm64.tar.gz"
      sha256 "{checksums['darwin-arm64']}"
    end
    on_intel do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/{tag}/tasks-tui-darwin-x64.tar.gz"
      sha256 "{checksums['darwin-x64']}"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/{tag}/tasks-tui-linux-arm64.tar.gz"
      sha256 "{checksums['linux-arm64']}"
    end
    on_intel do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/{tag}/tasks-tui-linux-x64.tar.gz"
      sha256 "{checksums['linux-x64']}"
    end
  end

  def install
    libexec.install "bin", "opentui", "axi"
    (bin/"tasks-tui").write <<~SH
      #!/bin/sh
      export PATH="#{{libexec}}/axi/node_modules/.bin:$PATH"
      exec "#{{libexec}}/bin/tasks-tui" "$@"
    SH
  end

  test do
    (testpath/"backlog.md").write "## Queued\\n- [ ] sample - Example task\\n"
    assert_match "Queued", shell_output("#{{bin}}/tasks-tui --count --json #{{testpath}}/backlog.md")
  end
end
'''
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(formula)
