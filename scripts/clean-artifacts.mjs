import path from "node:path";
import { root } from "./build-manifest.mjs";
import {
  withPackageLock,
  pruneRelease,
  pruneQa,
} from "./package-retention.mjs";
const release = path.join(root, "release");
console.log(
  JSON.stringify(
    withPackageLock(release, () => ({
      release: pruneRelease(release),
      qa: pruneQa(path.join(root, "qa")),
    })),
    null,
    2,
  ),
);
