const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const xlsx = require('xlsx');
const axios = require('axios');
const venom = require('venom-bot');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const trial = require('./trial');
const ConnectionHelper = require('./utils/connection-helper');

let mainWindow;
let venomClients = {}; // { sessionName: venomClient }
let cyclicAltIntervalIds = {}; // { sessionName: intervalId }
let cyclicAltStates = {}; // { sessionName: { idxA, idxB } }
let trialStatus = { isValid: true, isTrial: false, daysLeft: -1 };
// Carregar configurações
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (error) {
  console.error('Erro ao carregar config.json, usando configurações padrão:', error);
  config = {
    network: { timeout: 8000, maxRetries: 3, retryDelay: 5000, connectionTimeout: 30000, requestTimeout: 15000 },
    whatsapp: { headless: true, useChrome: false, debug: false, logQR: false, multidevice: true },
    quota: { dailyLimit: 200 }
  };
}

// ===== LIMITE DE DISPAROS POR DIA =====
const QUOTA_LIMIT_PER_DAY = config.quota.dailyLimit;
const quotaPath = path.join(app.getPath('userData'), 'quota.json');

// ===== CONFIGURAÇÕES DE CONECTIVIDADE =====
const CONNECTION_TIMEOUT = config.network.connectionTimeout;
const REQUEST_TIMEOUT = config.network.requestTimeout;

// Inicializar ConnectionHelper
const connectionHelper = new ConnectionHelper(config);

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readQuota() {
  try {
    if (fs.existsSync(quotaPath)) {
      return JSON.parse(fs.readFileSync(quotaPath, 'utf8'));
    }
  } catch (_) {}
  return { date: getTodayKey(), count: 0 };
}

function writeQuota(quota) {
  try {
    fs.writeFileSync(quotaPath, JSON.stringify(quota));
  } catch (_) {}
}

function ensureDailyQuota() {
  // Sem limite na versão completa
  if (!trialStatus?.isTrial) {
    return { ok: true, remaining: Infinity };
  }
  const today = getTodayKey();
  const quota = readQuota();
  if (quota.date !== today) {
    quota.date = today;
    quota.count = 0;
  }
  if (quota.count >= QUOTA_LIMIT_PER_DAY) {
    return { ok: false, remaining: 0 };
  }
  quota.count += 1;
  writeQuota(quota);
  return { ok: true, remaining: Math.max(QUOTA_LIMIT_PER_DAY - quota.count, 0) };
}

async function sendTextWithQuota(client, to, text) {
  const quota = ensureDailyQuota();
  if (!quota.ok) {
    const error = new Error('Limite diário de disparos atingido (200/dia)');
    error.code = 'DAILY_LIMIT';
    throw error;
  }
  
  try {
    return await client.sendText(to, text);
  } catch (error) {
    if (error.message?.includes('ECONNRESET') || error.message?.includes('connection')) {
      console.log('Erro de conexão detectado no envio, tentando reconectar...');
      throw new Error('CONNECTION_ERROR');
    }
    throw error;
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'iconemeh.ico')
  });

  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, 'renderer', 'build', 'index.html'),
    protocol: 'file:',
    slashes: true
  });

  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Função para reconectar WhatsApp automaticamente
async function reconnectWhatsApp(sessionName) {
  return connectionHelper.retryOperation(async () => {
    connectionHelper.logConnectionStatus(sessionName, 'RECONNECTING');
    
    // Limpa cliente anterior se existir
    if (venomClients[sessionName]) {
      try {
        await venomClients[sessionName].close();
      } catch (e) {
        console.log('Erro ao fechar cliente anterior:', e.message);
      }
      delete venomClients[sessionName];
    }

    // Aguarda um pouco antes de tentar reconectar
    await connectionHelper.delay(3000);

    const client = await venom.create({
      session: sessionName,
      multidevice: config.whatsapp.multidevice,
      headless: config.whatsapp.headless,
      useChrome: config.whatsapp.useChrome,
      debug: config.whatsapp.debug,
      logQR: config.whatsapp.logQR,
      browserArgs: config.whatsapp.browserArgs || [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    client.onMessage(async (message) => {
      try {
        // Processa mensagem do assistente virtual
        const config = loadAssistantConfig();
        const response = processAssistantMessage(message.body, config);
        
        if (response) {
          // Respostas do assistente não contam na cota de disparos comerciais
          await client.sendText(message.from, response);
        }
      } catch (error) {
        console.error('Erro ao processar mensagem:', error);
      }
    });

    // Eventos de monitoramento de conexão
    client.onStateChange((state) => {
      connectionHelper.logConnectionStatus(sessionName, 'STATE_CHANGE', state);
      if (state === 'DISCONNECTED') {
        mainWindow?.webContents.send('log-message', { 
          type: 'warning', 
          message: `WhatsApp desconectado: ${sessionName}. Tentando reconectar...` 
        });
        // Tenta reconectar automaticamente
        setTimeout(() => reconnectWhatsApp(sessionName), 5000);
      }
    });

    venomClients[sessionName] = client;
    connectionHelper.resetRetryCount(sessionName);
    
    connectionHelper.logConnectionStatus(sessionName, 'RECONNECTED');
    mainWindow?.webContents.send('log-message', { 
      type: 'success', 
      message: `WhatsApp reconectado com sucesso: ${sessionName}` 
    });
    
    return client;
  }, sessionName);
}

app.whenReady().then(async () => {
  // Verificar trial antes de criar a janela
  try {
    trialStatus = await trial.checkTrial(app.getPath('userData'));
    if (!trialStatus.isValid) {
      dialog.showErrorBox('Trial Expirado', trialStatus.reason || 'Período de avaliação encerrado.');
      app.quit();
      return;
    }
  } catch (error) {
    console.error('Erro ao verificar trial:', error);
    // Em caso de erro de conexão, permite continuar
    if (error.message?.includes('ECONNRESET')) {
      console.log('Erro de conexão no trial, continuando...');
    } else {
      dialog.showErrorBox('Erro de Sistema', 'Erro ao verificar licença. Tente novamente.');
      app.quit();
      return;
    }
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('get-trial-info', async () => {
  return trialStatus;
});

ipcMain.handle('connect-whatsapp', async (event, sessionName) => {
  try {
    if (venomClients[sessionName]) {
      return { success: true, message: 'Sessão já conectada' };
    }

    const client = await venom.create({
      session: sessionName,
      multidevice: config.whatsapp.multidevice,
      headless: config.whatsapp.headless,
      useChrome: config.whatsapp.useChrome,
      debug: config.whatsapp.debug,
      logQR: config.whatsapp.logQR,
      browserArgs: config.whatsapp.browserArgs || [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    client.onMessage(async (message) => {
      try {
        // Processa mensagem do assistente virtual
        const config = loadAssistantConfig();
        const response = processAssistantMessage(message.body, config);
        
        if (response) {
          // Respostas do assistente não contam na cota de disparos comerciais
          await client.sendText(message.from, response);
        }
      } catch (error) {
        console.error('Erro ao processar mensagem:', error);
      }
    });

    // Eventos de monitoramento de conexão
    client.onStateChange((state) => {
      console.log(`Estado da conexão ${sessionName}:`, state);
      if (state === 'DISCONNECTED') {
        mainWindow?.webContents.send('log-message', { 
          type: 'warning', 
          message: `WhatsApp desconectado: ${sessionName}. Tentando reconectar...` 
        });
        // Tenta reconectar automaticamente
        setTimeout(() => reconnectWhatsApp(sessionName), 5000);
      }
    });

    venomClients[sessionName] = client;
    connectionRetryCounts[sessionName] = 0;
    mainWindow?.webContents.send('log-message', { type: 'success', message: `WhatsApp conectado: ${sessionName}` });
    return { success: true };
  } catch (error) {
    console.error('Erro ao conectar WhatsApp:', error);
    
    // Se for erro de conexão, tenta reconectar
    if (error.message?.includes('ECONNRESET') || error.message?.includes('connection')) {
      mainWindow?.webContents.send('log-message', { 
        type: 'warning', 
        message: `Erro de conexão detectado. Tentando reconectar automaticamente...` 
      });
      
      try {
        await reconnectWhatsApp(sessionName);
        return { success: true, message: 'Reconectado automaticamente' };
      } catch (reconnectError) {
        mainWindow?.webContents.send('log-message', { 
          type: 'error', 
          message: `Falha na reconexão automática: ${reconnectError.message}` 
        });
      }
    }
    
    mainWindow?.webContents.send('log-message', { type: 'error', message: `Erro ao conectar WhatsApp: ${error.message}` });
    throw error;
  }
});

ipcMain.handle('disconnect-whatsapp', async (event, sessionName) => {
  try {
    if (venomClients[sessionName]) {
      await venomClients[sessionName].close();
      delete venomClients[sessionName];
      connectionHelper.resetRetryCount(sessionName);
      connectionHelper.logConnectionStatus(sessionName, 'DISCONNECTED');
      mainWindow?.webContents.send('log-message', { type: 'info', message: `WhatsApp desconectado: ${sessionName}` });
    }
  } catch (error) {
    console.error('Erro ao desconectar:', error);
  }
});

ipcMain.handle('start-cyclic-whatsapp', async (event, options) => {
  const { sessionName, numeros, mensagem, intervalo } = options;
  
  if (!venomClients[sessionName]) {
    throw new Error('WhatsApp não conectado');
  }

  const client = venomClients[sessionName];
  let currentIndex = 0;

  const sendCyclicMessage = async () => {
    try {
      if (currentIndex >= numeros.length) {
        currentIndex = 0; // Reinicia o ciclo
      }
      
      const numero = numeros[currentIndex];
      await sendTextWithQuota(client, `${numero}@c.us`, mensagem);
      mainWindow?.webContents.send('log-message', { 
        type: 'info', 
        message: `Mensagem principal enviada para ${numero} (${currentIndex + 1}/${numeros.length})` 
      });
      
      currentIndex++;
    } catch (e) {
      if (e?.code === 'DAILY_LIMIT') {
        if (cyclicAltIntervalIds[sessionName]) {
          clearInterval(cyclicAltIntervalIds[sessionName]);
          delete cyclicAltIntervalIds[sessionName];
        }
        mainWindow?.webContents.send('log-message', { type: 'error', message: `Disparo cíclico parado: limite diário atingido.` });
        return;
      }
      
      // Se for erro de conexão, tenta reconectar
      if (e.message === 'CONNECTION_ERROR') {
        mainWindow?.webContents.send('log-message', { 
          type: 'warning', 
          message: `Erro de conexão detectado. Tentando reconectar...` 
        });
        
        try {
          await reconnectWhatsApp(sessionName);
          // Continua o ciclo após reconectar
          setTimeout(sendCyclicMessage, 2000);
        } catch (reconnectError) {
          mainWindow?.webContents.send('log-message', { 
            type: 'error', 
            message: `Falha na reconexão. Parando ciclo.` 
          });
          if (cyclicAltIntervalIds[sessionName]) {
            clearInterval(cyclicAltIntervalIds[sessionName]);
            delete cyclicAltIntervalIds[sessionName];
          }
        }
        return;
      }
      
      mainWindow?.webContents.send('log-message', { type: 'error', message: `Erro no disparo cíclico: ${e.message}` });
    }
  };

  // Envia primeira mensagem imediatamente
  await sendCyclicMessage();
  
  // Configura intervalo
  const intervalMs = intervalo * 60 * 1000; // Converte minutos para ms
  cyclicAltIntervalIds[sessionName] = setInterval(sendCyclicMessage, intervalMs);
  
  mainWindow?.webContents.send('log-message', { type: 'success', message: `Disparo cíclico iniciado: ${intervalo} min` });
});

ipcMain.handle('stop-cyclic-whatsapp', async (event, sessionName) => {
  if (cyclicAltIntervalIds[sessionName]) {
    clearInterval(cyclicAltIntervalIds[sessionName]);
    delete cyclicAltIntervalIds[sessionName];
    mainWindow?.webContents.send('log-message', { type: 'info', message: 'Disparo cíclico parado' });
  }
});

// Funções auxiliares
function loadAssistantConfig() {
  try {
    const configPath = path.join(__dirname, 'config', 'assistente.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.error('Erro ao carregar configuração do assistente:', error);
  }
  return { rules: [], autoResponse: '' };
}

function processAssistantMessage(message, config) {
  // Implementação do assistente virtual
  const { rules, autoResponse } = config;
  
  // Verifica regras
  for (const rule of rules) {
    if (message.toLowerCase().includes(rule.keyword.toLowerCase())) {
      return rule.response;
    }
  }
  
  // Retorna resposta automática se configurada
  return autoResponse || null;
}