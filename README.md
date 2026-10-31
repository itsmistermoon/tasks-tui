# tasks-tui

A terminal viewer and manager for [tasks-axi](https://github.com/kunchenguid/tasks-axi) backlogs, built with [OpenTUI](https://opentui.com/).

Browse work across backlogs, search task notes, inspect the context behind a task, and change it without leaving the terminal. The Markdown files remain the source of truth; every change is made by running `tasks-axi`.

## Why

A task's title is only part of the picture. Its status, dependencies, hold reason, notes, and source backlog all help explain what is happening. `tasks-tui` brings those details together in a navigable view while keeping the underlying backlog readable and editable by your existing tools.

## Quick start

Install on macOS or Linux (arm64 or x64):

```sh
curl -fsSL https://raw.githubusercontent.com/itsmistermoon/tasks-tui/main/install.sh | sh
```

The installer downloads a prebuilt release, installs Bun 1.3.14+ when needed, and installs `tasks-axi` using Bun if it is missing. It installs to `~/.local/share/tasks-tui`, links `tasks-tui` and, when installed, `tasks-axi` into `~/.local/bin`, and adds the command and Bun directories to your shell profile. Open a new shell after installation. Set `TASKS_TUI_BIN_DIR` to choose another absolute directory for the commands.

Alternatively, install with Homebrew:

```sh
brew tap itsmistermoon/tasks-tui https://github.com/itsmistermoon/tasks-tui
brew install itsmistermoon/tasks-tui/tasks-tui
```

Homebrew installs Bun and Node as dependencies. The release archive includes a private, pinned copy of `tasks-axi` for the viewer; it does not alter a globally installed `tasks-axi`.

Start the viewer from any directory:

```sh
tasks-tui
```

You can also pass one or more backlog files or project directories. Use `--task <id>` to open a task directly; if the id is not found, the viewer displays a warning and opens the task list.

| Usage | Description |
| --- | --- |
| `tasks-tui [backlog.md | directory ...]` | Open the task list using discovered and specified sources |
| `tasks-tui --task <id> [backlog.md | directory ...]` | Open the matching task detail, using the specified sources |
| `tasks-tui --count [backlog.md | directory ...]` | Print the total and counts by status without opening the viewer |
| `tasks-tui --count --json [backlog.md | directory ...]` | Print total, counts by status, and counts per backlog as JSON |

Press `?` for help, `/` to search.

The viewer starts in Home, showing up to five recently completed and five recently archived tasks. On a wide terminal, Browse, Backlog, and Inspector are visible together; select a status card or a Browse entry to open another view.

## Task counts

`--count` reads the same discovered or explicitly supplied backlogs as the viewer and prints one line with the default visible total (in flight, queued, blocked, and held) and counts for all six statuses: in flight, queued, blocked, held, done, and archived. Add `--json` for machine-readable counts, including `total_all` (including done and archived), the per-backlog breakdown, and an `errors` list:

```sh
tasks-tui --count
tasks-tui --count --json ~/projects/my-app
```

When a backlog cannot be read, its error is printed to stderr and included in the JSON `errors` list. Counts include readable backlogs; the command succeeds if at least one backlog is readable and fails if none are. The short output can be used directly in a panel or status bar, for example `tasks-tui --count | cut -d '·' -f 1-3`. The JSON output can be consumed by a panel that needs a particular status or backlog. Counting is read-only and does not change backlog files.

## Inspect a task

Select a task and move right (`→` or `l`) to open the inspector. On a wide terminal it appears alongside the task list; on a narrow terminal it uses the available space. Switch between details, links, and archived note history without losing the selected task.

- Press `Page Up` or `Page Down` to move to the previous or next task.
- Press `e` to toggle inspector expansion on smaller terminals, or move left to return to the list.
- With the inspector focused, press `u` for details, `i` for links and related tasks, or `o` for note history.
- In Links, use the arrow keys to select an entry and press `Enter`; the actions menu then starts with an option to open it. Web links open in your browser, local report paths open with your system's default application, and task dependencies open in the viewer.

## Change a task

Select a task in the list or inspector and press `Enter` to open its actions. Move with `j` / `k` and press `Enter`, or press the key shown beside an action. `Esc` or `q` closes the menu.

| Key | Action | `tasks-axi` command | Confirmation |
| --- | --- | --- | --- |
| `s` | Start a queued task | `start <id>` | No |
| `d` | Mark done, without archiving older done tasks | `done <id> --no-prune` | No |
| `r` | Reopen a done or in-flight task | `reopen <id>` | No |
| `h` | Hold with a reason, or remove the hold | `hold <id> --reason <text>` / `unhold <id>` | No |
| `b` | Block by another task | `block <id> --by <other>` | No |
| `u` | Remove a blocking task | `unblock <id> --by <other>` | No |
| `t` | Edit the title | `update <id> --title <text>` | Yes |
| `n` | Replace the notes, archiving the previous notes | `update <id> --body <text> --archive-body` | Yes |
| `m` | Move to another backlog | `mv <id> --to <path>` | Yes |
| `P` | Prune: move all but the most recent done tasks in the backlog to the archive | `prune --keep <n> --state done` | Yes |
| `D` | Delete the task | `rm <id>` | Yes |

The menu lists only the actions that apply to the task's current state; archived tasks have none. Actions that need a value, such as a hold reason, ask for it first. Actions that cannot be undone, or that affect several tasks, open a dialog that asks the question (for example "delete task a1?"), warns what will be lost or affected, names the affected backlog, and shows the exact command; press `y` to run it or `n`, `q`, or `Esc` to cancel. Any other key leaves the dialog open. There is no setting or shortcut that skips this confirmation.

Each action runs `tasks-axi <command> --file <backlog> --json` against the task's own backlog, so locking, formatting, and validation remain the responsibility of `tasks-axi`. The result appears in the status bar next to the breadcrumb: a `✔` summary, or the `tasks-axi` error as it was printed, with its lines joined onto one line. The next key press dismisses it. The view then reloads and keeps the task selected, even when the change moves it out of the current list, for example when done tasks are hidden. A deleted or moved task is no longer selected.

## Keyboard

| Key | Action |
| --- | --- |
| `↑` / `↓` or `j` / `k` | Move within a panel |
| `←` / `→` or `h` / `l` | Move between panels and status cards |
| `Home` / `End` | Go to the first or last item |
| `Page Up` / `Page Down` | Move by page in a list; change task in the inspector or detail view |
| `Enter` | Choose a browse option or status card, or open the actions for the selected task |
| `u` / `i` / `o` | Select details, links, or note history when the inspector is focused |
| `e` | Toggle inspector expansion on smaller terminals |
| `/` | Filter the current view |
| `d` | Show or hide completed and archived tasks |
| `a` | Add a backlog file or directory |
| `r` | Refresh sources or reload changed task details |
| `Esc` | Close a dialog (`q` also closes the actions menu and confirmations), clear the filter, or return from status cards |
| `?` | Open help |
| `q` / `Ctrl+C` | Quit |

The interface adapts to the terminal width: the sidebar and inspector use separate panels when space allows.

## Sources and updates

The viewer discovers backlogs in the current project and within `~/.treehouse`, `~/.fm`, and `~/projects`, with a bounded search depth. Pass paths on the command line or press `a` to add another source. A directory can contain a `backlog.md`, a `data/backlog.md`, or a `.tasks.toml` pointing to its backlog.

The sidebar filters by source, status, task type, or repository. Filtering scans task data within the selected view. Outside Home, completed and archived tasks are hidden by default; press `d` to include them or choose their status in Browse.

The viewer can show a cached snapshot at startup while it refreshes sources in the background. The view checks for changes every two seconds. An open task keeps its current contents while indicating changed fields; press `r` to reload it. If a known source becomes inaccessible, its last snapshot stays visible and the interface reports `STALE`.

Pruned tasks can be read from `done-archive.md` or the archive configured in `.tasks.toml`. Archived tasks appear in their own group. Older archive entries may not record their original state. Previous note versions are read from `note-archive.md` when available.

## What tasks-tui writes

`tasks-tui` changes backlogs only through the task actions above, and only by running `tasks-axi`; it never edits backlog files itself. It saves its own source and view preferences in the operating system's configuration directory. Opening a link delegates to the system's default application.

Actions run the first `tasks-axi` found on `PATH`. The viewer reads through the installed `tasks-axi` package's Markdown parser and view modules. It therefore requires an installed version that provides those modules; see the [tasks-axi repository](https://github.com/kunchenguid/tasks-axi) for the underlying backlog format and CLI.

## Development

Install Bun 1.3.14+, Node.js 20+, Go 1.27.3+, and `tasks-axi` (`npm install -g tasks-axi`). From the project root:

```sh
(cd opentui && bun install)
go build -o bin/tasks-backend .
./bin/tasks-tui
```

```sh
# Backend checks
go test ./...
go vet ./...

# Frontend checks
(cd opentui && bun test)
```

The OpenTUI frontend lives in `opentui/`. The Go backend discovers sources, reads snapshots, serves archived note history, and provides task counts.

The release workflow builds all four archives and updates the Homebrew formula on `main` with their SHA-256 checksums using `GITHUB_TOKEN`. If `main` is protected, the update fails visibly and the formula must be updated through a pull request.
