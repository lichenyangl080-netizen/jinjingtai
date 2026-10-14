import test from "node:test";
import assert from "node:assert/strict";
import {
  currentProjectRecords,
  sample,
  TODAY,
  saveRecord,
  confirmDay,
  visibleRecords,
  periodRange,
  shiftDate,
  displacedBy,
  historicalNext,
  planningLimit,
  dailyRecordPreview,
  dailyRecordTitle,
  workGroups,
  newestRecord,
} from "../src/model.ts";

test("同日补记按发生顺序取最新，编辑旧记和补录旧日期不翻转现状", () => {
  let s = { version: 1, records: [], projects: [], notes: {} };
  const record = (id, date, next) => ({
    id,
    date,
    next,
    project: "p",
    title: id,
    change: "",
    kind: "手动补记",
    confirmed: true,
    manual: true,
  });
  s = saveRecord(s, {
    ...record("morning", "2026-10-07", "上午下一步"),
    createdAt: "2026-10-07T01:00:00Z",
  });
  s = saveRecord(s, {
    ...record("afternoon", "2026-10-07", "下午下一步"),
    createdAt: "2026-10-07T06:00:00Z",
  });
  assert.equal(historicalNext(s, "p", "2026-10-07"), "下午下一步");
  s = saveRecord(s, {
    ...s.records[0],
    change: "编辑旧记",
    createdAt: "2026-10-07T12:00:00Z",
  });
  assert.equal(historicalNext(s, "p", "2026-10-07"), "下午下一步");
  s = saveRecord(s, record("yesterday", "2026-10-06", "旧日下一步"));
  assert.equal(historicalNext(s, "p", "2026-10-07"), "下午下一步");
  const legacy = {
    ...s,
    records: [
      record("old", "2026-10-07", "旧"),
      record("new", "2026-10-07", "新"),
    ],
  };
  assert.equal(historicalNext(legacy, "p", "2026-10-07"), "新");
  assert.equal(
    [...legacy.records].sort((a, b) => newestRecord(legacy, a, b))[0].id,
    "new",
  );
});

test("每日预览优先人工内容及有效进展，不删除明细或改写原标题", () => {
  const state = structuredClone(sample);
  const original = structuredClone(state);
  const ordered = dailyRecordPreview(state, state.records);
  assert.equal(ordered[0].manual, true);
  assert.equal(ordered.length, state.records.length);
  assert.deepEqual(state, original);
  assert.equal(dailyRecordTitle("进境台：改善阅读", "进境台"), "改善阅读");
  assert.equal(
    dailyRecordTitle("其他项目：改善阅读", "进境台"),
    "其他项目：改善阅读",
  );
});
test("归并的原草稿保留正文但不重复进入每日、确认和回望", () => {
  const s = structuredClone(sample);
  s.records[0].supersededDraftBy = "new-job";
  const out = confirmDay(s, TODAY);
  assert(!visibleRecords(out, TODAY).some((r) => r.id === s.records[0].id));
  assert.equal(out.records[0].confirmed, false);
  assert.equal(out.records[0].change, s.records[0].change);
});
test("确认只改变目标日期的可见草稿，不覆盖已确认内容", () => {
  const state = structuredClone(sample);
  state.records[1].removed = true;
  const out = confirmDay(state, TODAY);
  assert.equal(out.records[0].confirmed, true);
  assert.equal(out.records[1].confirmed, false);
  assert.deepEqual(out.records[3], state.records[3]);
  assert.equal(state.records[0].confirmed, false);
});
test("新增草稿二次确认保留人工改动及已确认记录", () => {
  let state = confirmDay(structuredClone(sample), TODAY);
  state = saveRecord(state, { ...state.records[0], title: "用户校正的内容" });
  state.records.push({
    ...state.records[0],
    id: "later",
    title: "新增",
    confirmed: false,
    manual: false,
  });
  const prior = structuredClone(state.records[0]);
  const out = confirmDay(state, TODAY);
  assert.deepEqual(out.records[0], prior);
  assert.equal(out.records.at(-1).confirmed, true);
});
test("人工补记立即确认，编辑AI草稿仍待确认", () => {
  const state = structuredClone(sample);
  const manual = saveRecord(state, {
    ...state.records[0],
    id: "manual",
    title: "补记",
    confirmed: false,
  });
  assert.equal(manual.records.at(-1).confirmed, true);
  assert.equal(manual.records.at(-1).manual, true);
  const edit = saveRecord(state, {
    ...state.records[0],
    confirmed: true,
    manual: true,
    title: "编辑",
  });
  assert.equal(edit.records[0].confirmed, false);
  assert.equal(edit.records[0].manual, false);
});
test("移除内容不进入日期列表，恢复后原文不变", () => {
  const state = structuredClone(sample);
  const title = state.records[0].title;
  state.records[0].removed = true;
  assert.equal(visibleRecords(state, TODAY).length, 2);
  state.records[0].removed = false;
  assert.equal(
    visibleRecords(state, TODAY).find((r) => r.id === "r1").title,
    title,
  );
});
test("日期跨月和周月年范围正确", () => {
  assert.equal(shiftDate("2026-10-01", -1), "2026-09-30");
  assert.deepEqual(periodRange("周", 0), ["2026-09-28", "2026-10-04"]);
  assert.deepEqual(periodRange("月", -1), ["2026-09-01", "2026-09-30"]);
  assert.deepEqual(periodRange("年", 0), ["2026-01-01", "2026-12-31"]);
});

test("保存的后续更正立即更新现行结论，不需确认，历史周期不使用未来方案", () => {
  const base = {
    id: "b",
    date: "2026-10-01",
    project: "p",
    title: "采用B",
    change: "原始已确认正文",
    next: "继续B",
    kind: "决策",
    confirmed: true,
    manual: false,
    sourceIds: ["b:0"],
  };
  const replacement = {
    ...base,
    id: "c",
    date: "2026-10-05",
    title: "否定B",
    change: "实测后否定B",
    next: "验证C",
    confirmed: false,
    sourceIds: ["c:0"],
    relations: [{ type: "negates", target: "b:0" }],
  };
  let s = { version: 1, projects: [], notes: {}, records: [base, replacement] };
  assert.equal(displacedBy(s, base).id, "c");
  assert.equal(s.records[0].change, "原始已确认正文");
  assert.equal(historicalNext(s, "p", "2026-10-02"), "继续B");
  assert.equal(historicalNext(s, "p", "2026-10-06"), "验证C");
  s.records[1].removed = true;
  assert.equal(displacedBy(s, base).id, "c");
});
test("仅有手写回顾也能确认；下一版草稿不改变已确认快照", () => {
  let s = {
    version: 1,
    projects: [],
    records: [],
    notes: { "2026-10-04": { lesson: "旧确认回顾", tomorrow: "旧下一步" } },
  };
  s = confirmDay(s, "2026-10-04");
  assert.equal(s.notes["2026-10-04"].confirmed.lesson, "旧确认回顾");
  s.notes["2026-10-04"] = {
    ...s.notes["2026-10-04"],
    lesson: "人工修改草稿",
    reviewed: false,
  };
  assert.equal(s.notes["2026-10-04"].confirmed.lesson, "旧确认回顾");
  s = confirmDay(s, "2026-10-04");
  assert.equal(s.notes["2026-10-04"].confirmed.lesson, "人工修改草稿");
});
test("一个月规划范围在月末和闰年正确截断", () => {
  assert.equal(planningLimit("2026-01-31"), "2026-02-28");
  assert.equal(planningLimit("2028-01-31"), "2028-02-29");
  assert.equal(planningLimit("2026-10-06"), "2026-11-06");
});

test("完整事项跨状态显示一项，期数、日期、项目隔离且不修改人工正文", () => {
  const state = structuredClone(sample),
    base = state.records[0];
  state.records = [
    { ...base, id: "v5a", title: "视频制作：第五期选题", kind: "决策" },
    {
      ...base,
      id: "v5b",
      title: "视频制作：文案",
      change: "第五期文案待验证",
      kind: "未验证实现",
    },
    {
      ...base,
      id: "v5c",
      title: "视频制作：配音字幕",
      change: "音频已处理",
      evidence: "第五期配音删除尾部提示",
    },
    { ...base, id: "v6", title: "视频制作：第六期选题" },
    { ...base, id: "other", project: "desk", title: "视频制作：第五期选题" },
    { ...base, id: "next", date: "2026-10-07", title: "视频制作：第五期剪辑" },
  ];
  const before = structuredClone(state);
  const groups = workGroups(state, state.records);
  assert.equal(groups.length, 4);
  assert.equal(
    groups.find(
      (g) =>
        g.title === "第5期视频制作" &&
        g.records[0].project === base.project &&
        g.records[0].date === base.date,
    ).records.length,
    3,
  );
  assert.deepEqual(state, before);
});
test("人工更正、移除及推翻后不继续显示旧整体摘要", () => {
  const state = structuredClone(sample),
    base = {
      ...state.records[0],
      work: { title: "完整制作", summary: "旧整体摘要" },
    };
  state.records = [
    { ...base, id: "a" },
    { ...base, id: "b", kind: "未验证实现" },
  ];
  assert.equal(workGroups(state, state.records)[0].summary, "旧整体摘要");
  state.records[0].humanEdited = true;
  assert.notEqual(workGroups(state, state.records)[0].summary, "旧整体摘要");
  state.records[0].humanEdited = false;
  state.records[1].removed = true;
  assert.notEqual(
    workGroups(state, visibleRecords(state))[0].summary,
    "旧整体摘要",
  );
});
test("既有确认项和新整理项使用中文或数字期数仍归在同一事项，摘要不隐去旧内容", () => {
  const state = structuredClone(sample),
    base = state.records[0];
  state.records = [
    { ...base, id: "old", title: "视频制作：第五期选题", confirmed: true },
    {
      ...base,
      id: "new",
      title: "字幕核对",
      work: { title: "第五期视频制作", summary: "只有新字幕的摘要" },
    },
  ];
  const g = workGroups(state, state.records);
  assert.equal(g.length, 1);
  assert.equal(g[0].records.length, 2);
  assert.notEqual(g[0].summary, "只有新字幕的摘要");
});
test("通用制作规范引用某一期示例不被当作那一期的制作成果", () => {
  const state = structuredClone(sample),
    base = state.records[0];
  state.records = [
    {
      ...base,
      id: "cover",
      title: "视频制作：封面清理",
      change: "第四期封面清理",
    },
    {
      ...base,
      id: "rules",
      title: "视频制作：制作规范更新",
      change: "更新通用制作规范",
      evidence: "第四期示例复查",
    },
  ];
  assert.equal(workGroups(state, state.records).length, 2);
});
test("软件、订餐功能与文章使用相同来源归组规则，正文不依赖视频识别", () => {
  for (const title of ["改善工作台使用体验", "完善预约下单", "修订第三章"]) {
    const s = structuredClone(sample),
      base = s.records[0];
    s.records = [
      { ...base, id: "plan", title: "计划", confirmed: true, sourceIds: ["a"] },
      {
        ...base,
        id: "build",
        title: "实现",
        kind: "未验证实现",
        sourceIds: ["b"],
      },
    ];
    s.workAssignments = {
      plan: { title, summary: "整体结果", sources: ["a", "b"], job: "j" },
      build: { title, summary: "整体结果", sources: ["a", "b"], job: "j" },
    };
    const before = structuredClone(s);
    let groups = workGroups(s, s.records);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].title, title);
    assert.equal(groups[0].summary, "整体结果");
    assert.deepEqual(s, before);
    s.records[1].removed = true;
    assert.notEqual(workGroups(s, visibleRecords(s))[0].summary, "整体结果");
  }
});
test("归组摘要已包含更正来源可以显示，后来未涵盖的推翻使摘要失效", () => {
  const s = structuredClone(sample),
    base = s.records[0];
  s.records = [
    { ...base, id: "a", sourceIds: ["a"], confirmed: true },
    {
      ...base,
      id: "b",
      sourceIds: ["b"],
      confirmed: true,
      relations: [{ type: "supersedes", target: "a" }],
    },
  ];
  const work = {
    title: "功能修订",
    summary: "改用新方案",
    sources: ["a", "b"],
    job: "j",
  };
  s.workAssignments = { a: work, b: work };
  assert.equal(workGroups(s, s.records)[0].summary, "改用新方案");
  s.records.push({
    ...base,
    id: "c",
    sourceIds: ["c"],
    confirmed: true,
    relations: [{ type: "supersedes", target: "b" }],
  });
  assert.notEqual(
    workGroups(
      s,
      s.records.filter((r) => r.id !== "c"),
    )[0].summary,
    "改用新方案",
  );
});
test("当前进展排除归并旧稿；移除更正不复活旧结论和下一步，历史日期不受未来更正影响", () => {
  const base = {
    date: "2026-10-06",
    project: "p",
    title: "旧方案",
    change: "旧方案",
    next: "继续旧方案",
    kind: "决策",
    manual: false,
    confirmed: false,
    sourceIds: ["old:0"],
  };
  const state = {
    version: 1,
    projects: [],
    notes: {},
    records: [
      { ...base, id: "old" },
      {
        ...base,
        id: "archived",
        sourceIds: ["archived:0"],
        supersededDraftBy: "job",
      },
      {
        ...base,
        id: "correction",
        date: "2026-10-07",
        removed: true,
        sourceIds: ["new:0"],
        relations: [{ type: "negates", target: "old:0" }],
      },
    ],
  };
  assert.deepEqual(currentProjectRecords(state, "p"), []);
  assert.deepEqual(
    currentProjectRecords(state, "p", "2026-10-06").map((r) => r.id),
    ["old"],
  );
  assert(!historicalNext(state, "p", "2026-10-07").includes("继续旧方案"));
  assert.equal(historicalNext(state, "p", "2026-10-06"), "继续旧方案");
});
