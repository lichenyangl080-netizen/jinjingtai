const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function isolatedQa(env, productionHome, productionProfile) {
  const home = env.JINJINGTAI_HOME;
  const profile = env.JINJINGTAI_PROFILE;
  if (
    !home ||
    !profile ||
    !path.isAbsolute(home) ||
    !path.isAbsolute(profile)
  ) {
    throw Error("QA_REQUIRES_ISOLATED_HOME_AND_PROFILE");
  }
  const resolve = (value) => {
    let ancestor = path.resolve(value);
    const suffix = [];
    while (!fs.existsSync(ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      suffix.unshift(path.basename(ancestor));
      ancestor = parent;
    }
    return path.join(fs.realpathSync.native(ancestor), ...suffix).toLowerCase();
  };
  const within = (value, root) =>
    value === root || value.startsWith(root + path.sep);
  const actual = resolve(home);
  const normal = resolve(
    productionHome || path.join(env.LOCALAPPDATA || os.homedir(), "Jinjingtai"),
  );
  if (
    within(actual, normal) ||
    within(normal, actual) ||
    within(resolve(profile), normal) ||
    (productionProfile &&
      (within(resolve(profile), resolve(productionProfile)) ||
        within(resolve(productionProfile), resolve(profile))))
  )
    throw Error("QA_PRODUCTION_DATA_FORBIDDEN");
  const configFile = path.join(home, "connection.json");
  if (fs.existsSync(configFile)) {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    if (!config.library || !within(resolve(config.library), actual))
      throw Error("QA_LIBRARY_OUTSIDE_ISOLATION");
  }
  return { home, profile };
}
module.exports = { isolatedQa };
