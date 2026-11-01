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

Select a task in the list or inspector and press `Enter` to open its actions. Move with `j` / `k` and press `Enter`, or press the key shown beside an action. Press `?` to read what the highlighted action does and its consequences. `Esc` or `q` closes the menu.

| Key | Action | `tasks-axi` command | Confirmation |
| --- | --- | --- | --- |
| `s` | Start a queued task | `start <id>` | No |
| `d` | Mark done, without archiving older done tasks | `done <id> --no-prune` | No |
| `l` | Done with link: record a pull request, report path, or closing note | `done <id> --pr <url> --report <path> --note <text> --no-prune` | No |
| `r` | Reopen a done or in-flight task | `reopen <id>` | No |
| `h` | Hold with a reason and an optional end date, or remove the hold | `hold <id> --reason <text> --until <date>` / `unhold <id>` | No |
| `b` | Block by another task of the same backlog, chosen from a list | `block <id> --by <other>` | No |
| `u` | Remove one of the current blocking tasks | `unblock <id> --by <other>` | No |
| `p` | Set the priority with `0`–`4` | `update <id> --priority <n>` | No |
| `t` | Edit the title | `update <id> --title <text>` | Yes |
| `n` | Replace the notes, archiving the previous notes | `update <id> --body <text> --archive-body` | Yes |
| `m` | Move to a known backlog, or a typed path, with its connected tasks | `mv <id>... --to <path>` | Yes |
| `D` | Delete the task | `rm <id>` | Yes |

The menu lists only the actions that apply to the task's current state; archived tasks have none. Actions that need values ask for them in order; optional values can be left blank. Blocking tasks and destination backlogs are chosen from a list that narrows as you type, and a move also accepts a typed path. When a task to move is linked by `blocked-by` to other tasks in its backlog, the confirmation lists the whole connected group and moves it in one `tasks-axi mv`, so no link is stranded. In an empty editable field, press `?` for the action's explanation; once the field has text, `?` is entered as a character. `Esc` closes the explanation and returns to the field, or cancels the form. Replace notes opens a multiline editor with the current notes; press `Enter` to add a line and `Ctrl+S` to review the exact command.

Actions that cannot be undone, or that affect several tasks, open a dialog that asks the question (for example "delete task a1?"), warns what will be lost or affected, names the affected backlog and tasks, and shows every exact command; press `y` to run it or `n` to cancel. Any other key leaves the dialog open. There is no setting or shortcut that skips this confirmation.

After a single-task start, mark done, done with link, reopen, hold, remove hold, block, or unblock, the summary in the status bar offers `z undo`, which runs the opposite command while the summary is visible. Undoing done with link reopens the task; recorded links remain. Batch actions are confirmed and cannot be undone. Undo is not offered after edits, moves, deletes, or backlog actions.

### Several tasks

Press `Space` in the task list to mark or unmark a task; `Esc` clears the marks. With tasks marked, `Enter` opens one menu with only the actions that apply to all of them: start, mark done, reopen, hold, remove hold, set priority, move, and delete. The confirmation lists the marked tasks and every command; a move runs one `tasks-axi mv` per source backlog.

### Create tasks and change a backlog

Press `a` to add a task. Enter the title, then an id or leave it blank to generate one from the title (`--mint`), choose whether it starts queued or in flight, and optionally a kind, repository, and priority. It goes to the backlog of the current filter; in "all backlogs" you choose the backlog from a list. The new task is selected after it is created.

In Browse, press `Enter` on a backlog to open its menu:

| Key | Action | `tasks-axi` command | Confirmation |
| --- | --- | --- | --- |
| `v` | Show the backlog's tasks | — | No |
| `a` | Add a task to this backlog | `add ...` | No |
| `P` | Prune: move all but the most recent done tasks to the archive | `prune --keep <n> --state done` | Yes |
| `R` | Render: rewrite the backlog in canonical form | `render` | Yes |

`+ add source` at the end of the sources in Browse adds another backlog file or directory.

Each action runs `tasks-axi <command> --file <backlog>` against the task's own backlog (one command per task when several are marked, stopping at the first failure), so locking, formatting, and validation remain the responsibility of `tasks-axi`; its exit code decides whether the action succeeded. A successful action shows the first line of the `tasks-axi` output as a `✔` summary in the status bar next to the breadcrumb; the next key press dismisses it. A failed action opens a command panel below the task panels with the command, its exit code, and the `tasks-axi` output exactly as it was printed, including its suggested next steps. The panel takes focus when it opens. Use `j`/`k`, arrows, or Page Up/Page Down to scroll; when at the top, another `k`/up returns focus to the task panels while keeping the output visible. `L` shows or hides the last output, or focuses it when visible without focus. With the panel focused, `e` edits the values you entered and `Enter` retries a failed command from where it stopped. `Esc` or `q` closes it. To the left of the key hints, `updated HH:MM` shows when the view last took in a change, including the result of each action. The view then reloads and keeps the task selected. When the change moves it out of the current list, for example when done tasks are hidden, the status bar shows `(d show · esc dismiss)`: `d` shows the hidden tasks, or switches to the task's new status, and keeps it selected. This notice stays until you dismiss or follow it. A deleted task is no longer selected.

## Keyboard

| Key | Action |
| --- | --- |
| `↑` / `↓` or `j` / `k` | Move within a panel |
| `←` / `→` or `h` / `l` | Move between panels and status cards |
| `Home` / `End` | Go to the first or last item |
| `Page Up` / `Page Down` | Move by page in a list; change task in the inspector or detail view |
| `Enter` | Choose a browse option or status card, open a backlog's menu, or open the actions for the selected or marked tasks |
| `u` / `i` / `o` | Select details, links, or note history when the inspector is focused |
| `e` | Toggle inspector expansion on smaller terminals |
| `/` | Filter the current view |
| `d` | Show or hide completed and archived tasks |
| `a` | Add a task |
| `Space` | Mark or unmark the selected task |
| `z` | Undo the last reversible action while its summary is shown |
| `r` | Refresh sources or reload changed task details |
| `L` | Show, hide, or focus the output of the last task action |
| `j` / `k`, arrows, Page Up / Page Down | Scroll command output when its panel is focused |
| `Esc` | Close a dialog, clear the filter or marks, dismiss a notice, or return from status cards |
| `?` | Open help, or explain the action in an action dialog |
| `q` | Close an action menu, confirmation, or command panel, otherwise quit |
| `Esc` | Close a dialog or cancel an action form |
| `Ctrl+C` | Quit |

The interface adapts to the terminal width: the sidebar and inspector use separate panels when space allows.

## Sources and updates

The viewer discovers backlogs in the current project and within `~/.treehouse`, `~/.fm`, and `~/projects`, with a bounded search depth. Pass paths on the command line or choose `+ add source` in Browse to add another source. A directory can contain a `backlog.md`, a `data/backlog.md`, or a `.tasks.toml` pointing to its backlog. Each backlog is shown by the name of its project folder; when two projects share a name, their parent folder is added.

The sidebar filters by source, status, task type, or repository. Filtering matches the title, id, notes, repository, kind, and hold reason of the tasks in the selected view. Outside Home, completed and archived tasks are hidden by default; press `d` to include them or choose their status in Browse.

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

# Frontend checks, including the keyboard flow tests
(cd opentui && bun test)
```

The flow tests in `opentui/flows.test.ts` mount the whole app in OpenTUI's test renderer with temporary backlogs, an isolated `HOME`, and the installed `tasks-axi`, then press keys and check the screen and the backlog files. They need `bin/tasks-backend` built and `tasks-axi` on `PATH`. The CI workflow runs all of these checks on every pull request and fails if any of them fails; run them locally before opening one.

Design decisions, such as how panels scroll, are recorded in `docs/adr/`. The OpenTUI frontend lives in `opentui/`. The Go backend discovers sources, reads snapshots, serves archived note history, and provides task counts.

The release workflow builds all four archives and updates the Homebrew formula on `main` with their SHA-256 checksums using `GITHUB_TOKEN`. If `main` is protected, the update fails visibly and the formula must be updated through a pull request.
