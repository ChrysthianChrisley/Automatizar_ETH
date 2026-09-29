@echo off
chcp 65001 >nul
title Binance Market Terminal - Servidor Flask Ativo
color 0A

cd /d "%~dp0"

echo.
echo =======================================================================
echo              INICIANDO BINANCE MARKET TERMINAL (FLASK)
echo =======================================================================
echo.
echo  [*] Verificando ambiente...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python nao encontrado no PATH do sistema.
    echo     Execute o Instalador.bat primeiro para configurar o ambiente.
    pause
    exit /b 1
)

echo  [*] Abrindo navegador em 2 segundos...
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:5000"

echo.
echo  ---------------------------------------------------------------------
echo   TERMINAL DISPONIVEL NOS ENDERECOS:
echo   - Principal (Grafico, Livro, Trades): http://127.0.0.1:5000/
echo   - Data Analise / Volatilidade:        http://127.0.0.1:5000/data-analise
echo   - Monitor de Liquidez (Sweep Hunter): http://127.0.0.1:5000/liquidez
echo  ---------------------------------------------------------------------
echo.
echo  [i] Para encerrar o servidor, feche esta janela ou pressione CTRL+C.
echo.

python app.py

if %errorlevel% neq 0 (
    echo.
    echo [!] O servidor foi encerrado com codigo de erro %errorlevel%.
    echo     Execute Instalador.bat caso precise reinstalar as dependencias.
    pause
)
