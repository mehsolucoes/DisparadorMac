#!/bin/bash

echo "🚀 Iniciando build do Disparador MEH para macOS..."

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale o Node.js primeiro."
    exit 1
fi

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm não encontrado. Instale o npm primeiro."
    exit 1
fi

echo "✅ Node.js e npm encontrados"

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

# Criar diretório renderer se não existir
if [ ! -d "renderer" ]; then
    echo "📁 Criando diretório renderer..."
    mkdir -p renderer
    echo '{"name":"renderer","version":"1.0.0","scripts":{"build":"echo build"}}' > renderer/package.json
fi

# Criar build do renderer se não existir
if [ ! -d "renderer/build" ]; then
    echo "🔨 Criando build do renderer..."
    mkdir -p renderer/build
    cat > renderer/build/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Disparador MEH</title>
    <meta charset="utf-8">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 40px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { 
            max-width: 900px; 
            width: 100%;
            background: white; 
            padding: 40px; 
            border-radius: 20px; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
        }
        h1 { 
            color: #333; 
            font-size: 2.5em;
            margin-bottom: 30px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .feature { 
            background: linear-gradient(135deg, #e8f5e8 0%, #f0f8f0 100%);
            padding: 20px; 
            margin: 15px 0; 
            border-radius: 15px; 
            border-left: 5px solid #4CAF50;
            text-align: left;
            box-shadow: 0 5px 15px rgba(0,0,0,0.05);
        }
        .status { 
            text-align: center; 
            margin: 30px 0; 
            padding: 25px; 
            background: linear-gradient(135deg, #e3f2fd 0%, #f0f8ff 100%);
            border-radius: 15px;
            border: 2px solid #2196F3;
        }
        .version {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 10px;
            margin: 20px 0;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        .emoji {
            font-size: 1.2em;
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Disparador MEH</h1>
        
        <div class="version">
            <strong>Versão:</strong> 2.0.0 | <strong>Build:</strong> $(date +%Y%m%d-%H%M%S)
        </div>
        
        <div class="status">
            <h2>🔄 Sistema de Reconexão Automática Ativo</h2>
            <p><strong>Tratamento robusto de erros ECONNRESET implementado</strong></p>
        </div>
        
        <div class="feature">
            <span class="emoji">✅</span>
            <strong>Sistema de Reconexão Automática</strong><br>
            Reconecta automaticamente quando detecta desconexão do WhatsApp
        </div>
        
        <div class="feature">
            <span class="emoji">🔧</span>
            <strong>ConnectionHelper</strong><br>
            Classe dedicada para gerenciar conexões com retry inteligente
        </div>
        
        <div class="feature">
            <span class="emoji">⚙️</span>
            <strong>Configurações Centralizadas</strong><br>
            Timeouts otimizados e parâmetros configuráveis via config.json
        </div>
        
        <div class="feature">
            <span class="emoji">🛡️</span>
            <strong>Sistema de Trial Robusto</strong><br>
            Múltiplas fontes de tempo e tratamento de erros de rede
        </div>
        
        <div class="feature">
            <span class="emoji">📊</span>
            <strong>Logging Avançado</strong><br>
            Logs detalhados de conexão e status em tempo real
        </div>
        
        <div class="feature">
            <span class="emoji">⚡</span>
            <strong>Performance Otimizada</strong><br>
            Timeouts reduzidos (8s) e sistema de retry inteligente
        </div>
    </div>
</body>
</html>
EOF
fi

# Verificar se electron-builder está instalado
if ! npm list -g electron-builder &> /dev/null; then
    echo "📦 Instalando electron-builder globalmente..."
    npm install -g electron-builder@latest
fi

# Build para macOS
echo "🍎 Iniciando build para macOS..."
npm run dist:mac

# Verificar se o build foi bem-sucedido
if [ -f "dist/DisparadorMEH.dmg" ]; then
    echo "✅ Build concluído com sucesso!"
    echo "📦 Arquivo gerado: dist/DisparadorMEH.dmg"
    echo "📏 Tamanho: $(du -h dist/DisparadorMEH.dmg | cut -f1)"
    echo ""
    echo "🎉 Para instalar:"
    echo "1. Abra o arquivo DisparadorMEH.dmg"
    echo "2. Arraste o app para a pasta Applications"
    echo "3. Execute o aplicativo"
else
    echo "❌ Erro no build. Verifique os logs acima."
    exit 1
fi
