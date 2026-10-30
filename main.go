package main

import (
	"fmt"
	"os"
)

// The OpenTUI frontend invokes the backend for snapshots and note history.
func main() {
	if len(os.Args) > 1 && os.Args[1] == "--serve" {
		if err := serveSnapshots(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "--count" {
		if err := printCounts(os.Args[2:], os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if len(os.Args) == 4 && os.Args[1] == "--history" {
		fmt.Print(noteHistory(Task{Source: os.Args[2], Data: map[string]any{"id": os.Args[3]}}))
		return
	}
	fmt.Fprintln(os.Stderr, "usage: tasks-backend --serve [source ...] | --count [--json] [source ...] | --history <source> <task-id>")
	os.Exit(2)
}
