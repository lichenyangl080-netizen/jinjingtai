const { contextBridge, ipcRenderer } = require("electron");
const active = !process.argv.includes("--jinjingtai-prototype");
const sync = (method, ...args) => {
  const response = ipcRenderer.sendSync("jinjingtai:" + method, ...args);
  if (!response?.ok) throw Error(response?.error || "LOCAL_OPERATION_FAILED");
  return response.value;
};
contextBridge.exposeInMainWorld("jinjingtai", {
  close: () => ipcRenderer.send("jinjingtai:close-approved"),
  integration: active,
  call: sync,
  maintenance: (action) => ipcRenderer.invoke("jinjingtai:maintenance", action),
  connect: () => ipcRenderer.invoke("jinjingtai:connect"),
  checkConnection: (libraryId) =>
    ipcRenderer.invoke("jinjingtai:check-connection", libraryId),
  attachment: (libraryId) =>
    ipcRenderer.invoke("jinjingtai:attachment", libraryId),
  openAttachment: (id) => ipcRenderer.invoke("jinjingtai:open-attachment", id),
});
