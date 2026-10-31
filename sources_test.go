package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSourcePathsDeduplicateAndKeepMissingKnownSources(t *testing.T) {
	root := t.TempDir()
	t.Setenv("HOME", root)
	t.Setenv("TASKS_AXI_FILE", "")
	backlog := filepath.Join(root, "backlog.md")
	if err := os.WriteFile(backlog, []byte("## Queued\n"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "alias.md")
	if err := os.Symlink(backlog, link); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(root, "missing.md")
	paths := sourcePaths(root, []string{backlog}, []string{link}, map[string]bool{missing: true})
	counts := map[string]int{}
	for _, path := range paths {
		counts[path]++
	}
	realBacklog, _ := filepath.EvalSymlinks(backlog)
	if len(paths) != 2 || counts[realBacklog] != 1 || counts[missing] != 1 {
		t.Fatalf("unexpected paths: %#v", paths)
	}
}
