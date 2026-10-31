# frozen_string_literal: true

# Disabled until a release supplies the platform archives.
class TasksTui < Formula
  desc "Read-only terminal viewer for tasks-axi backlogs"
  homepage "https://github.com/itsmistermoon/tasks-tui"
  url "https://github.com/itsmistermoon/tasks-tui/archive/refs/tags/v0.2.0.tar.gz"
  version "0.2.0"
  disable! date: "2026-01-01", because: "release archives are not yet available"
end
