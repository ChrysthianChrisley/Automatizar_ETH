"""
Exportador de Dados Históricos da Binance para CSV
Permite baixar grandes volumes de dados passados de ETH e BTC com paginação automática.
"""

import csv
import sys
import time
from datetime import datetime, timezone
from binance_client import BinanceClient

def download_and_save_csv(symbol="ETHUSDT", interval="1h", total_candles=1000, output_file=None):
    client = BinanceClient()
    symbol = symbol.upper()
    
    if output_file is None:
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"{symbol}_{interval}_{total_candles}candles_{timestamp_str}.csv"

    print(f"\n[+] Iniciando download de {total_candles} candles ({interval}) para {symbol}...")
    
    all_candles = []
    end_time = None
    batch_size = 1000

    # Paginação reversa (do mais recente para o mais antigo)
    remaining = total_candles
    while remaining > 0:
        current_limit = min(remaining, batch_size)
        try:
            batch = client.get_historical_klines(
                symbol=symbol,
                interval=interval,
                limit=current_limit,
                end_time=end_time
            )
        except Exception as e:
            print(f"[!] Erro na requisição: {e}")
            break

        if not batch:
            print("[!] Não há mais dados disponíveis no histórico.")
            break

        # Inserir no início da lista para manter ordem cronológica
        all_candles = batch + all_candles
        remaining -= len(batch)

        print(f" -> Baixados {len(all_candles)}/{total_candles} candles... (Mais antigo no lote: {batch[0]['datetime_utc']})")

        # Define end_time para o próximo lote como o timestamp do primeiro candle menos 1ms
        end_time = batch[0]["timestamp"] - 1

        # Respeitar rate limits da Binance
        time.sleep(0.15)

        if len(batch) < current_limit:
            break

    # Salvar em CSV
    if not all_candles:
        print("[!] Nenhum dado foi baixado.")
        return None

    # Ordenar por timestamp crescente
    all_candles.sort(key=lambda x: x["timestamp"])

    headers = [
        "timestamp_ms", "datetime_utc", "open", "high", "low", "close",
        "volume", "quote_asset_volume", "number_of_trades"
    ]

    with open(output_file, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for c in all_candles:
            writer.writerow([
                c["timestamp"],
                c["datetime_utc"],
                c["open"],
                c["high"],
                c["low"],
                c["close"],
                c["volume"],
                c["quote_asset_volume"],
                c["number_of_trades"],
            ])

    print(f"\n[SUCESSO] {len(all_candles)} candles salvos em: {output_file}")
    return output_file

if __name__ == "__main__":
    symbol = sys.argv[1] if len(sys.argv) > 1 else "ETHUSDT"
    interval = sys.argv[2] if len(sys.argv) > 2 else "1h"
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 500

    print("==================================================")
    print("      EXPORTADOR DE DADOS HISTÓRICOS BINANCE      ")
    print("==================================================")
    print(f"Par: {symbol} | Intervalo: {interval} | Quantidade: {count}")
    
    download_and_save_csv(symbol, interval, count)
