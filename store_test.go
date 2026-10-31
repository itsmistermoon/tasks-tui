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
func TestReaderWorksWithoutNode(t *testing.T) {
	bun, err := exec.LookPath("bun")
	if err != nil { t.Fatal(err) }
	axi, err := exec.LookPath("tasks-axi")
	if err != nil { t.Fatal(err) }
	dir := t.TempDir()
	for name, target := range map[string]string{"bun": bun, "tasks-axi": axi} {
		if err := os.Symlink(target, filepath.Join(dir, name)); err != nil { t.Fatal(err) }
	}
	t.Setenv("PATH", dir)
	tasks, err := readBatch("backlog.md", []byte("## Queued\n- [ ] sample - Example task\n"), nil)
	if err != nil || len(tasks) != 1 || tasks[0].Get("id") != "sample" {
		t.Fatalf("reader failed without Node: %#v, %v", tasks, err)
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

func TestCountOutputAndExplicitSource(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "backlog.md")
	if err := os.WriteFile(p, []byte("## In flight\n- [ ] active - Active\n## Queued\n- [ ] queued - Waiting\n"), 0600); err != nil {
		t.Fatal(err)
	}
	var output strings.Builder
	if err := printCounts([]string{p, "--json"}, &output); err != nil {
		t.Fatal(err)
	}
	var got struct {
		Total    int            `json:"total"`
		Statuses map[string]int `json:"statuses"`
	}
	if err := json.Unmarshal([]byte(output.String()), &got); err != nil {
		t.Fatal(err)
	}
	if got.Total < 2 || got.Statuses["In progress"] < 1 || got.Statuses["Queued"] < 1 {
		t.Fatalf("unexpected count: %#v", got)
	}
}

func TestCountKeepsReadableBacklogsWhenAnotherFails(t *testing.T) {
	d := t.TempDir()
	readable := filepath.Join(d, "readable.md")
	unreadable := filepath.Join(d, "missing.md")
	if err := os.WriteFile(readable, []byte("## Queued\n- [ ] queued - Waiting\n"), 0600); err != nil {
		t.Fatal(err)
	}
	var output strings.Builder
	if err := printCounts([]string{readable, unreadable, "--json"}, &output); err != nil {
		t.Fatal(err)
	}
	var got struct {
		Total  int            `json:"total"`
		Errors []string       `json:"errors"`
		Status map[string]int `json:"statuses"`
	}
	if err := json.Unmarshal([]byte(output.String()), &got); err != nil {
		t.Fatal(err)
	}
	if got.Total < 1 || got.Status["Queued"] < 1 || len(got.Errors) != 1 {
		t.Fatalf("unexpected partial count: %#v", got)
	}
}

func TestDiscoverUsesTasksAxiFile(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "custom.md")
	if err := os.WriteFile(p, []byte("## Queued\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TASKS_AXI_FILE", p)
	got := discover(filepath.Join(d, "elsewhere"))
	resolved, err := filepath.EvalSymlinks(p)
	found := false
	for _, source := range got {
		if filepath.Clean(source) == filepath.Clean(resolved) {
			found = true
			break
		}
	}
	if err != nil || !found {
		t.Fatalf("TASKS_AXI_FILE source not discovered: %#v", got)
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
	for _, task := range tasks {
		if task.ArchivedAt != "2026-10-01" {
			t.Fatalf("archive date missing: %#v", task)
		}
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
