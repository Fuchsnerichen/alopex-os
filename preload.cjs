// Bridge between the ALOPEX page and the app core (main.mjs).
// The page gets exactly these functions – no Node.js, no Electron objects, no free network or file access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alopex', {
    ardent: (pathname, params) => ipcRenderer.invoke('ardent:get', String(pathname), params),
    spansh: (type, body) => ipcRenderer.invoke('spansh:search', String(type), body),
    commodityNames: () => ipcRenderer.invoke('commodities:names'),
    journal: {
        folder: () => ipcRenderer.invoke('journal:folder'),
        choose: () => ipcRenderer.invoke('journal:choose'),
        list: () => ipcRenderer.invoke('journal:list'),
        read: (name, offset) => ipcRenderer.invoke('journal:read', String(name), Number(offset))
    },
    copy: text => ipcRenderer.send('clipboard:write', String(text)),
    updates: {
        state: () => ipcRenderer.invoke('updates:state'),
        check: () => ipcRenderer.invoke('updates:check'),
        download: () => ipcRenderer.invoke('updates:download'),
        install: () => ipcRenderer.invoke('updates:install'),
        setAuto: on => ipcRenderer.invoke('updates:auto', on === true),
        // the page gets the plain state object, never the IPC event
        onChange: callback => { ipcRenderer.on('updates:changed', (event, state) => callback(state)); }
    }
});
