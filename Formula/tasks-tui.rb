# frozen_string_literal: true

# Homebrew package for the tasks-tui release archives.
class TasksTui < Formula
  desc "Read-only terminal viewer for tasks-axi backlogs"
  homepage "https://github.com/itsmistermoon/tasks-tui"
  version "0.3.1"

  depends_on "bun"
  depends_on "node"

  on_macos do
    on_arm do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.3.1/tasks-tui-darwin-arm64.tar.gz"
      sha256 "d39dca942019a4a70ceeec580794d199ab9abc2edeeca0b280b8b54bc65ec9b9"
    end
    on_intel do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.3.1/tasks-tui-darwin-x64.tar.gz"
      sha256 "1e53d7004c4fec4da5c7516725008cfb56e13ac0a31b877931cd95827dfb3158"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.3.1/tasks-tui-linux-arm64.tar.gz"
      sha256 "19a485e8efb7f08ec2efe016d435fc8cf6dc27c9b582e217be95c46c2e5f3aaa"
    end
    on_intel do
      url "https://github.com/itsmistermoon/tasks-tui/releases/download/v0.3.1/tasks-tui-linux-x64.tar.gz"
      sha256 "14520757995e8b6354b970914439b369a991a9d71d9dc549a08057d89ff28eec"
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
