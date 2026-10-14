// Historical job replay is intentionally separate from the current v3 policy.
const historical = new Map([
  ["daily-compact-v1", { validate: true, work: false, replace: false }],
  ["daily-summary-v1", { validate: true, work: false, replace: true }],
  ["daily-work-v2", { validate: true, work: true, replace: true }],
]);
function flags(policy) {
  if (policy === undefined)
    return { validate: false, work: false, replace: false };
  if (policy === "daily-work-v3")
    return { validate: true, work: true, replace: false };
  if (!historical.has(policy)) throw Error("JOB_POLICY_UNSUPPORTED");
  return historical.get(policy);
}
function supported(policy) {
  return (
    policy === undefined || policy === "daily-work-v3" || historical.has(policy)
  );
}
module.exports = { flags, supported };
