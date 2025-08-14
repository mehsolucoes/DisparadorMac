const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ConnectionHelper {
  constructor(config) {
    this.config = config;
    this.retryCounts = new Map();
    this.maxRetries = config.network.maxRetries || 3;
    this.retryDelay = config.network.retryDelay || 5000;
    this.timeout = config.network.timeout || 8000;
    
    // Configurar axios com interceptors
    this.axiosInstance = axios.create({
      timeout: this.timeout,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      }
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // Interceptor para retry automático
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (this.isConnectionError(error)) {
          console.log(`Erro de conexão detectado: ${error.code}, tentando reconectar...`);
          await this.delay(2000);
        }
        throw error;
      }
    );
  }

  isConnectionError(error) {
    return error.code === 'ECONNRESET' || 
           error.code === 'ECONNREFUSED' || 
           error.code === 'ETIMEDOUT' ||
           error.message?.includes('ECONNRESET') ||
           error.message?.includes('connection') ||
           error.message?.includes('timeout');
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async retryOperation(operation, sessionName = 'default') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (!this.isConnectionError(error)) {
          throw error; // Se não for erro de conexão, não tenta novamente
        }

        console.log(`Tentativa ${attempt}/${this.maxRetries} falhou para ${sessionName}: ${error.message}`);
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * attempt; // Delay progressivo
          console.log(`Aguardando ${delay}ms antes da próxima tentativa...`);
          await this.delay(delay);
        }
      }
    }
    
    throw new Error(`Falha após ${this.maxRetries} tentativas: ${lastError.message}`);
  }

  async makeRequest(url, options = {}) {
    return this.retryOperation(async () => {
      return await this.axiosInstance.request({
        url,
        ...options
      });
    });
  }

  async checkConnectivity() {
    const testUrls = [
      'https://www.google.com',
      'https://httpbin.org/status/200',
      'https://api.github.com'
    ];

    for (const url of testUrls) {
      try {
        await this.makeRequest(url, { method: 'HEAD', timeout: 5000 });
        console.log(`Conectividade OK: ${url}`);
        return true;
      } catch (error) {
        console.log(`Falha na conectividade: ${url} - ${error.message}`);
      }
    }
    
    return false;
  }

  async getNetworkTime() {
    const timeSources = [
      {
        name: 'Google',
        url: 'https://www.google.com',
        extract: (response) => new Date(response.headers.date)
      },
      {
        name: 'WorldTimeAPI',
        url: 'https://worldtimeapi.org/api/ip',
        extract: (response) => new Date(response.data.utc_datetime)
      },
      {
        name: 'HTTPBin',
        url: 'https://httpbin.org/headers',
        extract: (response) => new Date(response.headers.date)
      }
    ];

    for (const source of timeSources) {
      try {
        const response = await this.makeRequest(source.url, { timeout: 5000 });
        const time = source.extract(response);
        if (time && !isNaN(time.getTime())) {
          console.log(`Tempo obtido de ${source.name}: ${time.toISOString()}`);
          return time;
        }
      } catch (error) {
        console.log(`Falha ao obter tempo de ${source.name}: ${error.message}`);
      }
    }

    console.log('Usando tempo local como fallback');
    return new Date();
  }

  logConnectionStatus(sessionName, status, details = '') {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      sessionName,
      status,
      details
    };

    console.log(`[${timestamp}] ${sessionName}: ${status} ${details}`.trim());
    
    // Salvar log em arquivo se configurado
    if (this.config.logging?.enableFile) {
      try {
        const logPath = path.join(process.cwd(), 'logs', 'connection.log');
        const logDir = path.dirname(logPath);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
      } catch (error) {
        console.error('Erro ao salvar log:', error.message);
      }
    }
  }

  resetRetryCount(sessionName) {
    this.retryCounts.delete(sessionName);
  }

  getRetryCount(sessionName) {
    return this.retryCounts.get(sessionName) || 0;
  }

  incrementRetryCount(sessionName) {
    const count = this.getRetryCount(sessionName) + 1;
    this.retryCounts.set(sessionName, count);
    return count;
  }
}

module.exports = ConnectionHelper;
