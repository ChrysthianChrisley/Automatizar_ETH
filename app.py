"""
Servidor Flask - Binance Terminal & API de Automação ETH & BTC
Renderiza o dashboard e fornece rotas REST para cotações, dados históricos e exportações.
"""

import io
import os
import csv
import time
from flask import Flask, render_template, jsonify, request, Response
from binance_client import BinanceClient
from indicators import calculate_ema, calculate_rsi, calculate_bollinger_bands

app = Flask(__name__)

# Configurações para desenvolvimento e tempo real
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
SERVER_START_TIME = time.time()

client = BinanceClient()

@app.route("/")
def index():
    """Renderiza a página principal do terminal."""
    return render_template("index.html")

@app.route("/dev/version")
def dev_version():
    """Retorna o timestamp de inicialização do servidor para LiveReload automático no navegador."""
    return jsonify({"server_start_time": SERVER_START_TIME})

@app.route("/api/health")
def health():
    """Health check do servidor Flask."""
    return jsonify({"status": "online", "service": "Flask Binance Market Terminal"})

@app.route("/api/price/<symbol>")
def get_price(symbol):
    """Retorna o preço mais recente do par."""
    try:
        data = client.get_price(symbol.upper())
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/ticker/<symbol>")
def get_ticker_24h(symbol):
    """Retorna estatísticas de 24 horas (máxima, mínima, variação, volume)."""
    try:
        data = client.get_24hr_ticker(symbol.upper())
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/klines/<symbol>")
def get_klines(symbol):
    """
    Retorna candles históricos.
    Parâmetros na query string: interval (ex: 15m), limit (ex: 500).
    """
    interval = request.args.get("interval", "15m")
    limit = int(request.args.get("limit", 500))
    try:
        candles = client.get_historical_klines(symbol.upper(), interval=interval, limit=limit)
        return jsonify({
            "symbol": symbol.upper(),
            "interval": interval,
            "count": len(candles),
            "candles": candles
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/depth/<symbol>")
def get_depth(symbol):
    """Retorna o livro de ofertas (Order Book)."""
    limit = int(request.args.get("limit", 20))
    try:
        data = client.get_order_book(symbol.upper(), limit=limit)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/trades/<symbol>")
def get_trades(symbol):
    """Retorna trades recentes do par."""
    limit = int(request.args.get("limit", 30))
    try:
        trades = client.get_recent_trades(symbol.upper(), limit=limit)
        return jsonify(trades)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/indicators/<symbol>")
def get_indicators(symbol):
    """Calcula indicadores técnicos (EMA, RSI, Bollinger) no backend."""
    interval = request.args.get("interval", "15m")
    limit = int(request.args.get("limit", 100))
    try:
        candles = client.get_historical_klines(symbol.upper(), interval=interval, limit=limit)
        closes = [c["close"] for c in candles]
        
        ema_20 = calculate_ema(closes, 20)
        ema_50 = calculate_ema(closes, 50)
        rsi_14 = calculate_rsi(closes, 14)
        bollinger = calculate_bollinger_bands(closes, 20)

        last_close = closes[-1] if closes else 0
        last_ema_20 = ema_20[-1] if ema_20 else None
        last_ema_50 = ema_50[-1] if ema_50 else None
        last_rsi = rsi_14[-1] if rsi_14 else None

        trend = "indefinido"
        if last_ema_50 is not None:
            trend = "alta" if last_close > last_ema_50 else "baixa"

        return jsonify({
            "symbol": symbol.upper(),
            "interval": interval,
            "last_price": last_close,
            "rsi_14": round(last_rsi, 2) if last_rsi else None,
            "ema_20": round(last_ema_20, 2) if last_ema_20 else None,
            "ema_50": round(last_ema_50, 2) if last_ema_50 else None,
            "trend": trend,
            "bollinger_upper": round(bollinger["upper"][-1], 2) if bollinger["upper"][-1] else None,
            "bollinger_lower": round(bollinger["lower"][-1], 2) if bollinger["lower"][-1] else None,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/export/<symbol>")
def export_csv(symbol):
    """Exporta candles históricos diretamente como arquivo CSV para download."""
    interval = request.args.get("interval", "1h")
    count = int(request.args.get("count", 500))
    try:
        candles = client.get_historical_klines(symbol.upper(), interval=interval, limit=count)
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["timestamp_ms", "datetime_utc", "open", "high", "low", "close", "volume", "quote_volume", "trades"])

        for c in candles:
            writer.writerow([
                c["timestamp"],
                c["datetime_utc"],
                c["open"],
                c["high"],
                c["low"],
                c["close"],
                c["volume"],
                c["quote_asset_volume"],
                c["number_of_trades"]
            ])

        output.seek(0)
        filename = f"{symbol.upper()}_{interval}_{count}candles.csv"
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    print("\n" + "="*60)
    print(" [>] Servidor Flask Binance Terminal Iniciado!")
    print(" [*] Acesse no seu navegador: http://127.0.0.1:5000")
    print(" [*] LiveReload Ativo: alteracoes em codigo ou telas recarregam em tempo real!")
    print("="*60 + "\n")

    # Monitorar alterações em templates HTML, CSS e JS para recarregamento instantâneo
    extra_files = []
    for folder in ["templates", "static"]:
        if os.path.exists(folder):
            for root, dirs, files in os.walk(folder):
                for f in files:
                    extra_files.append(os.path.join(root, f))

    app.run(host="127.0.0.1", port=5000, debug=True, extra_files=extra_files)
