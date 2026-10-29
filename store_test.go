package main

import (
	"context"
	"encoding/json"
	"fmt"
	toon "github.com/toon-format/toon-go"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCLIReadAndArchive(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "backlog.md")
	os.WriteFile(p, []byte("## Queued\n- [ ] sample - Example task (kind: ship) (repo: demo) (priority: 0)\n  Complete notes with a unique needle.\n"), 0600)
	os.WriteFile(filepath.Join(d, "done-archive.md"), []byte("## Archived 2026-10-01\n- [x] old-task - Completed task (merged 2026-10-01)\n  Historical notes.\n"), 0600)
	s := Store{cache: map[string]sourceCache{}}
	ts, e := s.Load(p)
	if e != nil {
		t.Fatal(e)
	}
	if len(ts) != 2 {
		t.Fatalf("expected live and archived tasks, got %#v", ts)
	}
	if !strings.Contains(ts[0].Get("body"), "unique needle") {
		t.Fatalf("full body missing: %#v", ts[0])
	}
	if !ts[1].Archived || ts[1].Get("state") != "done" {
		t.Fatal("archive not recognized")
	}
	before, _ := os.ReadFile(p)
	os.WriteFile(p, []byte(strings.ReplaceAll(string(before), "Example task", "Changed task")), 0600)
	ts, e = s.Load(p)
	if e != nil || ts[0].Get("title") != "Changed task" {
		t.Fatalf("refresh failed: %v %#v", e, ts)
	}
}
func TestDiscoverDeduplicates(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "backlog.md")
	os.WriteFile(p, []byte("## Queued\n"), 0600)
	if resolveSource(d) != p {
		t.Fatal("directory resolution failed")
	}
}

func call(file string, args ...string) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	args = append(args, "--file", file)
	c := exec.CommandContext(ctx, "tasks-axi", args...)
	b, e := c.Output()
	if e != nil {
		if x, ok := e.(*exec.ExitError); ok {
			return nil, fmt.Errorf("%s", strings.TrimSpace(string(x.Stderr)))
		}
		return nil, e
	}
	v, e := toon.Decode(b)
	if e != nil {
		return nil, e
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("unexpected tasks-axi response")
	}
	return m, nil
}

func TestBatchMatchesCLIDetail(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "backlog.md")
	os.WriteFile(p, []byte("## In flight\n- [ ] blocker - Blocking work (kind: ship)\n## Queued\n- [ ] sample - A complete title that must not be truncated even when it is longer than eighty characters total in length (repo: demo) (priority: 0) blocked-by: blocker\n  "+strings.Repeat("Full notes. ", 100)+"\n- [ ] paused - Paused work (hold: waiting for decision) (hold-kind: captain)\n"), 0600)
	s := Store{cache: map[string]sourceCache{}}
	tasks, e := s.Load(p)
	if e != nil {
		t.Fatal(e)
	}
	for _, task := range tasks {
		detail, e := call(p, "show", task.Get("id"), "--full")
		if e != nil {
			t.Fatal(e)
		}
		m, ok := detail["task"].(map[string]any)
		if !ok {
			t.Fatal("missing CLI task")
		}
		for k, v := range m {
			if fmt.Sprint(v) != fmt.Sprint(task.Data[k]) {
				t.Fatalf("%s: field %s differs: CLI=%v batch=%v", task.Get("id"), k, v, task.Data[k])
			}
		}
	}
}

func TestArchivedOpenTasksRemainVisible(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "backlog.md")
	os.WriteFile(p, []byte("## Queued\n"), 0600)
	os.WriteFile(filepath.Join(d, "done-archive.md"), []byte("## Archived 2026-10-01\n- [ ] old-open - Previously open\n- [x] old-done - Previously completed\n"), 0600)
	tasks, err := (&Store{cache: map[string]sourceCache{}}).Load(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 2 {
		t.Fatalf("expected both archived tasks, got %#v", tasks)
	}
}

func TestArchiveConfiguredForDiscoveredBacklog(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "backlog.md")
	os.WriteFile(p, []byte("## Queued\n"), 0600)
	os.WriteFile(filepath.Join(d, ".tasks.toml"), []byte("[markdown]\narchive = \"history.md\"\n"), 0600)
	os.WriteFile(filepath.Join(d, "history.md"), []byte("## Archived 2026-10-01\n- [x] old - Archived\n"), 0600)
	tasks, err := (&Store{cache: map[string]sourceCache{}}).Load(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 1 || tasks[0].Get("id") != "old" {
		t.Fatalf("configured history missing: %#v", tasks)
	}
}

func TestSnapshotProcess(t *testing.T) {
	if os.Getenv("TASKS_TEST_PROCESS") != "1" {
		return
	}
	os.Args = []string{"tasks-backend", "--serve"}
	main()
	os.Exit(0)
}

func TestSnapshotRetainsDisappearedBacklog(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "backlog.md")
	os.WriteFile(p, []byte("## Queued\n- [ ] sample - Task\n"), 0600)
	c := exec.Command(os.Args[0], "-test.run=TestSnapshotProcess")
	c.Dir = d
	c.Env = append(os.Environ(), "TASKS_TEST_PROCESS=1", "HOME="+d)
	in, err := c.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	out, err := c.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = c.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { in.Close(); c.Wait() }()
	dec := json.NewDecoder(out)
	fmt.Fprintln(in, "snapshot")
	var first struct {
		Tasks  []Task
		Failed []string
	}
	if err := dec.Decode(&first); err != nil {
		t.Fatal(err)
	}
	if len(first.Tasks) != 1 {
		t.Fatalf("initial tasks: %#v", first.Tasks)
	}
	os.Remove(p)
	fmt.Fprintln(in, "snapshot")
	var second struct {
		Tasks  []Task
		Failed []string
	}
	if err := dec.Decode(&second); err != nil {
		t.Fatal(err)
	}
	if len(second.Tasks) != 1 || len(second.Failed) != 1 {
		t.Fatalf("expected stale snapshot: %#v", second)
	}
}

func TestArchivePreservesRecordedState(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "backlog.md")
	os.WriteFile(p, []byte("## Queued\n"), 0600)
	os.WriteFile(filepath.Join(d, "done-archive.md"), []byte("## Archived 2026-10-01 (queued)\n- [ ] queued-old - Previously queued\n"), 0600)
	tasks, err := (&Store{cache: map[string]sourceCache{}}).Load(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 1 || tasks[0].Get("state") != "queued" {
		t.Fatalf("archive state lost: %#v", tasks)
	}
}
