import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  ScrollBoxRenderable,
  RGBA,
  StyledText,
  fg,
} from "@opentui/core";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  selectTask,
  navigationTarget,
  selectBrowse,
  restoreTaskViewport,
} from "./navigation";
import { scrollbarOptions, hideScrollbars } from "./scrollbar";
import { openLink } from "./links";
import { matchesDependency } from "./dependencies";
import { truncateText } from "./truncate";
import { SnapshotClient } from "./snapshot-client";
import { helpContent } from "./help";
import { parseArgs, resolveTask } from "./cli";
import {
  icons,
  status,
  sourceName,
  filterTasks,
  type Task,
  type Snapshot,
} from "./tasks";
import {
  stateColors as colors,
  overviewBorder,
  taskBorder,
  activeBorder,
  inactiveBorder,
  selectionBackground,
} from "./panel-theme";

const cli = parseArgs(process.argv.slice(2));
if (process.argv.slice(2).some((x) => x === "--help" || x === "-h")) {
  console.log(
    "Usage: tasks-tui [--task <id>] [backlog.md | directory ...]\nRead-only task viewer using OpenTUI. Press ? for help.",
  );
  process.exit(0);
}
const root = dirname(import.meta.dir),
  backend = join(root, "bin/tasks-backend");
const settingsFile = join(
  process.platform === "darwin"
    ? join(homedir(), "Library/Application Support")
    : process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "tasks-tui/settings.json",
);
let settings: any = { sources: [], showDone: false, Source: "", Group: "" };
try {
  settings = {
    ...settings,
    ...JSON.parse(await readFile(settingsFile, "utf8")),
  };
} catch {}
const save = async () => {
  await mkdir(dirname(settingsFile), { recursive: true });
  await writeFile(settingsFile, JSON.stringify(settings, null, 2));
};
const renderer = await createCliRenderer({ exitOnCtrlC: true });
const sidebarWidth = 30;
const showInspector = () => inspecting && !expanded && renderer.width >= 80;
const hasSidebar = () =>
  mode === "browse" ||
  (renderer.width >= 105 && (!inspecting || expanded || renderer.width >= 150));
const contentWidth = () =>
  Math.max(
    1,
    Math.floor(
      (renderer.width - (hasSidebar() ? sidebarWidth : 0)) /
        (showInspector() ? 2 : 1),
    ) - 5,
  );
const categoryHeading = (state: string, count: number) => {
  const label = `${icons[state]} ${state.toLowerCase()} · ${count}`;
  const prefix = "─  ",
    suffix =
      "  " +
      "─".repeat(
        Math.max(0, contentWidth() - prefix.length - label.length - 2),
      );
  return new StyledText([
    fg("#858796")(prefix),
    fg(colors[state])(label),
    fg("#858796")(suffix),
  ]);
};
let inspectorArea: BoxRenderable | null = null,
  inspectorPanel: BoxRenderable | null = null;
let inspecting = false,
  expanded = false,
  inspectorMode: "detail" | "links" | "history" = "detail";
let browseReturnMode: "list" | "detail" | "links" | "history" = "list",
  browseWasExpanded = false,
  modalReturnMode: "list" | "browse" | "detail" | "links" | "history" = "list";
let data: Snapshot = { tasks: [], sources: [], errors: [], failed: [] },
  visible: Task[] = [],
  selected = "",
  query = "",
  mode: "list" | "browse" | "detail" | "help" | "links" | "history" | "add" =
    "list",
  focus: "list" | "search" = "list",
  navIndex = 0,
  navItems: {
    label: string;
    source: string;
    group: string;
    section?: string;
  }[] = [],
  opened: Task | null = null,
  pending: Task | null = null,
  changes: string[] = [],
  showDone = !!settings.showDone,
  source = settings.Source || "",
  group = settings.Group || "",
  revealSelected = false,
  scroll: ScrollBoxRenderable | null = null,
  taskListScroll: ScrollBoxRenderable | null = null,
  navScroll: ScrollBoxRenderable | null = null,
  navScrollTop = 0,
  input: InputRenderable | null = null,
  searchText = "",
  loading = false,
  historyText = "",
  addPath = "",
  linkError = "",
  linkIndex = 0,
  lastRenderedMode = "",
  listScroll = 0,
  searchTimer: ReturnType<typeof setTimeout> | undefined,
  stickyText: TextRenderable | null = null,
  sections: { id: string; name: string }[] = [];
let taskLookupPending = !!cli.taskId, taskLookupWarning = "";
const text = (
  id: string,
  content: string,
  fg: any = RGBA.defaultForeground(),
  options: any = {},
) =>
  new TextRenderable(renderer, {
    id,
    content,
    fg,
    wrapMode: "word",
    ...options,
  });
const box = (id: string, opts: any = {}) =>
  new BoxRenderable(renderer, { id, flexDirection: "column", ...opts });
function listTasks() {
  visible = filterTasks(data.tasks, { query, source, group, showDone });
  if (!visible.some((task) => task.Key === selected))
    selected = visible[0]?.Key || "";
}
function nav() {
  navItems = [
    { label: "all backlogs", source: "", group: "", section: "sources" },
    ...data.sources.map((p) => ({
      label: sourceName(p),
      source: p,
      group: "",
    })),
    ...["In progress", "Queued", "Blocked", "Held", "Done", "Archived"].map(
      (v, i) => ({
        label: `${icons[v]} ${v.toLowerCase()}`,
        source,
        group: `status:${v}`,
        ...(i === 0 ? { section: "status" } : {}),
      }),
    ),
  ];
  for (const [k, section] of [
    ["kind", "types"],
    ["repo", "repositories"],
  ]) {
    const values = [
      ...new Set(
        data.tasks.map((t) =>
          t.Data[k] && t.Data[k] !== "-" ? String(t.Data[k]) : "unspecified",
        ),
      ),
    ].sort();
    navItems.push(
      ...values.map((v, i) => ({
        label: v,
        source,
        group: `${k}:${v}`,
        ...(i === 0 ? { section } : {}),
      })),
    );
  }
  navIndex = Math.min(navIndex, Math.max(0, navItems.length - 1));
}
function chooseBrowse(v: { source: string; group: string }) {
  source = v.source;
  group = v.group;
  settings.Source = source;
  settings.Group = group;
  save();
  listTasks();
  if (inspecting && opened && visible.some((t) => t.Key === opened!.Key)) {
    selected = opened.Key;
    mode = inspectorMode;
    revealSelected = true;
  } else {
    inspecting = false;
    expanded = false;
    opened = null;
    mode = "list";
  }
  render();
}
function openTask(t: Task) {
  if (mode === "list") listScroll = taskListScroll?.scrollTop || 0;
  else if (mode === "detail" && scroll) scroll.scrollTop = 0;
  if (showInspector() && taskListScroll) {
    const previous = visible.findIndex((item) => item.Key === selected),
      next = visible.findIndex((item) => item.Key === t.Key);
    if (next >= 0) {
      selectTask(taskListScroll, previous, next);
      listScroll = taskListScroll.scrollTop;
      updateSticky();
    }
  }
  selected = t.Key;
  opened = structuredClone(t);
  pending = null;
  changes = [];
  mode = "detail";
  focus = "list";
  renderActiveView();
}
function backFromTask() {
  if (inspecting && expanded) {
    expanded = false;
    render();
  } else {
    inspecting = false;
    expanded = false;
    mode = "list";
    opened = null;
    render();
  }
}
function line(id: string, content: string, fg: any, click?: () => void) {
  const v = text(id, content, fg, { height: 1, onMouseDown: click });
  return v;
}
function keybindBar(id: string, items: string[], options: any = {}) {
  const bar = box(id, {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    width: "100%",
    flexShrink: 0,
    paddingRight: 1,
    ...options,
  });
  items.forEach((item, index) =>
    bar.add(
      text(
        `${id}-${index}`,
        `${index ? "· " : ""}${item}${index === items.length - 1 ? "" : " "}`,
        "#858796",
        { height: 1, flexShrink: 0 },
      ),
    ),
  );
  return bar;
}

function clearRoot() {
  for (const child of renderer.root.getChildren()) {
    renderer.root.remove(child);
    child.destroyRecursively();
  }
}
function render() {
  if (inspecting && ["detail", "links", "history"].includes(mode))
    inspectorMode = mode as typeof inspectorMode;
  listTasks();
  nav();
  const previousMode = lastRenderedMode;
  if (navScroll && !navScroll.isDestroyed) navScrollTop = navScroll.scrollTop;
  if (taskListScroll && !taskListScroll.isDestroyed)
    listScroll = taskListScroll.scrollTop;
  const showingTasks =
    mode === "list" || (mode === "browse" && renderer.width >= 105);
  const oldScroll = showingTasks
    ? listScroll
    : lastRenderedMode === mode
      ? scroll?.scrollTop || 0
      : 0;
  lastRenderedMode = mode;
  clearRoot();
  scroll = null;
  taskListScroll = null;
  navScroll = null;
  inspectorArea = null;
  inspectorPanel = null;
  input = null;
  const frame = box("frame", { width: "100%", height: "100%" });
  renderer.root.add(frame);
  if (mode === "add" || mode === "help") {
    const overlayMode = mode;
    mode = modalReturnMode;
    render();
    mode = overlayMode;
    for (const id of ["panel", "list-panel", "nav"]) {
      const background = renderer.root.findDescendantById(id);
      if (background instanceof BoxRenderable)
        background.borderColor = inactiveBorder;
    }
    const width = Math.max(
        1,
        Math.min(renderer.width - 2, overlayMode === "help" ? 72 : 64),
      ),
      height = Math.max(
        3,
        Math.min(renderer.height - 2, overlayMode === "help" ? 25 : 9),
      );
    const p = box("modal", {
      position: "absolute",
      left: Math.max(0, Math.floor((renderer.width - width) / 2)),
      top: Math.max(0, Math.floor((renderer.height - height) / 2)),
      width,
      height,
      border: true,
      borderStyle: "rounded",
      borderColor: activeBorder,
      paddingLeft: 1,
      paddingRight: 1,
      backgroundColor: "#191a29",
      shouldFill: true,
    });
    renderer.root.add(p);
    p.add(
      line(
        "modal-title",
        overlayMode === "help" ? "help" : "add source",
        activeBorder,
      ),
    );
    p.add(line("modal-title-gap", " ", RGBA.fromIndex(8)));
    if (overlayMode === "add") {
      p.add(line("add-label", "path to backlog file or directory:", "#b8bac5"));
      const field = new InputRenderable(renderer, {
        id: "add-input",
        width: "100%",
        value: addPath,
        backgroundColor: "transparent",
        focusedBackgroundColor: "transparent",
      });
      p.add(field);
      field.on("input", (value: string) => {
        addPath = value;
      });
      field.on("enter", async () => {
        if (!addPath.trim()) return;
        const path = addPath.trim().replace(/^~(?=\/)/, homedir());
        settings.sources = [...new Set([...settings.sources, path])];
        await save();
        addPath = "";
        mode = "list";
        focus = "list";
        await refresh();
        render();
      });
      field.focus();
      p.add(box("add-spacer", { flexGrow: 1, minHeight: 1 }));
      p.add(keybindBar("add-hint", ["↵ add", "esc back"], { paddingRight: 0 }));
    } else {
      const sc = hideScrollbars(
        new ScrollBoxRenderable(renderer, {
          scrollbarOptions,
          id: "help-scroll",
          flexGrow: 1,
        }),
      );
      p.add(sc);
      scroll = sc;
      sc.add(text("help-text", helpContent(), "#d8d8de", { width: "100%" }));
      const back = box("back-help-row", {
        flexDirection: "row",
        justifyContent: "flex-end",
        width: "100%",
        flexShrink: 0,
      });
      p.add(back);
      back.add(
        line("back-help", "esc back", "#858796", () => {
          mode = modalReturnMode;
          render();
        }),
      );
    }
    return;
  }
  if (taskLookupWarning)
    frame.add(line("task-lookup-warning", taskLookupWarning, RGBA.fromIndex(3)));
  if (data.errors.length)
    frame.add(
      line("live", "● STALE  " + data.errors.join(" · "), RGBA.fromIndex(9)),
    );
  const searchRow = box("search-row", { flexDirection: "row", height: 1 });
  frame.add(searchRow);
  searchRow.add(
    text("app-title", " tasks-tui", activeBorder, {
      width: hasSidebar() ? sidebarWidth : 12,
      height: 1,
    }),
  );
  searchRow.add(
    line(
      "search-label",
      " search all › ",
      focus === "search" ? "#d6ad69" : "#858796",
      () => {
        mode = "list";
        focus = "search";
        render();
      },
    ),
  );
  input = new InputRenderable(renderer, {
    id: "search",
    width: 40,
    value: searchText,
    backgroundColor: "transparent",
    focusedBackgroundColor: "transparent",
    textColor: "#e0e0e4",
    focusedTextColor: "#ffffff",
  });
  searchRow.add(input);
  input.on("input", (value: string) => {
    searchText = value;
    query = value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (focus === "search") render();
    }, 120);
  });
  input.on("enter", () => {
    focus = "list";
    input?.blur();
    render();
  });
  if (focus === "search") input.focus();
  frame.add(line("header-gap", " ", RGBA.fromIndex(8)));
  const area = box("area", { flexDirection: "row", flexGrow: 1 });
  frame.add(area);
  const wide = renderer.width >= 105;
  const side = hasSidebar();
  const split = showInspector();
  const viewMode =
    inspecting && opened && ["browse", "list"].includes(mode)
      ? inspectorMode
      : mode;
  if (side) {
    const n = box("nav", {
      border: true,
      borderStyle: "rounded",
      borderColor: overviewBorder("browse", mode, focus),
      width: wide ? sidebarWidth : "100%",
      flexGrow: wide ? 0 : 1,
      paddingLeft: 1,
      paddingRight: 1,
    });
    area.add(n);
    n.add(line("nav-title", "backlogs", activeBorder));
    n.add(line("nav-title-gap", " ", RGBA.fromIndex(8)));
    const ns = hideScrollbars(
      new ScrollBoxRenderable(renderer, {
        scrollbarOptions,
        id: "navscroll",
        flexGrow: 1,
      }),
    );
    n.add(ns);
    navScroll = ns;
    navItems.forEach((v, i) => {
      if (v.section) {
        if (i) ns.add(line("nav-gap-" + i, " ", RGBA.fromIndex(8)));
        ns.add(line("nav-heading-" + i, v.section, RGBA.fromIndex(8)));
      }
      const navRow = box("nav-" + i, {
        width: "100%",
        height: 1,
        backgroundColor: activeBorder,
        shouldFill: v.source === source && v.group === group,
        onMouseDown: () => chooseBrowse(v),
      });
      navRow.add(
        line(
          "nav-label-" + i,
          truncateText(
            (i === navIndex ? "› " : "  ") + v.label,
            wide ? sidebarWidth - 4 : Math.max(1, renderer.width - 5),
            1,
          ),
          v.source === source && v.group === group
            ? "#191a29"
            : i === navIndex
              ? activeBorder
              : "#b8bac5",
        ),
      );
      ns.add(navRow);
    });
    if (mode === "browse") {
      let restored = false;
      const restore = () => {
        if (
          !restored &&
          !ns.isDestroyed &&
          ns.viewport.height > 0 &&
          ns.scrollHeight > 0
        ) {
          ns.scrollTop = navScrollTop;
          if (previousMode !== "browse")
            ns.scrollChildIntoView("nav-" + navIndex);
          restored = true;
        }
      };
      const sizeChange = ns.content.onSizeChange;
      ns.content.onSizeChange = () => {
        sizeChange?.call(ns.content);
        restore();
      };
      setTimeout(restore, 0);
    }
    if (mode === "browse" && !wide) {
      frame.add(keybindBar("foot-browse", ["↑↓ select", "↵ open", "esc back"]));
      return;
    }
  }
  if (split) {
    const listPanel = box("list-panel", {
      border: true,
      borderStyle: "rounded",
      borderColor:
        mode === "list" && focus === "list" ? activeBorder : "#50556c",
      paddingLeft: 1,
      paddingRight: 1,
      flexGrow: 1,
      flexBasis: 0,
    });
    area.add(listPanel);
    renderTaskList(listPanel, listScroll);
  }
  const p = box("panel", {
    border: true,
    borderStyle: "rounded",
    borderColor:
      ["detail", "history", "links"].includes(viewMode) && opened
        ? mode === "browse" || mode === "list" || focus === "search"
          ? "#50556c"
          : activeBorder
        : overviewBorder("list", mode, focus),
    paddingLeft: 1,
    paddingRight: 1,
    flexGrow: 1,
    ...(split ? { flexBasis: 0 } : {}),
  });
  area.add(p);
  if (split) {
    inspectorArea = area;
    inspectorPanel = p;
  }
  if (opened && ["detail", "history", "links"].includes(viewMode)) {
    populateTaskPanel(p, viewMode, oldScroll);
  } else {
    renderTaskList(p, oldScroll);
  }
  const footerItems = [
    "i inspect",
    "b browse",
    "/ search",
    "d show done",
    "a add source",
    "r refresh",
    "? help",
    "q quit",
  ];
  if (renderer.width >= 105) {
    const footer = box("footer-row", {
      flexDirection: "row",
      width: "100%",
      alignItems: "flex-end",
      flexShrink: 0,
    });
    frame.add(footer);
    const statusBar = box("status-bar", {
      flexDirection: "row",
      width: 20,
      height: 1,
      paddingLeft: 1,
    });
    footer.add(statusBar);
    if (!data.errors.length)
      statusBar.add(line("live", "● live · ", RGBA.fromIndex(2)));
    statusBar.add(line("readonly", "read only", RGBA.fromIndex(8)));
    footer.add(
      keybindBar("footer", footerItems, { width: "auto", flexGrow: 1 }),
    );
  } else frame.add(keybindBar("footer", footerItems));
}
function populateTaskPanel(
  p: BoxRenderable,
  viewMode: string,
  oldScroll: number,
) {
  if (opened && ["detail", "history", "links"].includes(viewMode))
    p.add(
      line(
        "task-heading",
        `${icons[status(opened)]} ${status(opened).toLowerCase()} · ${viewMode}`,
        taskBorder(status(opened)),
      ),
    );
  if (viewMode === "detail" && opened) {
    p.add(line("panel-padding", " ", RGBA.fromIndex(8)));
    if (changes.length)
      p.add(
        line(
          "changed",
          "Changed: " + changes.join(", ") + (pending ? "  ·  r reload" : ""),
          "#e8bb65",
          () => {
            if (pending) openTask(pending);
          },
        ),
      );
    scroll = hideScrollbars(
      new ScrollBoxRenderable(renderer, {
        scrollbarOptions,
        id: "detail-scroll",
        flexGrow: 1,
      }),
    );
    p.add(scroll);
    const t = opened;
    const gap = (id: string) =>
      scroll!.add(text(id, " ", RGBA.fromIndex(8), { height: 1 }));
    const section = (
      id: string,
      label: string,
      color: any = RGBA.fromIndex(14),
    ) => scroll!.add(text("section-" + id, label, color, { width: "100%" }));
    const present = (v: any) =>
      v !== undefined && v !== null && v !== "" && v !== "-" && v !== "none";
    scroll.add(
      text("detail-title", String(t.Data.title), RGBA.defaultForeground(), {
        width: "100%",
        attributes: 1,
      }),
    );
    const fields = [
      ["id", "id"],
      ["kind", "kind"],
      ["repo", "repository"],
      ["priority", "priority"],
      ["created", "created"],
      ["closed", "closed"],
      ["hold_kind", "hold type"],
      ["hold_until", "hold until"],
      ["delivery_state", "delivery"],
    ].filter(([key]) => present(t.Data[key]));
    if (fields.length) {
      gap("metadata-gap");
      section("metadata", "details", activeBorder);
      const labelWidth =
        Math.max(...fields.map(([, label]) => label.length)) + 2;
      for (const [key, label] of fields) {
        const row = box("metadata-" + key, {
          flexDirection: "row",
          width: "100%",
        });
        row.add(
          text("metadata-label-" + key, label, RGBA.fromIndex(8), {
            width: labelWidth,
            flexShrink: 0,
          }),
        );
        row.add(
          text(
            "metadata-value-" + key,
            String(t.Data[key]),
            RGBA.defaultForeground(),
            { flexGrow: 1, wrapMode: "char" },
          ),
        );
        scroll.add(row);
      }
      scroll.add(
        text("detail-source", t.Source, RGBA.fromIndex(8), { width: "100%" }),
      );
    }
    for (const [k, label, color] of [
      ["hold_reason", "on hold", RGBA.fromIndex(11)],
      ["blocked_by", "blocked by", RGBA.fromIndex(9)],
      ["deps", "dependencies", activeBorder],
      ["links", "links", activeBorder],
      ["body", "notes", activeBorder],
    ] as const) {
      const v = t.Data[k];
      if (present(v)) {
        gap("gap-" + k);
        section(k, label, color);
        scroll.add(
          text(
            "detail-value-" + k,
            String(v),
            k === "body" ? "#858796" : RGBA.defaultForeground(),
            { width: "100%" },
          ),
        );
      }
    }
    scroll.scrollTop = oldScroll;
    p.add(line("controls-gap", " ", RGBA.fromIndex(8)));
    const controls = box("controls", {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      width: "100%",
      flexShrink: 0,
    });
    p.add(controls);
    if (inspecting && !expanded)
      controls.add(
        line("expand", "e expand · ", "#858796", () => {
          expanded = true;
          render();
        }),
      );
    controls.add(
      line("links", "l links", "#858796", () => {
        linkError = "";
        linkIndex = 0;
        mode = "links";
        render();
      }),
    );
    controls.add(line("sep-links", " · ", "#858796"));
    controls.add(line("history", "h history", "#858796", () => showHistory()));
    controls.add(line("sep-page", " · ", "#858796"));
    controls.add(line("detail-page", "pgup/pgdn task", "#858796"));
    controls.add(line("sep-back", " · ", "#858796"));
    controls.add(line("back", "esc back", "#858796", backFromTask));
  } else if ((viewMode === "links" || viewMode === "history") && opened) {
    const sc = hideScrollbars(
      new ScrollBoxRenderable(renderer, {
        scrollbarOptions,
        id: "extra",
        flexGrow: 1,
      }),
    );
    p.add(line("extra-gap", " ", RGBA.fromIndex(8)));
    p.add(sc);
    scroll = sc;
    sc.add(
      text(
        "extra-task-title",
        String(opened.Data.title),
        RGBA.defaultForeground(),
        { width: "100%", attributes: 1 },
      ),
    );
    sc.add(line("extra-title-gap", " ", RGBA.fromIndex(8)));
    if (viewMode === "history")
      sc.add(
        text(
          "hist",
          historyText || "no archived note versions found for this task",
          "#858796",
          { width: "100%" },
        ),
      );
    else {
      const entries = linkEntries();
      linkIndex = Math.min(linkIndex, Math.max(0, entries.length - 1));
      if (linkError)
        sc.add(
          text("link-error", linkError, RGBA.fromIndex(9), { width: "100%" }),
        );
      if (!entries.length)
        sc.add(
          text(
            "links-empty",
            "no links or dependencies for this task",
            "#858796",
            { width: "100%" },
          ),
        );
      for (const [i, entry] of entries.entries()) {
        sc.add(
          line(
            "link-" + i,
            (i === linkIndex ? "› " : "  ") + entry.label,
            i === linkIndex ? activeBorder : RGBA.defaultForeground(),
            () => activateLink(i),
          ),
        );
      }
    }
    p.add(line("extra-controls-gap", " ", RGBA.fromIndex(8)));
    const controls = box("extra-controls", {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      width: "100%",
      flexShrink: 0,
    });
    p.add(controls);
    if (viewMode === "links" && linkEntries().length)
      controls.add(line("open-link-hint", "↵ open · ", "#858796"));
    if (inspecting && !expanded)
      controls.add(
        line("expand-extra", "e expand · ", "#858796", () => {
          expanded = true;
          render();
        }),
      );
    controls.add(
      line("extra-detail", "t detail · ", "#858796", () => {
        mode = "detail";
        render();
      }),
    );
    if (viewMode === "links")
      controls.add(
        line("extra-history", "h history · ", "#858796", () => showHistory()),
      );
    else
      controls.add(
        line("extra-links", "l links · ", "#858796", () => {
          linkError = "";
          linkIndex = 0;
          mode = "links";
          render();
        }),
      );
    controls.add(line("extra-page-hint", "pgup/pgdn task · ", "#858796"));
    controls.add(line("extra-back", "esc back", "#858796", backFromTask));
  }
}
function renderActiveView() {
  if (inspecting && ["detail", "links", "history"].includes(mode))
    inspectorMode = mode as typeof inspectorMode;
  if (
    showInspector() &&
    inspectorArea &&
    inspectorPanel &&
    !inspectorArea.isDestroyed
  ) {
    const area = inspectorArea;
    area.remove(inspectorPanel);
    inspectorPanel.destroyRecursively();
    scroll = null;
    const panel = box("panel", {
      border: true,
      borderStyle: "rounded",
      borderColor: activeBorder,
      paddingLeft: 1,
      paddingRight: 1,
      flexGrow: 1,
      flexBasis: 0,
    });
    area.add(panel);
    inspectorPanel = panel;
    populateTaskPanel(panel, mode, 0);
  } else render();
}
function renderTaskList(p: BoxRenderable, oldScroll: number) {
  p.add(
    line(
      "panel-heading",
      (source ? sourceName(source) : "all backlogs") +
        " · " +
        visible.length +
        " tasks",
      activeBorder,
    ),
  );
  p.add(line("panel-padding", " ", RGBA.fromIndex(8)));
  const sticky = text("sticky", "", "#858796", { height: 1 });
  stickyText = sticky;
  sections = [];
  p.add(sticky);
  p.add(line("spacer", " ", "#ffffff"));
  scroll = hideScrollbars(
    new ScrollBoxRenderable(renderer, {
      scrollbarOptions,
      id: "tasks",
      flexGrow: 1,
      viewportCulling: true,
    }),
  );
  p.add(scroll);
  let last = "";
  visible.forEach((t, i) => {
    const state = status(t);
    if (state !== last) {
      sections.push({
        id: i === 0 ? "task-" + i : "section-" + i,
        name: state,
      });
      if (i !== 0) {
        scroll!.add(
          text("section-gap-" + i, " ", RGBA.fromIndex(8), { height: 1 }),
        );
        scroll!.add(
          text(
            "section-" + i,
            categoryHeading(
              state,
              visible.filter((x) => status(x) === state).length,
            ),
            colors[state],
            { height: 2 },
          ),
        );
      }
      last = state;
    }
    const item = box("task-" + i, {
      flexDirection: "row",
      width: "100%",
      onMouseDown: () => openTask(t),
    });
    scroll!.add(item);
    const body = box("body-" + i, { flexGrow: 1 });
    item.add(body);
    const titleBox = box("selection-" + i, {
      width: "100%",
      backgroundColor: t.Key === selected ? selectionBackground : undefined,
      shouldFill: t.Key === selected,
    });
    body.add(titleBox);
    titleBox.add(
      text(
        "title-" + i,
        truncateText(String(t.Data.title), Math.max(1, contentWidth()), 2),
        colors[state],
        { width: "100%" },
      ),
    );
    titleBox.add(
      text(
        "source-" + i,
        truncateText(
          `${t.Data.repo && t.Data.repo !== "-" ? t.Data.repo + " · " : ""}${sourceName(t.Source)}${t.Archived ? " · archived" : ""}`,
          Math.max(1, contentWidth()),
          1,
        ),
        RGBA.fromIndex(8),
        { width: "100%", height: 1 },
      ),
    );
  });
  const listView = scroll;
  taskListScroll = listView;
  if (oldScroll > 0 || revealSelected) {
    let restored = false;
    const restore = () => {
      if (
        !restored &&
        !listView.isDestroyed &&
        listView.viewport.height > 0 &&
        listView.scrollHeight > 0
      ) {
        const target = listView.getRenderable(
          "task-" + visible.findIndex((t) => t.Key === selected),
        );
        if (revealSelected && (!target || target.height === 0)) return;
        listScroll = restoreTaskViewport(
          listView,
          oldScroll,
          revealSelected
            ? visible.findIndex((t) => t.Key === selected)
            : undefined,
        );
        if (revealSelected) revealSelected = false;
        restored = true;
        updateSticky();
      }
    };
    for (const node of [listView.content, listView.viewport]) {
      const original = node.onSizeChange;
      node.onSizeChange = () => {
        original?.call(node);
        setTimeout(restore, 0);
      };
    }
    setTimeout(restore, 0);
  }
  const sel = visible.findIndex((t) => t.Key === selected);
  sticky.content =
    sel >= 0
      ? categoryHeading(
          status(visible[0]),
          visible.filter((t) => status(t) === status(visible[0])).length,
        )
      : "";
  setTimeout(updateSticky, 0);
}
function updateSticky() {
  if (!taskListScroll || taskListScroll.isDestroyed || !stickyText) return;
  const top = taskListScroll.viewport.y;
  let active = sections[0]?.name;
  for (const section of sections) {
    const item = taskListScroll.getRenderable(section.id);
    if (item && item.y <= top) active = section.name;
  }
  if (active) {
    const v = categoryHeading(
      active,
      visible.filter((t) => status(t) === active).length,
    );
    if (stickyText.plainText !== v.chunks.map((chunk) => chunk.text).join(""))
      stickyText.content = v;
  }
}
const snapshots = new SnapshotClient(backend, cli.sources);
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const next = await snapshots.read();
    if (renderer.isDestroyed) return;
    if (opened) {
      const t = next.tasks.find((x) => x.Key === opened!.Key);
      if (t) {
        changes = Object.keys({ ...opened.Data, ...t.Data }).filter(
          (k) => JSON.stringify(opened!.Data[k]) !== JSON.stringify(t.Data[k]),
        );
        pending = changes.length ? t : null;
      } else {
        changes = ["task unavailable"];
        pending = null;
      }
    }
    const changed = JSON.stringify(data) !== JSON.stringify(next);
    data = next;
    if (taskLookupPending) {
      taskLookupPending = false;
      const task = resolveTask(data.tasks, cli.taskId);
      if (task) openTask(task);
      else taskLookupWarning = `Task id "${cli.taskId}" was not found; showing the task list.`;
    }
    if (changed && focus !== "search" && mode !== "add" && mode !== "help")
      render();
  } catch (e) {
    if (renderer.isDestroyed) return;
    snapshots.close();
    data.errors = [String(e)];
    if (focus !== "search") render();
  } finally {
    loading = false;
  }
}
function linkEntries(): { label: string; url?: string; task?: Task }[] {
  if (!opened) return [];
  const value =
    String(opened.Data.links || "") + " " + String(opened.Data.body || "");
  const urls = [
    ...new Set(
      value.match(/https?:\/\/[^\s<>,]+|data\/[A-Za-z0-9_./-]+\.md/g) || [],
    ),
  ];
  const tasks = data.tasks.filter(
    (t) =>
      t.Source === opened?.Source &&
      matchesDependency(String(opened?.Data.deps || ""), String(t.Data.id)),
  );
  return [
    ...urls.map((url) => ({ label: url, url })),
    ...tasks.map((task) => ({
      label: String(task.Data.id) + " · " + String(task.Data.title),
      task,
    })),
  ];
}
async function activateLink(index: number) {
  const entry = linkEntries()[index];
  if (!entry || !opened) return;
  linkIndex = index;
  if (entry.task) {
    openTask(entry.task);
    return;
  }
  if (entry.url) {
    linkError = (await openLink(entry.url, opened.Source)) || "";
    if (!renderer.isDestroyed && mode === "links") renderActiveView();
  }
}
async function showHistory() {
  if (!opened) return;
  const key = opened.Key;
  mode = "history";
  historyText = "loading…";
  renderActiveView();
  const p = Bun.spawn(
    [backend, "--history", opened.Source, String(opened.Data.id)],
    { stdout: "pipe", stderr: "pipe" },
  );
  const result = await new Response(p.stdout).text();
  const failed = await p.exited;
  if (renderer.isDestroyed || opened?.Key !== key || mode !== "history") return;
  historyText = failed
    ? "unable to read archived notes"
    : result.trim() === "No archived note versions found for this task."
      ? "no archived note versions found for this task"
      : result.trim() === "No archived note versions available."
        ? "no archived note versions available"
        : result;
  mode = "history";
  renderActiveView();
}
renderer.keyInput.on("keypress", (key) => {
  if (focus === "search") {
    if (key.name === "escape") {
      searchText = "";
      query = "";
      focus = "list";
      input?.blur();
      render();
    }
    return;
  }
  if (mode === "help") {
    if (key.name === "?" || key.name === "escape" || key.name === "q") {
      mode = modalReturnMode;
      render();
    } else if (scroll) {
      if (key.name === "down") scroll.scrollBy(1);
      if (key.name === "up") scroll.scrollBy(-1);
      if (key.name === "pagedown") scroll.scrollBy(10);
      if (key.name === "pageup") scroll.scrollBy(-10);
    }
    return;
  }
  if (mode === "add") {
    if (key.name === "escape") {
      mode = modalReturnMode;
      addPath = "";
      render();
    }
    return;
  }
  if (key.name === "q") {
    renderer.destroy();
    return;
  }
  if (key.name === "escape") {
    if (mode === "browse" && inspecting) {
      mode = inspectorMode;
      render();
    } else backFromTask();
    return;
  }
  if (key.name === "?") {
    modalReturnMode = mode as typeof modalReturnMode;
    mode = "help";
    render();
    return;
  }
  if (key.name === "/") {
    key.preventDefault();
    mode = "list";
    focus = "search";
    render();
    return;
  }
  if (key.name === "b") {
    if (mode === "browse") {
      mode = browseReturnMode;
      expanded = browseWasExpanded;
    } else {
      browseReturnMode = mode as typeof browseReturnMode;
      browseWasExpanded = expanded;
      if (inspecting && ["detail", "links", "history"].includes(mode))
        inspectorMode = mode as typeof inspectorMode;
      expanded = false;
      mode = "browse";
    }
    render();
    return;
  }
  if (key.name === "a") {
    key.preventDefault();
    modalReturnMode = mode as typeof modalReturnMode;
    mode = "add";
    render();
    return;
  }
  if (key.name === "i" && inspecting) {
    inspecting = false;
    expanded = false;
    opened = null;
    if (mode !== "browse") mode = "list";
    render();
    return;
  }
  if (key.name === "d") {
    showDone = !showDone;
    settings.showDone = showDone;
    save();
    render();
    return;
  }
  if (key.name === "r") {
    if (pending) openTask(pending);
    else refresh();
    return;
  }
  if (
    inspecting &&
    !expanded &&
    ["detail", "links", "history"].includes(mode) &&
    key.name === "e"
  ) {
    expanded = true;
    render();
    return;
  }
  if (
    ["detail", "links", "history"].includes(mode) &&
    (key.name === "pageup" || key.name === "pagedown")
  ) {
    const current = visible.findIndex((t) => t.Key === opened?.Key);
    const next = current + (key.name === "pagedown" ? 1 : -1);
    if (current >= 0 && visible[next]) {
      const currentMode = mode;
      if (showInspector() && taskListScroll) {
        selectTask(taskListScroll, current, next);
        listScroll = taskListScroll.scrollTop;
        updateSticky();
        revealSelected = false;
      } else revealSelected = true;
      if (currentMode === "detail") openTask(visible[next]);
      else {
        selected = visible[next].Key;
        opened = structuredClone(visible[next]);
        pending = null;
        changes = [];
        if (scroll) scroll.scrollTop = 0;
        if (currentMode === "history") showHistory();
        else {
          linkIndex = 0;
          linkError = "";
          renderActiveView();
        }
      }
    }
    return;
  }
  if (["links", "history"].includes(mode) && key.name === "t") {
    mode = "detail";
    render();
    return;
  }
  if (["detail", "history"].includes(mode) && key.name === "l") {
    linkError = "";
    linkIndex = 0;
    mode = "links";
    render();
    return;
  }
  if (["detail", "links"].includes(mode) && key.name === "h") {
    showHistory();
    return;
  }
  if (mode === "links") {
    if (key.name === "up" || key.name === "down") {
      linkIndex = Math.max(
        0,
        Math.min(
          linkEntries().length - 1,
          linkIndex + (key.name === "down" ? 1 : -1),
        ),
      );
      render();
      scroll?.scrollChildIntoView("link-" + linkIndex);
      return;
    }
    if (key.name === "return") {
      activateLink(linkIndex);
      return;
    }
  }
  if (mode === "browse") {
    if (
      ["up", "down", "home", "end", "pageup", "pagedown"].includes(key.name)
    ) {
      const previous = navIndex;
      navIndex = navigationTarget(
        navScroll,
        navIndex,
        navItems.length,
        key.name,
        "nav",
      );
      selectBrowse(
        navScroll,
        previous,
        navIndex,
        navItems.map((item) => item.label),
        renderer.width >= 105
          ? sidebarWidth - 4
          : Math.max(1, renderer.width - 5),
        navItems.findIndex(
          (item) => item.source === source && item.group === group,
        ),
      );
      navScrollTop = navScroll?.scrollTop || 0;
      return;
    } else if (key.name === "return") {
      const n = navItems[navIndex];
      if (n) chooseBrowse(n);
    }
    return;
  }
  if (mode === "list") {
    if (key.name === "i") {
      const task = visible.find((t) => t.Key === selected);
      if (task) {
        inspecting = true;
        expanded = false;
        openTask(task);
      }
      return;
    }
    let i = visible.findIndex((t) => t.Key === selected);
    if (key.name === "return") {
      if (visible[i]) openTask(visible[i]);
      return;
    } else if (
      ["up", "down", "home", "end", "pageup", "pagedown"].includes(key.name)
    )
      i = navigationTarget(taskListScroll, i, visible.length, key.name);
    else return;
    const previous = visible.findIndex((t) => t.Key === selected);
    selected = visible[i]?.Key || "";
    selectTask(taskListScroll, previous, i);
    updateSticky();
  } else if (scroll) {
    if (key.name === "down") scroll.scrollBy(1);
    if (key.name === "up") scroll.scrollBy(-1);
    if (key.name === "pagedown") scroll.scrollBy(10);
    if (key.name === "pageup") scroll.scrollBy(-10);
  }
});
renderer.on("resize", () => render());
render();
await refresh();
const timer = setInterval(() => {
  updateSticky();
  refresh();
}, 2000);
const stickyTimer = setInterval(updateSticky, 100);
renderer.on("destroy", () => {
  clearInterval(timer);
  clearInterval(stickyTimer);
  snapshots.close();
});
