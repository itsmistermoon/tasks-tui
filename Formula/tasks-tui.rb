# frozen_string_literal: true

# Homebrew package for the tasks-tui release archives.
class TasksTui < Formula
  desc "Read-only terminal viewer for tasks-axi backlogs"
  homepage "https://github.com/itsmistermoon/tasks-tui"
  version "0.3.0"

  depends_on "bun"
  depends_on "node"

  on_macos do
    on_arm do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.3.0/tasks-tui-darwin-arm64.tar.gz"
      sha256 "738e0c11c1736c41c8e71ecee3973c736aed828e61c1ef5ec9f7cb92b8a4f745"
    end
    on_intel do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.3.0/tasks-tui-darwin-x64.tar.gz"
      sha256 "9b83f753fe8b0e837c9fe0d90eee1baad7b900bdeff10f3e2014d1af46ddc6f2"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.3.0/tasks-tui-linux-arm64.tar.gz"
      sha256 "e1f97cf32ec54db31997f032cd9480ee67395f021e3c7cc1b7c1574b684b34cc"
    end
    on_intel do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.3.0/tasks-tui-linux-x64.tar.gz"
      sha256 "67701dd707d120ccdf0cf888e87d093d84186cb8277b9061b9e727df4b32a539"
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
