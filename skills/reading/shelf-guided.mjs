// 书页 `slot: guided`（导读）的排期纯函数：一段 = `## 分段` 里的一行，不按 10 页切。
// 不读写文件、不读时钟（日期由调用方注入）；bookshelf.mjs 的命令层负责 IO。
// 规则：只在 `days` 给的星期读；已读段的日子取读书记录里的日期；没读的段不留
// 在原日子，从今天（今天是导读日就从今天，否则下一个导读日）起往后排——
// 「日子跟着实际读的走」，和自读同理。

const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_NAMES = Object.keys(DAY_INDEX).join(" ");

function weekdayOf(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function addDays(date, n) {
  const time = Date.parse(`${date}T00:00:00Z`);
  return new Date(time + n * 86400000).toISOString().slice(0, 10);
}

// `days` frontmatter 原串 → 星期序号数组（0 = 周日）。去重、保留原顺序；
// 空串或不认识的值抛错（书页数据问题，命令层转成 fail）。
export function parseDays(text) {
  const parts = String(text ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) {
    throw new Error(`days 为空（导读书要写成 mon,wed 这样的逗号分隔星期）`);
  }
  const days = [];
  for (const part of parts) {
    const day = DAY_INDEX[part];
    if (day === undefined) {
      throw new Error(`days 里的「${part}」不认识（可取 ${DAY_NAMES}）`);
    }
    if (!days.includes(day)) days.push(day);
  }
  return days;
}

// 从 from 起第 k 个导读日（k = 0 是 from 当天在内的第一个导读日）。
function guidedDayAt(days, from, k) {
  let seen = -1;
  for (let offset = 0; ; offset += 1) {
    const date = addDays(from, offset);
    if (days.includes(weekdayOf(date))) {
      seen += 1;
      if (seen === k) return date;
    }
  }
}

// 下一个导读日：今天本身就是导读日返回今天，否则往后找最近的那天。
export function nextGuidedDay(days, today) {
  return guidedDayAt(days, today, 0);
}

// 每段的排期 → [{ index, title, from, to, date, done }]：
// - 已读段（index <= position）：date 取 readDates 的记录；没记录的段按
//   「从 started（没有则 today）起每个导读日一段」顺推名义日期；
// - 未读段：从下一个导读日（含今天；started 更晚时从 started 后的导读日）起，
//   每个导读日一段。
// readDates 是 Map<段号, YYYY-MM-DD>（读书记录的日期），没有 Map.get 的段用名义日期。
export function guidedSchedule({ segments, position, started, days, today, readDates }) {
  const nominalStart = nextGuidedDay(days, started === "" || started === undefined ? today : started);
  let unreadStart = nextGuidedDay(days, today);
  if (started !== "" && started !== undefined) {
    const startedDay = nextGuidedDay(days, started);
    if (startedDay > unreadStart) unreadStart = startedDay;
  }
  return segments.map((segment, i) => {
    const index = i + 1;
    if (index <= position) {
      return {
        index,
        title: segment.title,
        from: segment.from,
        to: segment.to,
        date: readDates?.get(index) ?? guidedDayAt(days, nominalStart, index - 1),
        done: true,
      };
    }
    return {
      index,
      title: segment.title,
      from: segment.from,
      to: segment.to,
      date: guidedDayAt(days, unreadStart, index - position - 1),
      done: false,
    };
  });
}

// 最后一段排到的日期（预计读完）；没有分段为 null。
export function guidedEnd({ segments, position, started, days, today, readDates }) {
  const rows = guidedSchedule({ segments, position, started, days, today, readDates });
  const last = rows[rows.length - 1];
  return last === undefined ? null : last.date;
}
