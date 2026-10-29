package main

import (
	"os"
	"testing"
	"time"
)

func TestRealLoadTiming(t *testing.T) {
	p := os.Getenv("TASKS_TUI_BENCH_FILE")
	if p == "" {
		t.Skip("set TASKS_TUI_BENCH_FILE")
	}
	s := Store{cache: map[string]sourceCache{}}
	start := time.Now()
	tasks, e := s.Load(p)
	if e != nil {
		t.Fatal(e)
	}
	t.Logf("cold load: %s, tasks: %d", time.Since(start), len(tasks))
	start = time.Now()
	_, e = s.Load(p)
	if e != nil {
		t.Fatal(e)
	}
	t.Logf("unchanged load: %s", time.Since(start))
}

func TestRealStartupTiming(t *testing.T) {
	if os.Getenv("TASKS_TUI_BENCH_FILE") == "" {
		t.Skip("opt-in local measurement")
	}
	cwd, _ := os.Getwd()
	start := time.Now()
	sources := discover(cwd)
	t.Logf("discovery: %s, sources: %d", time.Since(start), len(sources))
	s := Store{cache: map[string]sourceCache{}}
	count := 0
	for _, p := range sources {
		tasks, e := s.Load(p)
		if e != nil {
			t.Fatal(e)
		}
		count += len(tasks)
	}
	t.Logf("discovery + complete load: %s, tasks: %d", time.Since(start), count)
}
