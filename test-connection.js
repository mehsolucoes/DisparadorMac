const ConnectionHelper = require('./utils/connection-helper');
const fs = require('fs');
const path = require('path');

// Carregar configuração
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (error) {
  console.error('Erro ao carregar config.json, usando configurações padrão');
  config = {
    network: { timeout: 8000, maxRetries: 3, retryDelay: 5000 },
    logging: { enableFile: true }
  };
}

async function testConnection() {
  console.log('=== TESTE DE CONECTIVIDADE ===');
  
  const connectionHelper = new ConnectionHelper(config);
  
  // Teste 1: Verificar conectividade
  console.log('\n1. Testando conectividade...');
  const isConnected = await connectionHelper.checkConnectivity();
  console.log(`Conectividade: ${isConnected ? 'OK' : 'FALHA'}`);
  
  // Teste 2: Obter tempo de rede
  console.log('\n2. Obtendo tempo de rede...');
  const networkTime = await connectionHelper.getNetworkTime();
  console.log(`Tempo de rede: ${networkTime.toISOString()}`);
  
  // Teste 3: Teste de retry com operação que falha
  console.log('\n3. Testando sistema de retry...');
  try {
    await connectionHelper.retryOperation(async () => {
      // Simula uma operação que falha nas primeiras tentativas
      const random = Math.random();
      if (random < 0.7) {
        throw new Error('ECONNRESET: Simulated connection error');
      }
      return 'Operação bem-sucedida';
    }, 'test-session');
    console.log('Retry funcionou corretamente');
  } catch (error) {
    console.log(`Retry falhou como esperado: ${error.message}`);
  }
  
  // Teste 4: Log de status
  console.log('\n4. Testando sistema de log...');
  connectionHelper.logConnectionStatus('test-session', 'TEST', 'Teste de log');
  
  console.log('\n=== TESTE CONCLUÍDO ===');
}

// Executar teste
testConnection().catch(console.error);
