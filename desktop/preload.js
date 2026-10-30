const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("po", { send: (pw) => ipcRenderer.send("pw", pw) });
