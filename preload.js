const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- WhatsApp API ---
  connectWhatsApp: (sessionName) => ipcRenderer.invoke('connect-whatsapp', sessionName),
  disconnectWhatsApp: (sessionName) => ipcRenderer.invoke('disconnect-whatsapp', sessionName),
  startCyclicWhatsApp: (options) => ipcRenderer.invoke('start-cyclic-whatsapp', options),
  stopCyclicWhatsApp: (sessionName) => ipcRenderer.invoke('stop-cyclic-whatsapp', sessionName),

  // --- E-mail API ---
  dispararEmails: (params) => ipcRenderer.invoke('disparar-emails', params),

  // --- File API ---
  importarNumerosExcel: () => ipcRenderer.invoke('importar-numeros-excel'),
  importarBaseEmails: () => ipcRenderer.invoke('importar-base-emails'),
  selecionarAnexoPdf: () => ipcRenderer.invoke('selecionar-anexo-pdf'),
  selecionarAnexoImagem: () => ipcRenderer.invoke('selecionar-anexo-imagem'),
  selecionarAnexoVideo: () => ipcRenderer.invoke('selecionar-anexo-video'),
  selecionarAnexoEmailPdf: () => ipcRenderer.invoke('selecionar-anexo-email-pdf'),
  selecionarAnexoEmailImagem: () => ipcRenderer.invoke('selecionar-anexo-email-imagem'),
  selecionarAnexoEmailVideo: () => ipcRenderer.invoke('selecionar-anexo-email-video'),

  // --- Event listeners ---
  onLogMessage: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('log-message', listener);
    return () => ipcRenderer.removeListener('log-message', listener);
  },

  onEmailLog: (callback) => {
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on('email-log', listener);
    return () => ipcRenderer.removeListener('email-log', listener);
  },

  // --- Trial API ---
  getTrialInfo: () => ipcRenderer.invoke('get-trial-info'),
});
