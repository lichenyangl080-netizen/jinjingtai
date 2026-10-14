const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fixture = JSON.parse(
  execFileSync(
    process.execPath,
    [path.join(__dirname, "setup-daily-home-qa.cjs"), "renderer-boundaries"],
    { encoding: "utf8" },
  ),
);
process.env.JINJINGTAI_HOME = fixture.home;
const S = require("../integration/store.cjs");
const loaded = S.personal(),
  store = loaded.store;
store.records.push({
  id: "ux-single",
  date: S.day(),
  project: "p",
  title: "独立事项验收",
  change: "隔离测试正文",
  next: "",
  kind: "已验证成果",
  manual: true,
  confirmed: false,
});
store.records.push({
  id: "ux-september",
  date: S.day().slice(0, 4) + "-09-01",
  project: "p",
  title: "九月验收事项",
  change: "隔离测试正文",
  next: "",
  kind: "已验证成果",
  manual: true,
  confirmed: false,
});
store.notes[S.day()] = {
  lesson: "异常必须明确显示。完整心得继续保留。",
  tomorrow: "",
};
S.savePersonal(store, loaded.revision, loaded.libraryId);
console.log(JSON.stringify(fixture));
