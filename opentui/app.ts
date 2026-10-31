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
  moveFocus,
  panelLayout,
  transitionNavigation,
  inspectorTabs,
  isInspectorTab,
  type NavigationAction,
  type FocusState,
  type NavigationState,
} from "./navigation";
import { projectView, type BrowseItem } from "./views";
import { scrollbarOptions, hideScrollbars } from "./scrollbar";
import { openLink } from "./links";
import { matchesDependency } from "./dependencies";
import { truncateText } from "./truncate";
import { SnapshotClient, snapshotCachePath } from "./snapshot-client";
import { footerHints, helpContent, helpDimensions, type HelpPanel } from "./help";
import { parseArgs, resolveTask } from "./cli";
import { taskListCountLabel } from "./task-list-count";
import {
  icons,
  status,
  sourceName,
  countTasks,
  taskStatuses,
  type Task,
  type Snapshot,
} from "./tasks";
import {
  stateColors as colors,
  overviewBorder,
  inspectorHeadingColor,
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
let settings: any = { sources: [], showDone: false };
try {
  const saved = JSON.parse(await readFile(settingsFile, "utf8"));
  settings = {
    sources: Array.isArray(saved.sources) ? saved.sources : [],
    showDone: !!saved.showDone,
  };
} catch {}
const save = async () => {
  await mkdir(dirname(settingsFile), { recursive: true });
  await writeFile(settingsFile, JSON.stringify(settings, null, 2));
};
const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: false });
const sidebarWidth = 25;
const layout = () => panelLayout(renderer.width, navigation.mode === "help" || navigation.mode === "add" ? navigation.modalReturnMode : navigation.mode, navigation.cardsFocused, navigation.inspecting, navigation.expanded);
const showInspector = () => layout().inspector;
const hasSidebar = () => layout().sidebar;
const contentWidth = () =>
  Math.max(
    1,
    Math.floor(
      (renderer.width - (hasSidebar() ? sidebarWidth : 0)) *
        (showInspector() ? 0.6 : 1),
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
let navigation: NavigationState = { selected: "", opened: null, inspectorMode: "detail", inspecting: false, expanded: false, mode: "browse", modalReturnMode: "list", cardsFocused: false, cardIndex: 0 };
let data: Snapshot = { tasks: [], sources: [], errors: [], failed: [] },
  visible: Task[] = [],
  query = "",
  focus: "list" | "search" = "list",
  navIndex = 0,
  navItems: BrowseItem[] = [],
  pending: Task | null = null,
  changes: string[] = [],
  showDone = !!settings.showDone,
  source = "",
  group = "home",
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
let showingCachedSnapshot = false;
let helpPanel: HelpPanel = "browse";
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
function navigate(action: NavigationAction) {
  const previous = navigation.selected;
  const previousOpened = navigation.opened;
  navigation = transitionNavigation(navigation, action);
  if (previous !== navigation.selected || previousOpened !== navigation.opened) { pending = null; changes = []; }
}
function listTasks(preserve?: Task) {
  const projection = projectView(data.tasks, data.sources, { query, source, group, showDone });
  visible = projection.tasks;
  navItems = projection.browse;
  navigate({ type: "sync", tasks: visible, width: renderer.width, preview: !taskLookupPending, preserve });
}
function nav() {
  navIndex = Math.min(navIndex, Math.max(0, navItems.length - 1));
}
function chooseBrowse(v: { source: string; group: string }) {
  source = v.source;
  group = v.group;
  listTasks();
  navigate({ type: "select", task: visible[0] || null, mode: "list" });
  listScroll = 0;
  render();
}
function openTask(t: Task, reload = false) {
  const previousMode = navigation.mode;
  if (navigation.mode === "list") listScroll = taskListScroll?.scrollTop || 0;
  else if (navigation.mode === "detail" && scroll) scroll.scrollTop = 0;
  if (panelLayout(renderer.width, navigation.mode, navigation.cardsFocused, true, navigation.expanded).inspector && taskListScroll) {
    const previous = visible.findIndex((item) => item.Key === navigation.selected),
      next = visible.findIndex((item) => item.Key === t.Key);
    if (next >= 0) {
      selectTask(taskListScroll, previous, next);
      listScroll = taskListScroll.scrollTop;
      updateSticky();
    }
  }
  navigate({ type: "select", task: t, mode: "inspector", reload });
  focus = "list";
  if (previousMode !== navigation.mode) render();
  else renderActiveView();
}
function backFromTask() {
  if (navigation.inspecting && navigation.expanded) {
    navigate({ type: "expand" });
    render();
  } else {
    navigate({ type: "close", width: renderer.width, task: visible.find((task) => task.Key === navigation.selected) || null });
    render();
  }
}
function line(id: string, content: string, fg: any) {
  return text(id, content, fg, { height: 1 });
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
function render(underlay = false) {
  const viewingMode = underlay ? navigation.modalReturnMode : navigation.mode;
  nav();
  if (viewingMode !== "browse" || navigation.cardsFocused) {
    const active = navItems.findIndex((item) => item.source === source && item.group === group);
    if (active >= 0) navIndex = active;
  }
  if (navScroll && !navScroll.isDestroyed && lastRenderedMode === "browse") navScrollTop = navScroll.scrollTop;
  if (taskListScroll && !taskListScroll.isDestroyed)
    listScroll = taskListScroll.scrollTop;
  const showingTasks =
    viewingMode === "list" || (viewingMode === "browse" && renderer.width >= 105);
  const oldScroll = showingTasks
    ? listScroll
    : lastRenderedMode === viewingMode
      ? scroll?.scrollTop || 0
      : 0;
  lastRenderedMode = viewingMode;
  clearRoot();
  scroll = null;
  taskListScroll = null;
  navScroll = null;
  inspectorArea = null;
  inspectorPanel = null;
  input = null;
  const frame = box("frame", { width: "100%", height: "100%" });
  renderer.root.add(frame);
  if (viewingMode === "add" || viewingMode === "help") {
    const overlayMode = viewingMode;
    render(true);
    for (const id of ["panel", "list-panel", "nav"]) {
      const background = renderer.root.findDescendantById(id);
      if (background instanceof BoxRenderable)
        background.borderColor = inactiveBorder;
    }
    const size = overlayMode === "help"
      ? helpDimensions(helpPanel, renderer.width, renderer.height)
      : { width: Math.max(1, Math.min(renderer.width - 2, 64)), height: Math.max(3, Math.min(renderer.height - 2, 9)) };
    const { width, height } = size;
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
    const modalTitle = line("modal-title", overlayMode === "help" ? "help" : "add source", activeBorder);
    modalTitle.attributes = 1;
    p.add(modalTitle);
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
        snapshots.setCacheFile(snapshotCachePath(cli.sources, settings.sources));
        addPath = "";
        navigate({ type: "focus", mode: "list" });
        focus = "list";
        await refresh();
        render();
      });
      field.focus();
      p.add(box("add-spacer", { flexGrow: 1, minHeight: 1 }));
      p.add(keybindBar("add-hint", ["↵ add", "esc back"], { paddingRight: 0 }));
    } else {
      p.add(text("help-text", helpContent(helpPanel, renderer.width), "#d8d8de", { width: "100%", flexGrow: 1 }));
      const closeHint = box("help-close-row", { flexDirection: "row", justifyContent: "flex-end", width: "100%", height: 1, flexShrink: 0 });
      closeHint.add(line("help-close-hint", "press any key to close", "#858796"));
      p.add(closeHint);
    }
    return;
  }
  if (taskLookupWarning)
    frame.add(line("task-lookup-warning", taskLookupWarning, RGBA.fromIndex(3)));
  if (data.errors.length)
    frame.add(
      line("live", "● STALE  " + data.errors.join(" · "), RGBA.fromIndex(9)),
    );
  input = new InputRenderable(renderer, {
    id: "search",
    width: 1,
    value: searchText,
    backgroundColor: "transparent",
    focusedBackgroundColor: "transparent",
    textColor: "#e0e0e4",
    focusedTextColor: "#ffffff",
  });

  input.on("input", (value: string) => {
    searchText = value;
    query = value;
    listTasks();
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
  const renderFooter = () => {
    const footer = box("footer-row", { flexDirection: "row", width: "100%", height: 1, flexShrink: 0 });
    frame.add(footer);
    const location = box("status-bar", { flexDirection: "row", flexGrow: 1, flexBasis: 0, height: 1, paddingLeft: 1 });
    footer.add(location);
    const current = navItems.find((item) => item.source === source && item.group === group);
    const category = group.startsWith("status:") ? "status" : group.startsWith("kind:") ? "types" : group.startsWith("repo:") ? "repositories" : "sources";
    location.add(line("breadcrumb", group === "home" ? "home" : `${category} > ${current?.label || "all"}`, focus === "search" ? "#858796" : RGBA.defaultForeground()));
    if (focus === "search" && input) {
      location.add(line("filter-prefix", " / ", "#858796"));
      input.width = 1;
      input.flexGrow = 1;
      input.flexShrink = 1;
      location.add(input);
      input.focus();
    }
    const panel: HelpPanel = navigation.cardsFocused ? "cards" : viewingMode as HelpPanel;
    footer.add(keybindBar("footer", footerHints(panel, renderer.width, focus === "search"), { width: "auto", flexShrink: 0 }));
  };
  const area = box("area", { flexDirection: "row", flexGrow: 1 });
  frame.add(area);
  const wide = renderer.width >= 80;
  const side = hasSidebar();
  const split = showInspector();
  const viewMode =
    split && navigation.inspecting && navigation.opened && ["browse", "list"].includes(viewingMode)
      ? navigation.inspectorMode
      : viewingMode;
  if (side) {
    const n = box("nav", {
      border: true,
      borderStyle: "rounded",
      borderColor: navigation.cardsFocused ? inactiveBorder : overviewBorder("browse", viewingMode, focus),
      width: wide ? sidebarWidth : "100%",
      flexGrow: wide ? 0 : 1,
      paddingLeft: 1,
      paddingRight: 1,
    });
    area.add(n);
    const navTitle = line("nav-title", "tasks-tui", viewingMode === "browse" && !navigation.cardsFocused ? activeBorder : "#858796");
    navTitle.attributes = viewingMode === "browse" && !navigation.cardsFocused ? 1 : 0;
    n.add(navTitle);
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
        flexDirection: "row",
        backgroundColor: activeBorder,
        shouldFill: v.source === source && v.group === group,
      });
      navRow.add(
        line(
          "nav-label-" + i,
          truncateText(
            (i === navIndex ? "› " : "  ") + v.label,
            wide ? sidebarWidth - 9 : Math.max(1, renderer.width - 10),
            1,
          ),
          v.source === source && v.group === group
            ? "#191a29"
            : i === navIndex
              ? activeBorder
              : "#b8bac5",
        ),
      );
      const labelNode = navRow.getChildren()[0];
      if (labelNode) { labelNode.flexGrow = 1; if (labelNode instanceof TextRenderable) labelNode.attributes = v.source === source && v.group === group ? 1 : 0; }
      if (v.count !== undefined) navRow.add(text("nav-count-" + i, String(v.count).padStart(4), "#858796", { width: 4, height: 1 }));
      ns.add(navRow);
    });
    {
      let restored = false;
      const restore = () => {
        if (
          !restored &&
          !ns.isDestroyed &&
          ns.viewport.height > 0 &&
          ns.scrollHeight > 0
        ) {
          ns.scrollTop = navScrollTop;
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
    if (viewingMode === "browse" && !wide) {
      renderFooter();
      return;
    }
  }
  const contentArea = box("content-area", { flexDirection: "column", flexGrow: 1, flexBasis: 0 });
  area.add(contentArea);
  if (group === "home" && (viewingMode !== "browse" || renderer.width >= 80 || navigation.cardsFocused)) {
    const cards = box("status-cards", { flexDirection: "row", width: "100%", height: 4, flexShrink: 0 });
    contentArea.add(cards);
    const counts = countTasks(source ? data.tasks.filter((task) => task.Source === source) : data.tasks);
    const cardIndexes = renderer.width < 150 ? [0, 1, 2, navigation.cardsFocused && navigation.cardIndex >= 4 ? navigation.cardIndex : 3] : taskStatuses.map((_, index) => index);
    cardIndexes.forEach((index) => {
      const state = taskStatuses[index];
      const card = box(`status-card-${index}`, { border: true, borderStyle: "rounded", borderColor: navigation.cardsFocused && navigation.cardIndex === index ? activeBorder : inactiveBorder, flexGrow: 1, flexBasis: 0, paddingLeft: 1 });
      const label = line(`status-card-label-${index}`, state.toLowerCase(), navigation.cardsFocused && navigation.cardIndex === index ? activeBorder : "#b8bac5");
      label.attributes = navigation.cardsFocused && navigation.cardIndex === index ? 1 : 0;
      card.add(label);
      card.add(line(`status-card-count-${index}`, String(counts.statuses[state]), colors[state]));
      cards.add(card);
    });
  }
  const panelArea = box("panels", { flexDirection: "row", flexGrow: 1 });
  contentArea.add(panelArea);
  if (split) {
    const listPanel = box("list-panel", {
      border: true,
      borderStyle: "rounded",
      borderColor:
        viewingMode === "list" && focus === "list" && !navigation.cardsFocused ? activeBorder : "#50556c",
      paddingLeft: 1,
      paddingRight: 1,
      flexGrow: 3,
      flexBasis: 0,
    });
    panelArea.add(listPanel);
    renderTaskList(listPanel, listScroll);
  }
  const p = box("panel", {
    border: true,
    borderStyle: "rounded",
    borderColor:
      isInspectorTab(viewMode) && navigation.opened
        ? viewingMode === "browse" || viewingMode === "list" || focus === "search" || navigation.cardsFocused
          ? "#50556c"
          : activeBorder
        : split ? inactiveBorder : overviewBorder("list", viewingMode, focus),
    paddingLeft: 1,
    paddingRight: 1,
    flexGrow: split ? 2 : 1,
    ...(split ? { flexBasis: 0 } : {}),
  });
  panelArea.add(p);
  if (split) {
    inspectorArea = panelArea;
    inspectorPanel = p;
  }
  if (navigation.opened && isInspectorTab(viewMode)) {
    populateTaskPanel(p, viewMode, oldScroll);
  } else if (split) {
    p.add(line("inspector-empty", "select a task to inspect", "#858796"));
  } else {
    renderTaskList(p, oldScroll);
  }
  renderFooter();
}
function populateTaskPanel(
  p: BoxRenderable,
  viewMode: string,
  oldScroll: number,
) {
  if (navigation.opened && isInspectorTab(viewMode)) {
    const tabs = box("inspector-tabs", { flexDirection: "row", height: 1 });
    p.add(tabs);
    const inspectorFocused = isInspectorTab(navigation.mode) && !navigation.cardsFocused && focus !== "search";
    for (const tab of inspectorTabs) {
      const active = tab === viewMode;
      const tabBox = box("tab-" + tab, { height: 1, backgroundColor: active ? (inspectorFocused ? activeBorder : inactiveBorder) : selectionBackground, shouldFill: true });
      const label = line("tab-label-" + tab, ` ${tab} `, active ? (inspectorFocused ? "#191a29" : "#e0e0e4") : "#858796");
      label.attributes = active ? 1 : 0;
      tabBox.add(label);
      tabs.add(tabBox);
    }
    p.add(
      line(
        "task-heading",
        `${icons[status(navigation.opened)]} ${status(navigation.opened).toLowerCase()} · ${viewMode}`,
        inspectorHeadingColor(status(navigation.opened), inspectorFocused),
      ),
    );
    const taskHeading = p.findDescendantById("task-heading");
    if (taskHeading instanceof TextRenderable) taskHeading.attributes = inspectorFocused ? 1 : 0;
  }
  if (viewMode === "detail" && navigation.opened) {
    p.add(line("panel-padding", " ", RGBA.fromIndex(8)));
    if (changes.length)
      p.add(
        line(
          "changed",
          "Changed: " + changes.join(", ") + (pending ? "  ·  r reload" : ""),
          "#e8bb65",
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
    const t = navigation.opened;
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
  } else if ((viewMode === "links" || viewMode === "history") && navigation.opened) {
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
        String(navigation.opened.Data.title),
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
          ),
        );
      }
    }

  }
}
function renderActiveView() {
  if (!showInspector() || !inspectorArea || !inspectorPanel || inspectorArea.isDestroyed || !navigation.opened) { render(); return; }
  const listPanel = renderer.root.findDescendantById("list-panel");
  if (listPanel instanceof BoxRenderable) listPanel.borderColor = navigation.mode === "list" && !navigation.cardsFocused ? activeBorder : inactiveBorder;
  const heading = renderer.root.findDescendantById("panel-heading");
  if (heading instanceof TextRenderable) {
    const focused = navigation.mode === "list" && !navigation.cardsFocused && focus !== "search";
    heading.fg = focused ? activeBorder : "#858796";
    heading.attributes = focused ? 1 : 0;
  }
  inspectorArea.remove(inspectorPanel);
  inspectorPanel.destroyRecursively();
  scroll = null;
  const panel = box("panel", { border: true, borderStyle: "rounded", borderColor: isInspectorTab(navigation.mode) && !navigation.cardsFocused ? activeBorder : inactiveBorder, paddingLeft: 1, paddingRight: 1, flexGrow: 2, flexBasis: 0 });
  inspectorArea.add(panel);
  inspectorPanel = panel;
  populateTaskPanel(panel, navigation.mode === "list" || navigation.mode === "browse" ? navigation.inspectorMode : navigation.mode, 0);
}
function renderTaskList(p: BoxRenderable, oldScroll: number) {
  p.add(
    line(
      "panel-heading",
      (group === "home" ? "home · recent activity" : source ? sourceName(source) : "all backlogs") +
        " · " +
        taskListCountLabel(
          data.tasks,
          visible.length,
          Boolean(source || group || query),
        ),
      navigation.mode === "list" && !navigation.cardsFocused ? activeBorder : "#858796",
    ),
  );
  const heading = p.findDescendantById("panel-heading");
  if (heading instanceof TextRenderable) heading.attributes = navigation.mode === "list" && !navigation.cardsFocused ? 1 : 0;
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
    });
    scroll!.add(item);
    const body = box("body-" + i, { flexGrow: 1 });
    item.add(body);
    const titleBox = box("selection-" + i, {
      width: "100%",
      backgroundColor: t.Key === navigation.selected ? selectionBackground : undefined,
      shouldFill: t.Key === navigation.selected,
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
          "task-" + visible.findIndex((t) => t.Key === navigation.selected),
        );
        if (revealSelected && (!target || target.height === 0)) return;
        listScroll = restoreTaskViewport(
          listView,
          oldScroll,
          revealSelected
            ? visible.findIndex((t) => t.Key === navigation.selected)
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
  const sel = visible.findIndex((t) => t.Key === navigation.selected);
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
const snapshots = new SnapshotClient(backend, cli.sources, snapshotCachePath(cli.sources, settings.sources));
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const next = await snapshots.read();
    if (renderer.isDestroyed) return;
    if (navigation.opened) {
      const t = next.tasks.find((x) => x.Key === navigation.opened!.Key);
      if (showingCachedSnapshot && t) {
        navigate({ type: "select", task: t, reload: true });
      } else if (showingCachedSnapshot && !t) {
        navigate({ type: "select", task: null });
      } else if (t) {
        changes = Object.keys({ ...navigation.opened.Data, ...t.Data }).filter(
          (k) => JSON.stringify(navigation.opened!.Data[k]) !== JSON.stringify(t.Data[k]),
        );
        pending = changes.length ? t : null;
      } else {
        changes = ["task unavailable"];
        pending = null;
      }
    }
    const changed = JSON.stringify(data) !== JSON.stringify(next);
    const detached = navigation.opened && !visible.some((task) => task.Key === navigation.selected) ? next.tasks.find((task) => task.Key === navigation.selected) : undefined;
    data = next;
    const hadCachedSnapshot = showingCachedSnapshot;
    showingCachedSnapshot = false;
    let taskLookupChanged = false;
    if (taskLookupPending) {
      const task = resolveTask(data.tasks, cli.taskId);
      if (task) {
        taskLookupPending = false;
        source = "";
        group = `status:${status(task)}`;
        openTask(task);
      } else if (data.failed.length === 0) {
        taskLookupPending = false;
        taskLookupWarning = `Task id "${cli.taskId}" was not found; showing the task list.`;
        taskLookupChanged = true;
      }
    }
    if (changed || taskLookupChanged || hadCachedSnapshot) listTasks(detached);
    if ((changed || taskLookupChanged || hadCachedSnapshot) && focus !== "search" && navigation.mode !== "add" && navigation.mode !== "help")
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
  if (!navigation.opened) return [];
  const value =
    String(navigation.opened.Data.links || "") + " " + String(navigation.opened.Data.body || "");
  const urls = [
    ...new Set(
      value.match(/https?:\/\/[^\s<>,]+|data\/[A-Za-z0-9_./-]+\.md/g) || [],
    ),
  ];
  const tasks = data.tasks.filter(
    (t) =>
      t.Source === navigation.opened?.Source &&
      matchesDependency(String(navigation.opened?.Data.deps || ""), String(t.Data.id)),
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
  if (!entry || !navigation.opened) return;
  linkIndex = index;
  if (entry.task) {
    openTask(entry.task);
    return;
  }
  if (entry.url) {
    linkError = (await openLink(entry.url, navigation.opened.Source)) || "";
    if (!renderer.isDestroyed && navigation.mode === "links") renderActiveView();
  }
}
async function showHistory() {
  if (!navigation.opened) return;
  const key = navigation.opened.Key;
  navigate({ type: "focus", mode: "history" });
  historyText = "loading…";
  renderActiveView();
  const p = Bun.spawn(
    [backend, "--history", navigation.opened.Source, String(navigation.opened.Data.id)],
    { stdout: "pipe", stderr: "pipe" },
  );
  const result = await new Response(p.stdout).text();
  const failed = await p.exited;
  if (renderer.isDestroyed || navigation.opened?.Key !== key) return;
  historyText = failed
    ? "unable to read archived notes"
    : result.trim() === "No archived note versions found for this task."
      ? "no archived note versions found for this task"
      : result.trim() === "No archived note versions available."
        ? "no archived note versions available"
        : result;
  if (navigation.mode === "history") renderActiveView();
}
renderer.keyInput.on("keypress", (key) => {
  if (focus === "search") {
    if (key.name === "escape") {
      searchText = "";
      query = "";
      listTasks();
      focus = "list";
      input?.blur();
      render();
    }
    return;
  }
  if (navigation.mode === "help") {
    navigate({ type: "dismiss" });
    render();
    return;
  }
  if (navigation.mode === "add") {
    if (key.name === "escape") {
      navigate({ type: "dismiss" });
      addPath = "";
      render();
    }
    return;
  }
  const name = ({ j: "down", k: "up", h: "left", l: "right" } as Record<string, string>)[key.name] || key.name;
  if ((name === "left" || name === "right" || (navigation.cardsFocused && name === "down"))) {
    const panel: FocusState["panel"] = navigation.cardsFocused ? "cards" : navigation.mode === "browse" ? "browse" : navigation.mode === "list" ? "list" : "inspector";
    const next = moveFocus({ panel, cardIndex: navigation.cardIndex, home: group === "home", width: renderer.width }, name);
    if (panel === "browse" && next.panel !== "browse") {
      const active = navItems.findIndex((item) => item.source === source && item.group === group);
      if (active >= 0) navIndex = active;
    }
    navigate({ type: "cards", focused: next.panel === "cards", index: next.cardIndex });
    if (next.panel === "inspector" && panel === "list") {
      const task = visible.find((t) => t.Key === navigation.selected);
      if (task) { openTask(task); return; }
    } else if (next.panel === "browse") navigate({ type: "focus", mode: "browse" });
    else if (next.panel === "list") {
      navigate({ type: "focus", mode: "list" });
      if (!visible.some((task) => task.Key === navigation.selected)) listTasks();
      const task = visible.find((t) => t.Key === navigation.selected);
      if (task && renderer.width >= 80) {
        navigate({ type: "select", task });
      }
    }
    render();
    return;
  }
  if (navigation.cardsFocused) {
    if (name === "return") {
      navigate({ type: "cards", focused: false });
      chooseBrowse({ source, group: `status:${taskStatuses[navigation.cardIndex]}` });
      return;
    }
    if (name === "escape") { navigate({ type: "cards", focused: false }); navigate({ type: "focus", mode: "browse" }); render(); return; }
    if (!["a", "/", "?", "q", "d", "r"].includes(name)) return;
    if (["a", "/"].includes(name)) navigate({ type: "cards", focused: false });
  }
  if (group === "home" && name === "up" && ((navigation.mode === "list" && visible.findIndex((t) => t.Key === navigation.selected) <= 0) || (["detail", "history"].includes(navigation.mode) && (scroll?.scrollTop || 0) === 0) || (navigation.mode === "links" && linkIndex === 0))) {
    navigate({ type: "cards", focused: true });
    navigate({ type: "focus", mode: "list" });
    render();
    return;
  }
  if (isInspectorTab(navigation.mode) && ["u", "i", "o"].includes(name) && navigation.opened) {
    if (name === "o") showHistory();
    else { navigate({ type: "focus", mode: name === "u" ? "detail" : "links" }); linkIndex = 0; linkError = ""; render(); }
    return;
  }
  if (name === "q") {
    renderer.destroy();
    return;
  }
  if (name === "escape") {
    if (!isInspectorTab(navigation.mode)) backFromTask();
    return;
  }
  if (name === "?") {
    helpPanel = navigation.cardsFocused ? "cards" : navigation.mode as HelpPanel;
    navigate({ type: "modal", modal: "help" });
    render();
    return;
  }
  if (name === "/") {
    key.preventDefault();
    navigate({ type: "focus", mode: "list" });
    focus = "search";
    render();
    return;
  }
  if (name === "a") {
    key.preventDefault();
    navigate({ type: "modal", modal: "add" });
    render();
    return;
  }
  if (name === "d") {
    showDone = !showDone;
    listTasks();
    settings.showDone = showDone;
    save();
    render();
    return;
  }
  if (name === "r") {
    if (pending) openTask(pending, true);
    else refresh();
    return;
  }
  if (
    navigation.inspecting &&
    renderer.width < 150 &&
    isInspectorTab(navigation.mode) &&
    name === "e"
  ) {
    navigate({ type: "expand" });
    render();
    return;
  }
  if (
    isInspectorTab(navigation.mode) &&
    (name === "pageup" || name === "pagedown")
  ) {
    const current = visible.findIndex((t) => t.Key === navigation.opened?.Key);
    const next = current + (name === "pagedown" ? 1 : -1);
    if (current >= 0 && visible[next]) {
      if (showInspector() && taskListScroll) {
        selectTask(taskListScroll, current, next);
        listScroll = taskListScroll.scrollTop;
        updateSticky();
        revealSelected = false;
      } else revealSelected = true;
      openTask(visible[next]);
    }
    return;
  }
  if (navigation.mode === "links") {
    if (name === "up" || name === "down") {
      linkIndex = Math.max(
        0,
        Math.min(
          linkEntries().length - 1,
          linkIndex + (name === "down" ? 1 : -1),
        ),
      );
      render();
      scroll?.scrollChildIntoView("link-" + linkIndex);
      return;
    }
    if (name === "return") {
      activateLink(linkIndex);
      return;
    }
  }
  if (navigation.mode === "browse") {
    if (
      ["up", "down", "home", "end", "pageup", "pagedown"].includes(name)
    ) {
      const previous = navIndex;
      navIndex = navigationTarget(
        navScroll,
        navIndex,
        navItems.length,
        name,
        "nav",
      );
      selectBrowse(
        navScroll,
        previous,
        navIndex,
        navItems.map((item) => item.label),
        renderer.width >= 80
          ? sidebarWidth - 9
          : Math.max(1, renderer.width - 10),
        navItems.findIndex(
          (item) => item.source === source && item.group === group,
        ),
      );
      navScrollTop = navScroll?.scrollTop || 0;
      return;
    } else if (name === "return") {
      const n = navItems[navIndex];
      if (n) chooseBrowse(n);
    }
    return;
  }
  if (navigation.mode === "list") {
    let i = visible.findIndex((t) => t.Key === navigation.selected);
    if (name === "return") {
      if (visible[i]) openTask(visible[i]);
      return;
    } else if (
      ["up", "down", "home", "end", "pageup", "pagedown"].includes(name)
    )
      i = navigationTarget(taskListScroll, i, visible.length, name);
    else return;
    const previous = visible.findIndex((t) => t.Key === navigation.selected);
    if (previous !== i) navigate({ type: "select", task: visible[i] || null });
    selectTask(taskListScroll, previous, i);
    if (previous !== i && visible[i] && renderer.width >= 80) {
      pending = null;
      changes = [];
      listScroll = taskListScroll?.scrollTop || 0;
      renderActiveView();
      updateSticky();
    } else updateSticky();
  } else if (scroll) {
    if (name === "down") scroll.scrollBy(1);
    if (name === "up") scroll.scrollBy(-1);
    if (name === "pagedown") scroll.scrollBy(10);
    if (name === "pageup") scroll.scrollBy(-10);
  }
});
renderer.on("resize", () => { navigate({ type: "resize", width: renderer.width }); listTasks(navigation.opened && !visible.some((task) => task.Key === navigation.selected) ? navigation.opened : undefined); render(); });
if (!cli.taskId) {
  const cached = await snapshots.readCached();
  if (cached) {
    data = cached;
    showingCachedSnapshot = true;
  }
}
listTasks();
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
