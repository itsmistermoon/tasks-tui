package main

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type snapshotResult struct {
	Tasks   []Task   `json:"tasks"`
	Errors  []string `json:"errors"`
	Sources []string `json:"sources"`
	Failed  []string `json:"failed"`
}

type snapshotSession struct {
	store Store
	known map[string]bool
}

func (session *snapshotSession) snapshot(args []string, output io.Writer) error {
	cwd, _ := os.Getwd()
	var c Settings
	if b, e := os.ReadFile(settingsPath()); e == nil {
		json.Unmarshal(b, &c)
	}
	seen := map[string]bool{}
	r := snapshotResult{Tasks: []Task{}, Errors: []string{}, Sources: []string{}, Failed: []string{}}
	paths := append(append(c.Sources, discover(cwd)...), args...)
	for path := range session.known {
		if _, err := os.Stat(path); err != nil {
			paths = append(paths, path)
		}
	}
	for _, path := range paths {
		path = resolveSource(path)
		if real, e := filepath.EvalSymlinks(path); e == nil {
			path = real
		}
		if seen[path] {
			continue
		}
		seen[path] = true
		r.Sources = append(r.Sources, path)
		session.known[path] = true
		tasks, e := session.store.Load(path)
		if e != nil {
			r.Errors = append(r.Errors, sourceName(path)+": "+e.Error())
			r.Failed = append(r.Failed, path)
			if old, ok := session.store.cache[path]; ok {
				r.Tasks = append(r.Tasks, old.tasks...)
			}
			continue
		}
		r.Tasks = append(r.Tasks, tasks...)
	}
	return json.NewEncoder(output).Encode(r)
}

func serveSnapshots(args []string) error {
	s := snapshotSession{store: Store{cache: map[string]sourceCache{}}, known: map[string]bool{}}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		if err := s.snapshot(args, os.Stdout); err != nil {
			return err
		}
	}
	return scanner.Err()
}

// sourceName gives a compact, distinct label for snapshot errors.
func sourceName(p string) string {
	p = filepath.Clean(p)
	if filepath.Base(p) == "backlog.md" {
		p = filepath.Dir(p)
		if filepath.Base(p) == "data" {
			p = filepath.Dir(p)
		}
	}
	p = strings.TrimPrefix(p, userHome()+string(filepath.Separator))
	parts := strings.Split(p, string(filepath.Separator))
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}
	return strings.Join(parts, " ‹ ")
}
