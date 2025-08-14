# 🚀 Configuração Rápida do GitHub

## 📋 Passos para Build Automático

### 1. Criar Repositório no GitHub
1. Acesse: https://github.com/new
2. Nome: `DisparadorMac-Clean`
3. Descrição: `Disparador WhatsApp MEH com melhorias ECONNRESET`
4. Marque como **Público** (para GitHub Actions gratuito)
5. Clique em "Create repository"

### 2. Configurar Local
```bash
# Execute o script de configuração
chmod +x setup-github.sh
./setup-github.sh
```

### 3. Ou Manualmente
```bash
# Configurar remote (substitua pela sua URL)
git remote set-url origin https://github.com/SEU-USUARIO/DisparadorMac-Clean.git

# Fazer push
git push -u origin master
```

## 🎯 Resultado

Após o push, você terá:

### ✅ Build Automático
- **Trigger**: Push para main/master
- **Arquivo**: `DisparadorMEH.dmg`
- **Local**: Actions > Build macOS Executable

### ✅ Build Manual
- **Trigger**: Manual via GitHub
- **Local**: Actions > Manual Build macOS
- **Opções**: macOS, Windows, Linux

## 📦 Arquivos Incluídos

### 🔧 Melhorias ECONNRESET:
- ✅ Sistema de reconexão automática
- ✅ ConnectionHelper para gerenciar conexões
- ✅ Configurações centralizadas
- ✅ Sistema de trial robusto
- ✅ Logs detalhados

### 🍎 Build macOS:
- ✅ GitHub Actions configurado
- ✅ Script de build local
- ✅ Configurações otimizadas
- ✅ Interface moderna

## 🎉 Pronto!

Após o push, o build será executado automaticamente e você poderá baixar o executável `.dmg` para macOS!
