# frozen_string_literal: true

# Homebrew package for the tasks-tui release archives.
class TasksTui < Formula
  desc "Terminal viewer and manager for tasks-axi backlogs"
  homepage "https://github.com/itsmistermoon/tasks-tui"
  version "0.4.0"

  depends_on "bun"
  depends_on "node"

  on_macos do
    on_arm do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.4.0/tasks-tui-darwin-arm64.tar.gz"
      sha256 "ec202cfaea329e0d8d2c5effdc95f0c3e94a5b156e5d4a1d48de4723e6fa2116"
    end
    on_intel do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.4.0/tasks-tui-darwin-x64.tar.gz"
      sha256 "c3db9ef86bc2b8d6ddf8f5a0cf5f0a33c35e021b5fc271e71756e406d27695af"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.4.0/tasks-tui-linux-arm64.tar.gz"
      sha256 "6c7ce3a5ea40cd22c397aa99a07bce43dbb20cb79e7fcaa07203dc2badfe764a"
    end
    on_intel do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.4.0/tasks-tui-linux-x64.tar.gz"
      sha256 "0e20df69a5c02de58486bdbb89b778aa6847e5d97b29f39905b0612b2e62b60b"
    end
  end

  def install
    libexec.install "bin", "opentui", "axi"
    (bin/"tasks-tui").write <<~SH
      #!/bin/sh
      export PATH="#{libexec}/axi/node_modules/.bin:$PATH"
      exec "#{libexec}/bin/tasks-tui" "$@"
    SH
  end

  test do
    (testpath/"backlog.md").write "## Queued\n- [ ] sample - Example task\n"
    assert_match "Queued", shell_output("#{bin}/tasks-tui --count --json #{testpath}/backlog.md")
  end
end
