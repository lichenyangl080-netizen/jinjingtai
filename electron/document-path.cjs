const path = require("node:path");

function documentPath(appPath, isPackaged, action) {
  if (!["guide", "licenses"].includes(action)) throw Error("INVALID_DOCUMENT");
  if (isPackaged)
    return path.resolve(
      appPath,
      "..",
      "..",
      action === "guide" ? "进境台-使用说明.md" : "THIRD_PARTY_NOTICES.md",
    );
  return path.resolve(
    appPath,
    action === "guide" ? "docs/使用说明.md" : "THIRD_PARTY_NOTICES.md",
  );
}

module.exports = { documentPath };
