const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Dependência opcional (somente Windows)
let WinReg;
try {
  if (process.platform === 'win32') {
    WinReg = require('winreg');
  }
} catch (_) {
  WinReg = null;
}

const TRIAL_DAYS = 5; // Dias de avaliação
const APP_VENDOR = 'MH Solucoes';
const APP_NAME = 'Disparador MEH';
const REGISTRY_KEY = `Software\\${APP_VENDOR}\\${APP_NAME}`; // HKCU

// SEGREDO embutido (não absoluto contra engenharia reversa, mas dificulta edição manual)
const SECRET_KEY = 'mh@2025#disparador!trial_v1';

// Configurações de timeout e retry para conexões
const NETWORK_TIMEOUT = 8000; // 8 segundos
const MAX_RETRIES = 2;

function getMachineFingerprint() {
  try {
    const platform = os.platform();
    const arch = os.arch();
    const hostname = os.hostname();
    const cpus = os.cpus() || [];
    const totalMem = os.totalmem();
    const nics = os.networkInterfaces();
    const macs = Object.values(nics)
      .flat()
      .filter(Boolean)
      .map((ni) => ni.mac)
      .filter((mac) => mac && mac !== '00:00:00:00:00:00')
      .join('|');

    const raw = `${platform}|${arch}|${hostname}|${cpus.length}|${totalMem}|${macs}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  } catch (e) {
    return crypto.createHash('sha256').update(os.hostname()).digest('hex');
  }
}

function deriveAesKey(machineId) {
  return crypto.createHash('sha256').update(`${SECRET_KEY}:${machineId}`).digest(); // 32 bytes
}

function encryptObject(obj, machineId) {
  const key = deriveAesKey(machineId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptObject(b64, machineId) {
  try {
    const data = Buffer.from(b64, 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const enc = data.subarray(28);
    const key = deriveAesKey(machineId);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch (e) {
    return null;
  }
}

// Locais redundantes (adaptados para multiplataforma)
function getStorageLocations(userDataDir) {
  const locations = [];

  // 1) AppData (userData do Electron)
  if (userDataDir) {
    locations.push({
      type: 'file',
      path: path.join(userDataDir, '.trial_mh.dat')
    });
  }

  // 2) ProgramData (Windows) ou equivalentes em outros SOs
  if (process.platform === 'win32') {
    const programData = process.env.PROGRAMDATA;
    if (programData) {
      const dir = path.join(programData, 'MH_Solucoes', 'DisparadorMEH');
      locations.push({ type: 'file', path: path.join(dir, 'trial.dat'), dir });
    }
  } else if (process.platform === 'darwin') {
    // macOS: /Library/Application Support
    const appSupport = '/Library/Application Support';
    const dir = path.join(appSupport, 'MH_Solucoes', 'DisparadorMEH');
    locations.push({ type: 'file', path: path.join(dir, 'trial.dat'), dir });
  } else if (process.platform === 'linux') {
    // Linux: /var/lib
    const varLib = '/var/lib';
    const dir = path.join(varLib, 'mh-solucoes', 'disparador-meh');
    locations.push({ type: 'file', path: path.join(dir, 'trial.dat'), dir });
  }

  // 3) Registry (Windows)
  if (process.platform === 'win32' && WinReg) {
    locations.push({ type: 'registry' });
  }

  return locations;
}

function ensureDirExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (_) {}
}

function readAllStores(userDataDir) {
  const machineId = getMachineFingerprint();
  const locations = getStorageLocations(userDataDir);
  const records = [];

  for (const loc of locations) {
    if (loc.type === 'file') {
      try {
        if (fs.existsSync(loc.path)) {
          const b64 = fs.readFileSync(loc.path, 'utf8');
          const obj = decryptObject(b64, machineId);
          if (obj && obj.machineId === machineId) {
            records.push({ source: 'file', data: obj });
          }
        }
      } catch (_) {}
    }
  }

  return { machineId, locations, records };
}

async function writeRegistryRecord(b64) {
  if (!WinReg) return;
  
  return new Promise((resolve, reject) => {
    const key = new WinReg({
      hive: WinReg.HKCU,
      key: REGISTRY_KEY
    });
    
    key.set('TrialData', WinReg.REG_SZ, b64, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function readRegistryRecord() {
  if (!WinReg) return null;
  
  return new Promise((resolve) => {
    const key = new WinReg({
      hive: WinReg.HKCU,
      key: REGISTRY_KEY
    });
    
    key.get('TrialData', (err, item) => {
      if (err || !item) resolve(null);
      else resolve(item.value);
    });
  });
}

async function persistToAllStores(state, userDataDir) {
  const { machineId, locations } = state;
  const b64 = encryptObject(state.payload, machineId);

  for (const loc of locations) {
    if (loc.type === 'file') {
      try {
        if (loc.dir) ensureDirExists(loc.dir);
        fs.writeFileSync(loc.path, b64, 'utf8');
      } catch (_) {}
    } else if (loc.type === 'registry') {
      try {
        await writeRegistryRecord(b64);
      } catch (_) {}
    }
  }
}

async function loadFromAllStores(userDataDir) {
  const { machineId, locations, records } = readAllStores(userDataDir);
  let regB64 = await readRegistryRecord();
  if (regB64) {
    const obj = decryptObject(regB64, machineId);
    if (obj && obj.machineId === machineId) {
      records.push({ source: 'registry', data: obj });
    }
  }

  return { machineId, locations, records };
}

function pickEarliestRecord(records) {
  if (!records || records.length === 0) return null;
  let best = records[0].data;
  for (const r of records) {
    const dA = new Date(best.installDate).getTime();
    const dB = new Date(r.data.installDate).getTime();
    if (Number.isFinite(dB) && dB < dA) best = r.data;
  }
  return best;
}

// Função melhorada para obter tempo de rede com fallbacks robustos
async function getTrustedNetworkNow() {
  const timeSources = [
    // Fonte 1: Google (rápida)
    async () => {
      try {
        const https = require('https');
        return new Promise((resolve) => {
          const req = https.request({ 
            method: 'HEAD', 
            host: 'www.google.com', 
            path: '/',
            timeout: NETWORK_TIMEOUT
          }, (res) => {
            const dateHeader = res.headers['date'];
            if (dateHeader) {
              const date = new Date(dateHeader);
              if (!isNaN(date.getTime())) resolve(date);
              else resolve(null);
            } else resolve(null);
          });
          req.on('error', () => resolve(null));
          req.on('timeout', () => {
            req.destroy();
            resolve(null);
          });
          req.end();
        });
      } catch (_) {
        return null;
      }
    },
    
    // Fonte 2: WorldTimeAPI (backup)
    async () => {
      try {
        const axios = require('axios');
        const r = await axios.get('https://worldtimeapi.org/api/ip', { 
          timeout: NETWORK_TIMEOUT 
        });
        if (r && r.data && r.data.utc_datetime) {
          const dt = new Date(r.data.utc_datetime);
          if (!isNaN(dt.getTime())) return dt;
        }
        return null;
      } catch (_) {
        return null;
      }
    },
    
    // Fonte 3: HTTPBin (terceira opção)
    async () => {
      try {
        const axios = require('axios');
        const r = await axios.get('https://httpbin.org/headers', { 
          timeout: NETWORK_TIMEOUT 
        });
        if (r && r.headers && r.headers.date) {
          const dt = new Date(r.headers.date);
          if (!isNaN(dt.getTime())) return dt;
        }
        return null;
      } catch (_) {
        return null;
      }
    }
  ];

  // Tenta cada fonte com retry
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    for (const source of timeSources) {
      try {
        const result = await source();
        if (result) {
          console.log('Tempo de rede obtido com sucesso');
          return result;
        }
      } catch (error) {
        console.log(`Erro ao obter tempo de rede (tentativa ${attempt + 1}):`, error.message);
        // Se for erro de conexão, aguarda um pouco antes de tentar novamente
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  }

  // Se todas as fontes falharem, usa tempo local
  console.log('Usando tempo local como fallback');
  return new Date();
}

function computeDaysLeft(installDateIso, currentDate) {
  const start = new Date(installDateIso);
  const diffMs = currentDate.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(TRIAL_DAYS - days, 0);
}

async function initializeTrial(userDataDir) {
  const { machineId, locations, records } = await loadFromAllStores(userDataDir);

  let payload = pickEarliestRecord(records);
  const now = await getTrustedNetworkNow();

  if (!payload) {
    // Primeira execução: cria payload novo
    payload = {
      machineId,
      installDate: now.toISOString(),
      lastRunUtc: now.toISOString(),
      tamper: false,
      version: 'TRIAL'
    };
  } else {
    // Atualiza lastRun e valida retrocesso de relógio
    const last = new Date(payload.lastRunUtc);
    if (now.getTime() + 3 * 60 * 1000 < last.getTime()) {
      // Relógio voltou mais de 3 minutos: marca tamper
      payload.tamper = true;
    }
    payload.lastRunUtc = now.toISOString();
  }

  const state = { machineId, locations, payload };
  await persistToAllStores(state, userDataDir);

  return state;
}

async function checkTrial(userDataDir) {
  try {
    const { machineId, locations, records } = await loadFromAllStores(userDataDir);
    const now = await getTrustedNetworkNow();
    let payload = pickEarliestRecord(records);

    if (!payload) {
      // Se nada encontrado, inicializa e considera válido
      const initState = await initializeTrial(userDataDir);
      payload = initState.payload;
    }

    const daysLeft = computeDaysLeft(payload.installDate, now);
    const expired = daysLeft <= 0 || payload.tamper === true;

    // Sincroniza lastRun e persiste novamente (para registrar última execução)
    payload.lastRunUtc = now.toISOString();
    const state = { machineId, locations, payload };
    await persistToAllStores(state, userDataDir);

    return {
      isValid: !expired,
      isTrial: payload.version !== 'FULL',
      daysLeft,
      reason: expired
        ? (payload.tamper ? 'Manipulação de data detectada. Trial expirado.' : 'Período de avaliação encerrado.')
        : undefined,
      machineId,
    };
  } catch (error) {
    console.error('Erro ao verificar trial:', error);
    
    // Em caso de erro de conexão, permite continuar com trial válido
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || 
        error.message?.includes('ECONNRESET') || error.message?.includes('timeout')) {
      console.log('Erro de conexão detectado no trial, permitindo continuar...');
      return {
        isValid: true,
        isTrial: true,
        daysLeft: TRIAL_DAYS,
        reason: undefined,
        machineId: getMachineFingerprint(),
        connectionError: true
      };
    }
    
    // Para outros erros, retorna trial inválido
    return {
      isValid: false,
      isTrial: true,
      daysLeft: 0,
      reason: 'Erro ao verificar licença: ' + error.message,
      machineId: getMachineFingerprint()
    };
  }
}

module.exports = {
  TRIAL_DAYS,
  initializeTrial,
  checkTrial,
  getMachineFingerprint,
};
