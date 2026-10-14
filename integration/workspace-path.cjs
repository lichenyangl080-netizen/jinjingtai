const path = require("node:path");

// Legacy stage JSON lost the slash from drive roots. Repair only this exact
// historical shape; ordinary drive-relative paths remain invalid.
function absolute(value) {
  if (typeof value !== "string" || !value)
    throw Error("INVALID_WORKSPACE_PATH");
  const restored = /^[a-z]:$/i.test(value) ? value + "\\" : value;
  if (!path.isAbsolute(restored)) throw Error("INVALID_WORKSPACE_PATH");
  return path.normalize(restored);
}
function normalized(value) {
  const full = absolute(value);
  const root = path.parse(full).root;
  return (
    full.toLowerCase() === root.toLowerCase()
      ? root
      : full.replace(/[\\/]+$/, "")
  ).toLowerCase();
}
function contains(value, root) {
  const current = normalized(value),
    base = normalized(root);
  return (
    current === base ||
    current.startsWith(base.endsWith(path.sep) ? base : base + path.sep)
  );
}
function identity(value) {
  const key = normalized(value);
  // Keep existing root project IDs and grouping identities stable.
  return /^[a-z]:\\$/i.test(key) ? key.slice(0, 2) : key;
}
function rootWorkspace(value) {
  const key = normalized(value);
  return key === path.parse(key).root.toLowerCase();
}
module.exports = { absolute, normalized, contains, identity, rootWorkspace };
