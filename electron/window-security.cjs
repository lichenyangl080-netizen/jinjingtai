// Only the bundled document may use the preload bridge. The app has no browser
// navigation, embedded pages, or device-permission features.
function protectContents(contents) {
  const prevent = (event) => event.preventDefault();
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  for (const event of [
    "will-navigate",
    "will-frame-navigate",
    "will-redirect",
    "will-attach-webview",
  ])
    contents.on(event, prevent);
  contents.session.setPermissionRequestHandler(
    (_contents, _permission, reply) => reply(false),
  );
  contents.session.setPermissionCheckHandler(() => false);
}

module.exports = { protectContents };
