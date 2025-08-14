#!/bin/bash

echo "🚀 Configurando GitHub para build automático do macOS..."

# Verificar se Git está instalado
if ! command -v git &> /dev/null; then
    echo "❌ Git não encontrado. Instale o Git primeiro."
    exit 1
fi

echo "✅ Git encontrado"

# Verificar se já existe repositório
if [ -d ".git" ]; then
    echo "📁 Repositório Git já existe"
else
    echo "📁 Inicializando repositório Git..."
    git init
fi

# Adicionar todos os arquivos
echo "📦 Adicionando arquivos ao Git..."
git add .

# Fazer commit
echo "💾 Fazendo commit..."
git commit -m "Add macOS build support with ECONNRESET fixes and ConnectionHelper"

# Verificar se remote já existe
if git remote get-url origin &> /dev/null; then
    echo "🌐 Remote origin já configurado"
    REMOTE_URL=$(git remote get-url origin)
    echo "URL atual: $REMOTE_URL"
else
    echo "🌐 Configurando remote origin..."
    echo "Por favor, forneça a URL do seu repositório GitHub:"
    echo "Exemplo: https://github.com/seu-usuario/DisparadorMac-Clean.git"
    read -p "URL do repositório: " REPO_URL
    
    if [ -z "$REPO_URL" ]; then
        echo "❌ URL não fornecida. Saindo..."
        exit 1
    fi
    
    git remote add origin "$REPO_URL"
    echo "✅ Remote origin configurado: $REPO_URL"
fi

# Fazer push
echo "⬆️ Fazendo push para GitHub..."
git push -u origin master

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Push realizado com sucesso!"
    echo ""
    echo "📋 Próximos passos:"
    echo "1. Acesse seu repositório no GitHub"
    echo "2. Vá para a aba 'Actions'"
    echo "3. Você verá o workflow 'Build macOS Executable'"
    echo "4. O build será executado automaticamente"
    echo "5. Baixe o arquivo .dmg dos artifacts"
    echo ""
    echo "🔧 Para build manual:"
    echo "1. Vá em Actions > Manual Build macOS"
    echo "2. Clique em 'Run workflow'"
    echo "3. Selecione 'macos'"
    echo "4. Clique em 'Run workflow'"
    echo ""
    echo "📦 Arquivo gerado: DisparadorMEH.dmg"
    echo "✅ Sistema com melhorias ECONNRESET incluído!"
else
    echo "❌ Erro no push. Verifique:"
    echo "1. Se o repositório existe no GitHub"
    echo "2. Se você tem permissão de push"
    echo "3. Se a URL está correta"
    echo ""
    echo "🔧 Para criar o repositório:"
    echo "1. Vá para https://github.com/new"
    echo "2. Crie um repositório chamado 'DisparadorMac-Clean'"
    echo "3. Execute este script novamente"
fi
