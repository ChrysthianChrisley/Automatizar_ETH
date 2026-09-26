"""
Binance Spot API Client - Automatizar ETH & BTC
Suporta REST API pública da Binance sem necessidade obrigatória de chaves de API para dados de mercado.
"""

import json
import time
from datetime import datetime, timezone
import urllib.request
import urllib.parse
import urllib.error

class BinanceClient:
    """Cliente para a API Pública da Binance Spot (v3)."""
    
    BASE_URL = "https://api.binance.com"
    FALLBACK_URL = "https://data-api.binance.vision"

    def __init__(self, api_key=None, api_secret=None, base_url=None):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url or self.BASE_URL

    def _request(self, endpoint, params=None):
        """Executa uma requisição GET HTTP com tratamento de erro."""
        url = f"{self.base_url}{endpoint}"
        if params:
            query_string = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
            url = f"{url}?{query_string}"

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Automatizar_ETH/1.0",
                "Content-Type": "application/json"
            }
        )
        if self.api_key:
            req.add_header("X-MBX-APIKEY", self.api_key)

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                raw_data = response.read().decode("utf-8")
                return json.loads(raw_data)
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8")
            raise RuntimeError(f"Erro Binance HTTP {e.code}: {err_msg}")
        except urllib.error.URLError as e:
            raise RuntimeError(f"Falha de conexão com a Binance: {e.reason}")

    def ping(self):
        """Testa conectividade com a API."""
        return self._request("/api/v3/ping")

    def get_server_time(self):
        """Retorna o horário oficial dos servidores da Binance."""
        res = self._request("/api/v3/time")
        server_ms = res.get("serverTime", 0)
        dt = datetime.fromtimestamp(server_ms / 1000, tz=timezone.utc)
        return {"server_time_ms": server_ms, "datetime_utc": dt.isoformat()}

    def get_price(self, symbol="ETHUSDT"):
        """Retorna o preço mais recente de um par (ex: ETHUSDT, BTCUSDT)."""
        res = self._request("/api/v3/ticker/price", {"symbol": symbol.upper()})
        return {
            "symbol": res["symbol"],
            "price": float(res["price"])
        }

    def get_24hr_ticker(self, symbol="ETHUSDT"):
        """Retorna estatísticas completas de preço e volume das últimas 24 horas."""
        res = self._request("/api/v3/ticker/24hr", {"symbol": symbol.upper()})
        return {
            "symbol": res["symbol"],
            "last_price": float(res["lastPrice"]),
            "price_change": float(res["priceChange"]),
            "price_change_percent": float(res["priceChangePercent"]),
            "weighted_avg_price": float(res["weightedAvgPrice"]),
            "high_price_24h": float(res["highPrice"]),
            "low_price_24h": float(res["lowPrice"]),
            "volume_base": float(res["volume"]),
            "volume_quote": float(res["quoteVolume"]),
            "open_time": res["openTime"],
            "close_time": res["closeTime"],
            "count_trades": int(res["count"]),
        }

    def get_order_book(self, symbol="ETHUSDT", limit=20):
        """
        Retorna o livro de ofertas (Order Book) com bids (compras) e asks (vendas).
        Limites suportados: 5, 10, 20, 50, 100, 500, 1000.
        """
        res = self._request("/api/v3/depth", {"symbol": symbol.upper(), "limit": limit})
        bids = [{"price": float(b[0]), "qty": float(b[1])} for b in res.get("bids", [])]
        asks = [{"price": float(a[0]), "qty": float(a[1])} for a in res.get("asks", [])]
        
        spread = 0.0
        if bids and asks:
            spread = asks[0]["price"] - bids[0]["price"]

        return {
            "symbol": symbol.upper(),
            "last_update_id": res.get("lastUpdateId"),
            "best_bid": bids[0] if bids else None,
            "best_ask": asks[0] if asks else None,
            "spread": spread,
            "bids": bids,
            "asks": asks,
        }

    def get_recent_trades(self, symbol="ETHUSDT", limit=50):
        """Retorna as negociações mais recentes no mercado spot."""
        res = self._request("/api/v3/trades", {"symbol": symbol.upper(), "limit": limit})
        trades = []
        for t in res:
            trades.append({
                "id": t["id"],
                "price": float(t["price"]),
                "qty": float(t["qty"]),
                "quote_qty": float(t["quoteQty"]),
                "time": t["time"],
                "is_buyer_maker": t["isBuyerMaker"],  # True = Venda a mercado, False = Compra a mercado
            })
        return trades

    def get_historical_klines(self, symbol="ETHUSDT", interval="1h", limit=500, start_time=None, end_time=None):
        """
        Retorna dados históricos de candles (K-lines / Candlesticks).
        Intervalos válidos: 1s, 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M.
        """
        params = {
            "symbol": symbol.upper(),
            "interval": interval,
            "limit": min(limit, 1000),
            "startTime": start_time,
            "endTime": end_time
        }
        raw_klines = self._request("/api/v3/klines", params)

        candles = []
        for k in raw_klines:
            open_ms = k[0]
            candles.append({
                "timestamp": open_ms,
                "datetime_utc": datetime.fromtimestamp(open_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                "open": float(k[1]),
                "high": float(k[2]),
                "low": float(k[3]),
                "close": float(k[4]),
                "volume": float(k[5]),
                "close_time": k[6],
                "quote_asset_volume": float(k[7]),
                "number_of_trades": int(k[8]),
                "taker_buy_base_volume": float(k[9]),
                "taker_buy_quote_volume": float(k[10])
            })
        return candles

    def to_dataframe(self, candles):
        """Converte lista de candles para pandas.DataFrame (se pandas estiver instalado)."""
        try:
            import pandas as pd
            df = pd.DataFrame(candles)
            df["datetime"] = pd.to_datetime(df["timestamp"], unit="ms")
            df.set_index("datetime", inplace=True)
            return df
        except ImportError:
            raise ImportError("Pandas não está instalado. Instale com: pip install pandas")

if __name__ == "__main__":
    print("=== Testando Cliente Binance (ETH & BTC) ===")
    client = BinanceClient()

    # 1. Preços Atuais
    eth_price = client.get_price("ETHUSDT")
    btc_price = client.get_price("BTCUSDT")
    print(f"-> ETH/USDT: ${eth_price['price']:,.2f}")
    print(f"-> BTC/USDT: ${btc_price['price']:,.2f}")

    # 2. Estatísticas 24h
    eth_24h = client.get_24hr_ticker("ETHUSDT")
    print(f"-> Variação 24h ETH: {eth_24h['price_change_percent']:+.2f}% | Max: ${eth_24h['high_price_24h']} | Min: ${eth_24h['low_price_24h']}")

    # 3. Candles Históricos
    print("-> Buscando últimos 5 candles de 1 hora para ETH/USDT...")
    candles = client.get_historical_klines("ETHUSDT", interval="1h", limit=5)
    for c in candles:
        print(f"   [{c['datetime_utc']}] Open: ${c['open']} | High: ${c['high']} | Low: ${c['low']} | Close: ${c['close']} | Vol: {c['volume']:.2f} ETH")

    print("\nConexão com a Binance API 100% funcional!")
