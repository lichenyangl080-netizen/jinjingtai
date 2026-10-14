const path = require("node:path");
const S = require("./store.cjs");
const { validMetadata } = require("./metadata-schema.cjs");
// Every terminal writer rechecks the receipt under the SAME library lock used
// by apply(). Late process exits cannot replace an applied or cancelled job.
function finish(file, patch, pid) {
  const library = S.canonical(path.dirname(path.dirname(file)));
  if (path.basename(path.dirname(file)) !== "jobs")
    throw Error("INVALID_JOB_PATH");
  return S.withLibraryLock(() => {
    const current = S.read(file, null);
    if (
      !validMetadata("jobs", current, path.basename(file)) ||
      current.state !== "running" ||
      current.applied ||
      (pid !== undefined && current.pid !== pid)
    )
      return false;
    const next = { ...current, ...patch, applied: false };
    if (!validMetadata("jobs", next, path.basename(file)))
      throw Error("LOCAL_METADATA_INVALID");
    S.atomic(file, next);
    return true;
  }, library);
}
async function finishEventually(file, patch, pid) {
  for (let attempt = 0; ; attempt++) {
    try {
      return finish(file, patch, pid);
    } catch (e) {
      if (e.message !== "STORE_BUSY" || attempt >= 5) throw e;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}
module.exports = { finish, finishEventually };
