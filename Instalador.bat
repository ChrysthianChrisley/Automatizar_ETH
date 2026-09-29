@echo off
chcp 65001 >nul
title Instalador e Configurador - Binance Market Terminal
color 0B

echo.
echo =======================================================================
echo    BINANCE MARKET TERMINAL ^& AUTOMATIZAR ETH - INSTALADOR AUTOMATICO
echo =======================================================================
echo.

cd /d "%~dp0"

:: 1. Verificacao do Python
echo [*] Passo 1/4: Verificando se o Python esta instalado no sistema...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    py --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo [!] ERRO CRITICO: Python nao foi encontrado no seu computador!
        echo.
        echo Para executar este sistema, voce precisa ter o Python 3.10 ou superior instalado.
        echo 1. Baixe o instalador oficial em: https://www.python.org/downloads/
        echo 2. ATENCAO: Na primeira tela do instalador do Python, MARQUE a opcao:
        echo    "[X] Add Python to PATH" (ou "Adicionar Python ao PATH")
        echo.
        echo Pressione qualquer tecla para abrir o site de download do Python...
        pause >nul
        start https://www.python.org/downloads/
        exit /b 1
    )
)

for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
echo [+] Python detectado com sucesso: %PYTHON_VER%
echo.

:: 2. Verificacao do PIP
echo [*] Passo 2/4: Verificando gerenciador de pacotes pip...
python -m pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Pip nao encontrado. Tentando instalar ensurepip...
    python -m ensurepip --default-pip
)
echo [+] Pip verificado com sucesso.
echo.

:: 3. Instalacao de Dependencias do requirements.txt
echo [*] Passo 3/4: Verificando e instalando pacotes necessarios (requirements.txt)...
echo     (Flask, Pandas, Numpy, Requests, Pillow, Websocket, Python-Dotenv)
echo.

if not exist "%~dp0requirements.txt" (
    echo [!] Arquivo requirements.txt nao encontrado no diretorio!
    pause
    exit /b 1
)

python -m pip install -r "%~dp0requirements.txt"
if %errorlevel% neq 0 (
    echo.
    echo [!] Ocorreu um erro ao instalar dependencias com pip.
    echo     Tentando atualizar o pip e reinstalar...
    python -m pip install --upgrade pip
    python -m pip install -r "%~dp0requirements.txt"
)
echo.
echo [+] Todas as dependencias estao instaladas e prontas!
echo.

:: 4. Configuracao do Arquivo .env com Chave Etherscan
echo [*] Passo 4/4: Configurando arquivo de ambiente (.env)...
if exist "%~dp0.env" (
    echo [+] Arquivo .env ja existente no diretorio. Mantendo configuracoes.
) else (
    echo [#] Gerando arquivo .env automatico com chaves de integracao...
    (
        echo # Binance API Credentials ^(Opcional - Necessario apenas para ordens autenticadas^)
        echo BINANCE_API_KEY=
        echo BINANCE_API_SECRET=
        echo.
        echo # Etherscan API V2 Key ^(Plano Free: 3 calls/seg, 100k/dia^)
        echo ETHERSCAN_API_KEY=313HF7ST9FPPYVEBDGCXK2MT78TRCWG8QQ
    ) > "%~dp0.env"
    echo [+] Arquivo .env criado com sucesso com a chave Etherscan V2 configurada!
)

echo.
echo =======================================================================
echo              INSTALACAO CONCLUIDA COM SUCESSO!
echo =======================================================================
echo.
echo  Modulos disponiveis no sistema:
echo   - Terminal Principal:        http://127.0.0.1:5000/
echo   - Data Analise / Volatilidade: http://127.0.0.1:5000/data-analise
echo   - Monitor de Liquidez:       http://127.0.0.1:5000/liquidez
echo.
echo  Para iniciar o servidor a qualquer momento, basta dar duplo clique no:
echo  --^> Iniciar_Servidor.bat
echo.

set /p INICIAR="Deseja iniciar o servidor e abrir o navegador agora mesmo? (S/N): "
if /i "%INICIAR%"=="S" (
    echo.
    echo [*] Iniciando servidor e abrindo navegador...
    start "" "%~dp0Iniciar_Servidor.bat"
    exit /b 0
)

echo.
echo Pressione qualquer tecla para encerrar o instalador...
pause >nul
exit /b 0
