// Compare declared test references against actual successful command snapshots.
// A label saying "verified" alone never grants verified status.
function normalize(text) {
  return text
    .replace(/\.cmd\b/gi, "")
    .replace(/["']/g, "")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}
function supports(item, snapshots) {
  if (item.kind !== "verified") return false;
  const passed = snapshots
    .filter((s) => s.type === "test" && s.exitCode === 0)
    .map((s) => require("./test-command.cjs").testInvocation(s.command))
    .filter(Boolean);
  return (item.evidence || []).some((text) => {
    const node = /--test\s+["']?([^\s"';：]+)/.exec(text);
    if (node)
      return passed.some((command) =>
        normalize(command).includes(normalize(node[1])),
      );
    const declared =
      /\b(?:npm(?:\.cmd)?\s+(?:test|run\s+(?:test|check))|pytest(?:\s+[^\s;,：]+)?)/i.exec(
        text,
      );
    if (!declared) return false;
    const command = normalize(declared[0]);
    return passed.some((snapshot) =>
      new RegExp(
        "(?:^| )" + command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:$| )",
        "i",
      ).test(normalize(snapshot)),
    );
  });
}
module.exports = { supports };
