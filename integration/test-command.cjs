// Only direct, recognized test invocations can grant test evidence. Shell
// expressions and wrappers stay unverified rather than guessing their meaning.
function testInvocation(command) {
  if (typeof command !== "string") return null;
  const text = command.trim().replace(/^&\s+(?=["'])/, "");
  if (!text || /[;|&<>`$\r\n]/.test(text)) return null;
  const tokens = text.match(/"[^"]*"|'[^']*'|[^\s"']+/g) || [];
  if (tokens.join(" ") !== text.replace(/\s+/g, " ")) return null;
  const args = tokens.map((t) => t.replace(/^(["'])(.*)\1$/, "$2"));
  if (
    args.some((a) =>
      /^(--help|--version|--dry-run|--if-present|-h|-v)(?:=|$)/.test(a),
    )
  )
    return null;
  const executable = args
    .shift()
    ?.replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.(exe|cmd)$/i, "")
    .toLowerCase();
  if (executable === "npm")
    return args[0] === "test" ||
      (args[0] === "run" && /^(test|check)$/.test(args[1] || ""))
      ? ["npm", ...args].join(" ")
      : null;
  if (executable === "pytest")
    return !args.some((a) => /^--collect-only(?:=|$)/.test(a))
      ? ["pytest", ...args].join(" ")
      : null;
  if (/^python(?:3(?:\.\d+)?)?$/.test(executable || ""))
    return args[0] === "-m" &&
      args[1] === "pytest" &&
      !args.some((a) => /^--collect-only(?:=|$)/.test(a))
      ? ["pytest", ...args.slice(2)].join(" ")
      : null;
  if (executable !== "node") return null;
  if (
    /^(npm-cli\.js|npm-cli\.cjs)$/.test(
      (args[0] || "").replace(/\\/g, "/").split("/").pop(),
    )
  )
    return args[1] === "test" ||
      (args[1] === "run" && /^(test|check)$/.test(args[2] || ""))
      ? ["npm", ...args.slice(1)].join(" ")
      : null;
  const index = args.indexOf("--test");
  return index >= 0 &&
    args
      .slice(0, index)
      .every((a) => ["--no-warnings", "--experimental-sqlite"].includes(a)) &&
    !args.some((a) =>
      /^(?:-e|-p|--eval|--print|--help|--version)(?:=|$)/.test(a),
    )
    ? ["node", ...args.slice(index)].join(" ")
    : null;
}
function isTestCommand(command) {
  return testInvocation(command) !== null;
}
module.exports = { isTestCommand, testInvocation };
