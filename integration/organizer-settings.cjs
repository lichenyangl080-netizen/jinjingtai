// Only the explicit daily organizer uses these settings; normal Codex chats do not.
const models = ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"];
const efforts = ["low", "medium", "high", "xhigh", "max"];
const defaults = { organizerModel: "gpt-6.1-sol", organizerEffort: "medium" };
function valid(value) {
  return (
    models.includes(value.organizerModel) &&
    (efforts.includes(value.organizerEffort) ||
      (value.organizerModel === "gpt-6-luna" &&
        value.organizerEffort === "none"))
  );
}
function resolve(value) {
  const settings = {
    organizerModel: value.organizerModel ?? defaults.organizerModel,
    organizerEffort: value.organizerEffort ?? defaults.organizerEffort,
  };
  if (!valid(settings)) throw Error("INVALID_ORGANIZER_SETTINGS");
  return settings;
}
module.exports = { models, efforts, defaults, valid, resolve };
