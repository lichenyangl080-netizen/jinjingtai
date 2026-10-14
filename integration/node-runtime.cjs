const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
function digest(file) {
  const hash = crypto.createHash("sha256"),
    buffer = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(file, "r");
  try {
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)))
      hash.update(buffer.subarray(0, count));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function source(application, fallback) {
  for (const name of ["node.exe.br", "node.exe"]) {
    const file = path.join(application, "runtime", name);
    if (fs.existsSync(file)) return file;
  }
  return fallback;
}
function materialize(input, target) {
  if (!input || !fs.existsSync(input)) throw Error("RUNTIME_NODE_MISSING");
  let bytes;
  let expected;
  if (input.endsWith(".br")) {
    const metadata = JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(input), "node-runtime.json"),
        "utf8",
      ),
    );
    if (
      !Number.isSafeInteger(metadata.size) ||
      metadata.size < 1 ||
      metadata.size > 128 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(metadata.sha256)
    )
      throw Error("RUNTIME_NODE_INVALID");
    bytes = zlib.brotliDecompressSync(fs.readFileSync(input), {
      maxOutputLength: metadata.size,
    });
    if (
      bytes.length !== metadata.size ||
      crypto.createHash("sha256").update(bytes).digest("hex") !==
        metadata.sha256
    )
      throw Error("RUNTIME_NODE_INVALID");
    expected = metadata.sha256;
  } else {
    const fd = fs.openSync(input, "r"),
      magic = Buffer.alloc(2);
    try {
      fs.readSync(fd, magic, 0, 2, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (magic.toString() !== "MZ") throw Error("RUNTIME_NODE_INVALID");
    expected = digest(input);
  }
  if (bytes && bytes.subarray(0, 2).toString() !== "MZ")
    throw Error("RUNTIME_NODE_INVALID");
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isSymbolicLink())
      throw Error("RUNTIME_NODE_INVALID");
    if (digest(target) === expected) return target;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = target + "." + crypto.randomUUID() + ".tmp";
  try {
    if (bytes) fs.writeFileSync(temporary, bytes, { flag: "wx" });
    else fs.copyFileSync(input, temporary, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return target;
}
module.exports = { source, materialize };
