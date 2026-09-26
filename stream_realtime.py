"""
Monitoramento em Tempo Real via WebSocket da Binance
Recebe ticks de preço, trades ao vivo e fechamento de candles instantaneamente.
"""

import json
import sys
import time
from datetime import datetime

try:
    import websocket
except ImportError:
    print("[!] O pacote 'websocket-client' não foi encontrado.")
    print("    Para rodar este script, instale com: pip install websocket-client")
    print("    Ou use o dashboard interativo abrindo 'index.html' no navegador!")
    sys.exit(1)

def on_message(ws, message):
    data = json.loads(message)
    stream = data.get("stream", "")
    payload = data.get("data", {})

    # Ticker 24h
    if "@ticker" in stream:
        symbol = payload.get("s")
        price = float(payload.get("c", 0))
        change = float(payload.get("P", 0))
        high = float(payload.get("h", 0))
        low = float(payload.get("l", 0))
        print(f"[{datetime.now().strftime('%H:%M:%S')}] TICKER {symbol}: ${price:,.2f} ({change:+.2f}%) | Max: ${high:,.2f} | Min: ${low:,.2f}")

    # Trades em Tempo Real
    elif "@trade" in stream:
        symbol = payload.get("s")
        price = float(payload.get("p", 0))
        qty = float(payload.get("q", 0))
        is_buyer_maker = payload.get("m", False)
        side = "VENDA" if is_buyer_maker else "COMPRA"
        color = "\033[91m" if side == "VENDA" else "\033[92m"
        reset = "\033[0m"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] TRADE {symbol}: {color}{side} {qty:.4f} @ ${price:,.2f}{reset}")

    # Candles (Klines)
    elif "@kline" in stream:
        k = payload.get("k", {})
        symbol = payload.get("s")
        interval = k.get("i")
        close = float(k.get("c", 0))
        is_closed = k.get("x", False)
        status = "FECHADO" if is_closed else "EM ANDAMENTO"
        print(f"[{datetime.now().strftime('%H:%M:%S')}] CANDLE {symbol} ({interval}) [{status}]: Fechamento Atual: ${close:,.2f}")

def on_error(ws, error):
    print(f"[!] Erro no WebSocket: {error}")

def on_close(ws, close_status_code, close_msg):
    print("[*] Conexão WebSocket encerrada.")

def on_open(ws):
    print("[*] Conexão com Binance WebSocket estabelecida com sucesso!")
    print("[*] Pressione Ctrl+C para sair.\n")

def start_stream(symbols=("ethusdt", "btcusdt"), interval="1m"):
    streams = []
    for s in symbols:
        s_lower = s.lower()
        streams.append(f"{s_lower}@ticker")
        streams.append(f"{s_lower}@trade")
        streams.append(f"{s_lower}@kline_{interval}")

    stream_path = "/".join(streams)
    ws_url = f"wss://stream.binance.com:9443/stream?streams={stream_path}"

    print(f"Conectando a {ws_url}...")
    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    ws.run_forever()

if __name__ == "__main__":
    symbol = sys.argv[1] if len(sys.argv) > 1 else "ethusdt"
    interval = sys.argv[2] if len(sys.argv) > 2 else "1m"
    start_stream([symbol], interval)
