package main

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/pelletier/go-toml/v2"
)

func archivePath(file string) string {
	d := filepath.Dir(file)
	for _, root := range []string{d, filepath.Dir(d)} {
		b, e := os.ReadFile(filepath.Join(root, ".tasks.toml"))
		if e != nil {
			continue
		}
		var c struct {
			Markdown struct{ Path, Archive string }
		}
		if toml.Unmarshal(b, &c) == nil && c.Markdown.Archive != "" {
			p := c.Markdown.Path
			if p == "" {
				for _, candidate := range []string{"backlog.md", "data/backlog.md"} {
					if _, err := os.Stat(filepath.Join(root, candidate)); err == nil {
						p = candidate
						break
					}
				}
			}
			if !filepath.IsAbs(p) {
				p = filepath.Join(root, p)
			}
			if filepath.Clean(p) == file {
				a := c.Markdown.Archive
				if !filepath.IsAbs(a) {
					a = filepath.Join(root, a)
				}
				return a
			}
		}
	}
	return filepath.Join(d, "done-archive.md")
}
func resolveSource(p string) string {
	a, _ := filepath.Abs(p)
	if st, e := os.Stat(a); e == nil && st.IsDir() {
		for _, cf := range []string{filepath.Join(a, ".tasks.toml"), filepath.Join(userHome(), ".tasks-axi/config.toml")} {
			b, e := os.ReadFile(cf)
			if e != nil {
				continue
			}
			var c struct{ Markdown struct{ Path string } }
			if toml.Unmarshal(b, &c) == nil && c.Markdown.Path != "" {
				if filepath.IsAbs(c.Markdown.Path) {
					return c.Markdown.Path
				}
				return filepath.Join(a, c.Markdown.Path)
			}
		}
		for _, f := range []string{"backlog.md", "data/backlog.md"} {
			p := filepath.Join(a, f)
			if _, e := os.Stat(p); e == nil {
				return p
			}
		}
		return filepath.Join(a, "backlog.md")
	}
	return a
}
func userHome() string { h, _ := os.UserHomeDir(); return h }
func discover(cwd string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(p string) {
		p = resolveSource(p)
		if real, e := filepath.EvalSymlinks(p); e == nil {
			p = real
		}
		if _, e := os.Stat(p); e == nil && !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	if p := os.Getenv("TASKS_AXI_FILE"); p != "" {
		add(p)
	} else {
		add(cwd)
	}
	for _, root := range []string{cwd, filepath.Join(userHome(), ".treehouse"), filepath.Join(userHome(), ".fm"), filepath.Join(userHome(), "projects")} {
		filepath.WalkDir(root, func(p string, d os.DirEntry, e error) error {
			if e != nil {
				return nil
			}
			if root == userHome() && p != root && d.IsDir() {
				return filepath.SkipDir
			}
			if d.IsDir() {
				rel, _ := filepath.Rel(root, p)
				if strings.Count(rel, string(os.PathSeparator)) > 6 {
					return filepath.SkipDir
				}
				switch d.Name() {
				case "node_modules", ".git", "vendor", ".cache":
					return filepath.SkipDir
				}
				return nil
			}
			if d.Name() == "backlog.md" {
				add(p)
			}
			if d.Name() == ".tasks.toml" {
				add(filepath.Dir(p))
			}
			return nil
		})
	}
	return out
}

// sourcePaths resolves and deduplicates configured, discovered, explicit and missing known sources.
func sourcePaths(cwd string, configured, explicit []string, known map[string]bool) []string {
	paths := append(append(append([]string{}, configured...), discover(cwd)...), explicit...)
	for path := range known {
		if _, err := os.Stat(path); err != nil {
			paths = append(paths, path)
		}
	}
	seen := map[string]bool{}
	result := make([]string, 0, len(paths))
	for _, path := range paths {
		path = resolveSource(path)
		if real, err := filepath.EvalSymlinks(path); err == nil {
			path = real
		}
		if !seen[path] {
			seen[path] = true
			result = append(result, path)
		}
	}
	return result
}
