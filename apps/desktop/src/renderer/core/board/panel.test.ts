/**
 * The 总控面板 view models: six tiles (normal / warn / loading), the 书房 rows
 * (order, modes, meta), and the unplanned-material list — plus a cross-check
 * that the tiles count the same facts `buildDay` / `ankiDueCount` count.
 */

import { describe, expect, it } from "vitest";
import type {
  AnkiStatus,
  CardsStats,
  CycleOverview,
  ShelfListItem,
  SubjectsOverview,
} from "@shared/data-protocol.js";
import { ankiDueCount } from "./cycle-today.js";
import {
  bookTitle,
  panelTiles,
  shelfRows,
  unplannedMaterials,
  type PanelTile,
  type PanelTilesInput,
} from "./panel.js";
import { buildDay, buildWeek, type PlanbookInput } from "./planbook.js";
import {
  ANKI,
  CALENDAR_MONTH,
  COURSE_C,
  CYCLE_MONTH,
  OVERVIEW,
  SHELF_LIST,
  TODAY,
} from "./consistency-fixture.js";

const PLANBOOK: PlanbookInput = {
  today: TODAY,
  cycleMonths: [CYCLE_MONTH],
  calendarMonths: [CALENDAR_MONTH],
  shelf: SHELF_LIST,
  overview: OVERVIEW,
  courses: [],
  anki: ANKI,
};
const DAY = buildDay(PLANBOOK, TODAY);
const WEEK = buildWeek(PLANBOOK);

const CARDS: CardsStats = {
  total: 505,
  unsynced: 39,
  broken: 0,
  decks: Array.from({ length: 9 }, (_, index) => ({ deck: `D${index}`, total: 50, unsynced: 4, files: [] })),
  pendingExtracts: 0,
};

function input(overrides: Partial<PanelTilesInput> = {}): PanelTilesInput {
  return {
    today: TODAY,
    overview: OVERVIEW,
    day: DAY,
    week: WEEK,
    shelf: SHELF_LIST,
    anki: ANKI,
    cards: CARDS,
    ...overrides,
  };
}

function tile(tiles: PanelTile[], key: PanelTile["key"]): PanelTile {
  const found = tiles.find((item) => item.key === key);
  if (!found) throw new Error(`没有 ${key} 这一格`);
  return found;
}

function book(overrides: Partial<ShelfListItem> & { slug: string }): ShelfListItem {
  return {
    title: `《${overrides.slug}》`,
    short: overrides.slug.toUpperCase(),
    slot: "planned",
    order: 1,
    status: "reading",
    total: 10,
    position: 0,
    started: "2026-11-09",
    end: "",
    target: null,
    targetLate: null,
    extracts: [],
    coreRead: [],
    upcoming: [],
    ...overrides,
  };
}

describe("panelTiles: six tiles, normal / loading", () => {
  it("cycle: 周期名与周数、预计收尾；晚开始也不标 warn（panel v2）", () => {
    const normal = tile(panelTiles(input()), "cycle");
    expect(normal).toEqual({ key: "cycle", value: "C1 · 第 1 周", sub: "预计 12-24 收尾", warn: false });

    const cycle = OVERVIEW.cycle;
    if (cycle === null) throw new Error("fixture 要有周期");
    // delayDays 不再进这一格：原计划 / 按现在进度两条线写在总进度最后一行。
    const delayed: CycleOverview = {
      ...OVERVIEW,
      cycle: { ...cycle, end: "2026-12-29", delayDays: 5 },
    };
    expect(tile(panelTiles(input({ overview: delayed })), "cycle")).toEqual({
      key: "cycle",
      value: "C1 · 第 1 周",
      sub: "预计 12-29 收尾",
      warn: false,
    });
  });

  it("cycle: 不在周期内时写「不在周期内」，overview 没读回来时留空", () => {
    const out: CycleOverview = { ...OVERVIEW, cycle: null };
    expect(tile(panelTiles(input({ overview: out })), "cycle")).toEqual({
      key: "cycle",
      value: "不在周期内",
      sub: "",
      warn: false,
    });
    expect(tile(panelTiles(input({ overview: null })), "cycle")).toEqual({
      key: "cycle",
      value: "",
      sub: "",
      warn: false,
    });
  });

  it("today: 完成 / 总项，第一个未完成主课写「先上 …」；都做完写「都做完了」", () => {
    const normal = tile(panelTiles(input()), "today");
    // 11-10 没读的讲后读跟到今天，算今天的一项。
    expect(normal).toEqual({ key: "today", value: "2 / 5 项", sub: "主攻日 · 先上 离散 D5", warn: false });

    const allDone = { ...DAY, items: DAY.items.map((item) => ({ ...item, mark: "done" as const })) };
    expect(tile(panelTiles(input({ day: allDone })), "today").sub).toBe("今天的都做完了");

    const outside = { ...DAY, type: null };
    expect(tile(panelTiles(input({ day: outside })), "today").sub).toBe("先上 离散 D5");
    expect(tile(panelTiles(input({ day: null })), "today")).toEqual({
      key: "today",
      value: "",
      sub: "",
      warn: false,
    });
  });

  it("today on a 整合日: 「整合日 · 先做两门周核实」 while 周核实 are left; one left reads 「先做周核实」", () => {
    const verify = (slug: string, mark: "now" | "done") => ({
      lane: "main" as const,
      text: `${slug} · 周核实`,
      short: `${slug} 周核实`,
      mark,
      slug,
      id: null,
    });
    const integration = {
      ...DAY,
      type: "整合" as const,
      items: [verify("离散", "now"), verify("CTM", "now")],
    };
    expect(tile(panelTiles(input({ day: integration })), "today").sub).toBe("整合日 · 先做两门周核实");
    const oneLeft = { ...integration, items: [verify("离散", "done"), verify("CTM", "now")] };
    expect(tile(panelTiles(input({ day: oneLeft })), "today").sub).toBe("整合日 · 先做周核实");
  });

  it("week: 全周完成 / 总项，小行只写还剩几项（不再数「过了日子还没做」）", () => {
    const normal = tile(panelTiles(input()), "week");
    expect(normal).toEqual({ key: "week", value: "3 / 11 项", sub: "还剩 8 项", warn: false });

    const quiet = {
      ...WEEK,
      days: WEEK.days.map((day) => ({ ...day, items: day.items.filter((item) => item.mark !== "warn") })),
    };
    const done = quiet.days.flatMap((day) => day.items).filter((item) => item.mark === "done").length;
    const total = quiet.days.flatMap((day) => day.items).length;
    expect(tile(panelTiles(input({ week: quiet })), "week")).toEqual({
      key: "week",
      value: `${done} / ${total} 项`,
      sub: `还剩 ${total - done} 项`,
      warn: false,
    });
    expect(tile(panelTiles(input({ week: null })), "week")).toEqual({
      key: "week",
      value: "",
      sub: "",
      warn: false,
    });
  });

  it("shelf: 在读的书 + 导读课；小行是计划内那本的预计读完日", () => {
    const normal = tile(panelTiles(input()), "shelf");
    expect(normal).toEqual({ key: "shelf", value: "2 本在读", sub: "HTSP 预计 11-12 读完", warn: false });

    // 比目标晚的书不再标 warn，也不写「会晚 N 天」：只写预计读完的那一天。
    const late = book({ slug: "epp", short: "Epp", target: "2027-01-15", targetLate: 15, end: "2027-01-30" });
    const later = book({
      slug: "ctm",
      short: "CTM",
      order: 2,
      target: "2027-02-01",
      targetLate: 30,
      end: "2027-03-03",
    });
    expect(tile(panelTiles(input({ shelf: [late, later] })), "shelf")).toEqual({
      key: "shelf",
      value: "3 本在读",
      sub: "Epp 预计 01-30 读完",
      warn: false,
    });

    expect(tile(panelTiles(input({ shelf: null })), "shelf")).toEqual({
      key: "shelf",
      value: "",
      sub: "",
      warn: false,
    });
  });

  it("anki: 连接时「N 张 · 今天到期 · Anki 已打开」；没开时写「没开」不提没刷", () => {
    const normal = tile(panelTiles(input()), "anki");
    expect(normal).toEqual({ key: "anki", value: "42 张", sub: "今天到期 · Anki 已打开", warn: false });

    const off: AnkiStatus = { running: false };
    expect(tile(panelTiles(input({ anki: off })), "anki")).toEqual({
      key: "anki",
      value: "没开",
      sub: "打开 Anki 后显示今天的张数",
      warn: false,
    });
    expect(tile(panelTiles(input({ anki: null })), "anki")).toEqual({
      key: "anki",
      value: "",
      sub: "",
      warn: false,
    });
  });

  it("cards: 待同步数；broken > 0 时改写「B 张格式不全」并标 warn", () => {
    const normal = tile(panelTiles(input()), "cards");
    expect(normal).toEqual({ key: "cards", value: "39 张待同步", sub: "共 505 张 · 9 个牌组", warn: false });

    const broken = tile(panelTiles(input({ cards: { ...CARDS, broken: 3 } })), "cards");
    expect(broken).toEqual({
      key: "cards",
      value: "39 张待同步",
      sub: "共 505 张 · 3 张格式不全",
      warn: true,
    });
    expect(tile(panelTiles(input({ cards: null })), "cards")).toEqual({
      key: "cards",
      value: "",
      sub: "",
      warn: false,
    });
  });

  it("全部输入还在读取时，六格都留空", () => {
    const tiles = panelTiles({
      today: TODAY,
      overview: null,
      day: null,
      week: null,
      shelf: null,
      anki: null,
      cards: null,
    });
    expect(tiles.map((item) => [item.key, item.value, item.sub])).toEqual([
      ["cycle", "", ""],
      ["today", "", ""],
      ["week", "", ""],
      ["shelf", "", ""],
      ["anki", "", ""],
      ["cards", "", ""],
    ]);
  });
});

describe("shelfRows: 在读 → 导读课 → 暂停 → 排队", () => {
  const overview: CycleOverview = {
    ...OVERVIEW,
    courses: [
      ...OVERVIEW.courses.filter((course) => course.role !== "aux"),
      {
        slug: COURSE_C,
        subject: "c-systems-programming",
        role: "aux",
        name: "Effective C",
        total: 7,
        done: 1,
        end: "2026-12-23",
        next: null,
        lessons: [],
      },
      {
        slug: "ds-guide",
        subject: "data-structures",
        role: "aux",
        name: "数据结构",
        total: 10,
        done: 2,
        end: "2026-12-24",
        next: null,
        lessons: [],
      },
    ],
  };
  const shelf: ShelfListItem[] = [
    book({
      slug: "epp",
      short: "Epp",
      title: "Epp 书",
      position: 3,
      total: 81,
      end: "2027-01-30",
      target: "2027-01-15",
      targetLate: 15,
      coreRead: [{ pages: "12–15", course: "epp", label: "§1.3", date: "2026-11-09" }],
    }),
    book({
      slug: "htsp",
      short: "HTSP",
      title: "HTSP 书",
      order: 3,
      status: "paused",
      position: 3,
      total: 12,
      started: "2026-10-30",
    }),
    book({
      slug: "ctm",
      short: "CTM",
      title: "CTM 书",
      order: 2,
      status: "queued",
      total: 79,
      started: "",
      end: "2027-02-10",
    }),
    book({ slug: "old", short: "OLD", title: "读完的", order: 4, status: "done", position: 10 }),
  ];

  it("排序与字段：读完的不列，顺序是 在读 → 导读课 → 暂停 → 排队", () => {
    const rows = shelfRows({ today: TODAY, shelf, overview, week: WEEK });
    expect(rows.map((row) => [row.slug, row.status])).toEqual([
      ["epp", "reading"],
      [COURSE_C, "reading"],
      ["ds-guide", "reading"],
      ["htsp", "paused"],
      ["ctm", "queued"],
    ]);
    const epp = rows[0];
    if (!epp) throw new Error("没有 epp 行");
    expect(epp).toMatchObject({
      kind: "book",
      mode: "after-self",
      unit: "段",
      done: 3,
      total: 81,
      warn: false,
      target: "2027-01-15",
    });
    // 预计日与目标日两个平日子（panel v2）：不写「会晚 N 天」。
    expect(epp.meta).toBe("预计 01-30 读完 · 目标 01-15");
  });

  it("导读课行：星期来自 subjectDays，预计日期是课程的 end", () => {
    const rows = shelfRows({ today: TODAY, shelf, overview, week: WEEK });
    const ec = rows.find((row) => row.slug === COURSE_C);
    const ds = rows.find((row) => row.slug === "ds-guide");
    expect(ec).toMatchObject({ kind: "guide", mode: "guide", unit: "节", done: 1, total: 7 });
    expect(ec?.meta).toBe("周一、周三 · 预计 12-23 读完");
    expect(ds?.meta).toBe("周二、周四 · 预计 12-24 读完");
  });

  it("暂停的 meta 是「已暂停 · 读到第 n 段」；排队的 meta 写前一本并放最后", () => {
    const rows = shelfRows({ today: TODAY, shelf, overview, week: WEEK });
    expect(rows.find((row) => row.slug === "htsp")?.meta).toBe("已暂停 · 读到第 3 段");
    const last = rows[rows.length - 1];
    expect(last?.slug).toBe("ctm");
    expect(last?.meta).toBe("排在 Epp 后面 · 预计 02-10 读完");
  });

  it("本周有 lane after 且 slug 相同 → after-self，不看 coreRead", () => {
    const week = {
      ...WEEK,
      days: WEEK.days.map((day) => ({
        ...day,
        items:
          day.date === TODAY
            ? [
                {
                  lane: "after" as const,
                  text: "讲后读",
                  short: "",
                  mark: "plan" as const,
                  slug: "ctm",
                  id: null,
                },
              ]
            : day.items,
      })),
    };
    const rows = shelfRows({ today: TODAY, shelf, overview, week });
    expect(rows.find((row) => row.slug === "ctm")?.mode).toBe("after-self");
    expect(rows.find((row) => row.slug === "htsp")?.mode).toBe("self");
  });
});

describe("unplannedMaterials: 只取 ◌（mark none）", () => {
  it("按科目顺序列出 subject/subjectTitle/title/type/role", () => {
    const subjects: SubjectsOverview = {
      date: TODAY,
      cycle: null,
      subjects: [
        {
          slug: "discrete-math",
          title: "离散数学",
          layer: "基础",
          route: "C1",
          main: true,
          courses: ["epp"],
          materials: [
            { type: "书籍", mark: "now", status: "学习中", role: "主线", title: "Epp", course: "epp" },
            { type: "书籍", mark: "none", status: "未制定计划", role: "参考", title: "Rosen", course: null },
          ],
          defaultStyle: null,
        },
        {
          slug: "c-lang",
          title: "C 语言",
          layer: "基础",
          route: "C1",
          main: false,
          courses: [],
          materials: [
            { type: "在线书籍", mark: "done", status: "已摄取", role: "主线", title: "K&R", course: null },
            { type: "视频", mark: "none", status: "未制定计划", role: "拓展", title: "CS50", course: null },
          ],
          defaultStyle: null,
        },
      ],
    };
    expect(unplannedMaterials(subjects)).toEqual([
      { subject: "discrete-math", subjectTitle: "离散数学", title: "Rosen", type: "书籍", role: "参考" },
      { subject: "c-lang", subjectTitle: "C 语言", title: "CS50", type: "视频", role: "拓展" },
    ]);
  });
});

describe("跨处一致：面板与既有视图数的是同一件事", () => {
  it("今天完成数 = buildDay 的 done 项数；Anki 张数 = ankiDueCount（今日卡同一函数）", () => {
    const tiles = panelTiles(input());
    const todayDone = DAY.items.filter((item) => item.mark === "done").length;
    expect(tile(tiles, "today").value).toBe(`${todayDone} / ${DAY.items.length} 项`);
    const due = ankiDueCount(ANKI);
    expect(tile(tiles, "anki").value).toBe(`${due ?? 0} 张`);
  });
});

describe("unplannedMaterials: 路径不进书名", () => {
  it("把链接路径当书名时，只显示书名，不带 raw/ 路径", () => {
    const subjects = {
      subjects: [
        {
          slug: "data-structures-algorithms",
          title: "数据结构与算法",
          materials: [
            {
              type: "书籍",
              mark: "none",
              status: "未制定计划",
              role: "参考",
              title: "CLRS《Introduction to Algorithms》4th（`raw/学习路径/数据结构/clrs.pdf`）",
              course: null,
            },
          ],
        },
      ],
    } as unknown as SubjectsOverview;
    const [item] = unplannedMaterials(subjects);
    expect(item?.title).toBe("CLRS《Introduction to Algorithms》4th");
    expect(item?.title).not.toMatch(/raw\//);
  });
});

describe("bookTitle", () => {
  it("drops a trailing path note, with or without more notes after the path", () => {
    expect(bookTitle("SICP（`raw/library/sicp.pdf`）")).toBe("SICP");
    expect(
      bookTitle(
        "CLRS《Introduction to Algorithms》4th（`raw/学习路径/数据结构和算法/x.pdf`，1312 页，书目未建 source 页）",
      ),
    ).toBe("CLRS《Introduction to Algorithms》4th");
    expect(bookTitle("Davies · A Cool Brisk Walk")).toBe("Davies · A Cool Brisk Walk");
    expect(bookTitle("离散数学（Epp, 5th ed）")).toBe("离散数学（Epp, 5th ed）");
  });
});
