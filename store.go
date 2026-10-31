package main

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Task struct {
	Data        map[string]any
	Source, Key string
	Archived    bool
	ArchivedAt  string
}

func (t Task) Get(k string) string {
	v := t.Data[k]
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		if s == "-" || s == "none" {
			return ""
		}
		return s
	}
	b, _ := json.Marshal(v)
	return string(b)
}

type Settings struct {
	Sources []string `json:"sources"`
}

func settingsPath() string {
	d, e := os.UserConfigDir()
	if e != nil {
		d = "."
	}
	return filepath.Join(d, "tasks-tui", "settings.json")
}

type sourceCache struct {
	hash  [32]byte
	tasks []Task
}
type Store struct {
	cache map[string]sourceCache
	mu    sync.Mutex
}

func (s *Store) Load(file string) ([]Task, error) {
	b, e := os.ReadFile(file)
	if e != nil {
		return nil, e
	}
	archive := archivePath(file)
	ab, ae := os.ReadFile(archive)
	if ae != nil && !os.IsNotExist(ae) {
		return nil, ae
	}
	hash := sha256.Sum256(append(append(b, 0), ab...))
	s.mu.Lock()
	old, ok := s.cache[file]
	s.mu.Unlock()
	if ok && old.hash == hash {
		return old.tasks, nil
	}
	out, e := readBatch(file, b, ab)
	if e != nil {
		return nil, e
	}

	s.mu.Lock()
	s.cache[file] = sourceCache{hash, out}
	s.mu.Unlock()
	return out, nil
}

//go:embed reader.mjs
var batchReader string

func readBatch(file string, live, archive []byte) ([]Task, error) {
	bin, e := exec.LookPath("tasks-axi")
	if e != nil {
		return nil, e
	}
	bin, e = filepath.EvalSymlinks(bin)
	if e != nil {
		return nil, e
	}
	dist := filepath.Dir(filepath.Dir(bin))
	input, _ := json.Marshal(map[string]string{"live": string(live), "archive": string(archive)})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "node", "--input-type=module", "-e", batchReader, dist)
	cmd.Stdin = strings.NewReader(string(input))
	output, e := cmd.Output()
	if e != nil {
		if x, ok := e.(*exec.ExitError); ok {
			return nil, fmt.Errorf("tasks-axi batch reader: %s", strings.TrimSpace(string(x.Stderr)))
		}
		return nil, e
	}
	var rows []struct {
		Data       map[string]any
		Archived   bool
		ArchivedAt string
	}
	if e = json.Unmarshal(output, &rows); e != nil {
		return nil, e
	}
	out := make([]Task, 0, len(rows))
	for _, r := range rows {
		suffix := ":"
		if r.Archived {
			suffix = ":archive:"
		}
		out = append(out, Task{Data: r.Data, Source: file, Key: file + suffix + fmt.Sprint(r.Data["id"]), Archived: r.Archived, ArchivedAt: r.ArchivedAt})
	}
	return out, nil
}

// History is displayed as original Markdown blocks, without interpreting reserved metadata.
func noteHistory(t Task) string {
	b, e := os.ReadFile(filepath.Join(filepath.Dir(t.Source), "note-archive.md"))
	if os.IsNotExist(e) {
		return "No archived note versions available."
	}
	if e != nil {
		return e.Error()
	}
	var out []string
	date := ""
	record := ""
	active := false
	flush := func() {
		if active {
			out = append(out, date+"\n"+record)
		}
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "## ") {
			flush()
			record = ""
			active = false
			date = line
			continue
		}
		if strings.HasPrefix(line, "- ") {
			flush()
			record = ""
			active = false
			for _, prefix := range []string{"- [ ] ", "- [x] ", "- **"} {
				if strings.HasPrefix(line, prefix+t.Get("id")+" -") || strings.HasPrefix(line, prefix+t.Get("id")+"**") {
					active = true
					break
				}
			}
		}
		if active && !strings.HasPrefix(strings.TrimSpace(line), "<!--") {
			record += line + "\n"
		}
	}
	flush()
	if len(out) == 0 {
		return "No archived note versions found for this task."
	}
	return strings.Join(out, "\n────────────────────────────────\n")
}
