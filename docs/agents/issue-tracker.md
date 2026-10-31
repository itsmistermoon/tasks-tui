# Issue tracker: GitHub

Issues and specifications for this repository live in GitHub Issues. Use `gh-axi` and its `--help` output for available operations.

- Create an issue with `gh-axi issue create --title "..." --body-file <path>`; use a file for multiline bodies.
- Read an issue and its comments with `gh-axi issue view <number> --full --comments`.
- List issues with `gh-axi issue list --state open`; use `--label` and `--fields` when needed.
- Add a sub-issue with `gh-axi issue subissue add <parent> <child>`.
- Comment with `gh-axi issue comment <number> --body-file <path>`.
- Apply or remove labels with `gh-axi issue edit <number> --add-label <label>` or `--remove-label <label>`.
- Close with `gh-axi issue close <number> --comment "..."`.

The repository is `itsmistermoon/tasks-tui`; pass `-R itsmistermoon/tasks-tui` when outside its worktree.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set this to `yes` if external pull requests should be treated as feature requests.

## Blocking relationships

Use GitHub's native issue dependencies. Obtain the blocker's database ID with `gh-axi api /repos/itsmistermoon/tasks-tui/issues/<number> --jq .id`, then run `gh-axi api POST /repos/itsmistermoon/tasks-tui/issues/<child>/dependencies/blocked_by --field issue_id=<blocker-id>`. The ID is numeric and is distinct from the issue number.
