function classify(spawnError, stderr) {
  if (spawnError) return "CODEX_START_FAILED";
  if (
    /model.*(?:not available|not supported|does not exist|not found)|(?:do not have|don't have|no) access.*model|unsupported.*model|reasoning.*(?:not supported|invalid|unsupported)/i.test(
      stderr,
    )
  )
    return "CODEX_MODEL_UNAVAILABLE";
  if (
    /filesystem path|invalid (?:config|configuration)|failed to (?:parse|load).*config|must be absolute/i.test(
      stderr,
    )
  )
    return "CODEX_CONFIGURATION_ERROR";
  if (
    /401\b|unauthorized|not logged in|login required|authentication failed/i.test(
      stderr,
    )
  )
    return "CODEX_AUTH_REQUIRED";
  if (
    /request timed out|request timeout|ETIMEDOUT|network error|connection refused|dns|failed to send request|stream disconnected|connect error/i.test(
      stderr,
    )
  )
    return "CODEX_NETWORK_ERROR";
  return "CODEX_UNAVAILABLE";
}
module.exports = { classify };
