"""
Cálculo de Indicadores Técnicos para Automação de Cripto
Funções para médias móveis (SMA, EMA), RSI, Bandas de Bollinger e MACD.
"""

from typing import List, Dict

def calculate_sma(prices: List[float], period: int = 20) -> List[float]:
    """Média Móvel Simples (SMA)."""
    sma = [None] * len(prices)
    for i in range(period - 1, len(prices)):
        sma[i] = sum(prices[i - period + 1 : i + 1]) / period
    return sma

def calculate_ema(prices: List[float], period: int = 20) -> List[float]:
    """Média Móvel Exponencial (EMA)."""
    ema = [None] * len(prices)
    if len(prices) < period:
        return ema

    # Primeiro valor é a média simples
    sma_first = sum(prices[:period]) / period
    ema[period - 1] = sma_first
    multiplier = 2 / (period + 1)

    for i in range(period, len(prices)):
        ema[i] = (prices[i] - ema[i - 1]) * multiplier + ema[i - 1]

    return ema

def calculate_rsi(prices: List[float], period: int = 14) -> List[float]:
    """Índice de Força Relativa (RSI)."""
    rsi = [None] * len(prices)
    if len(prices) <= period:
        return rsi

    gains = []
    losses = []

    for i in range(1, period + 1):
        diff = prices[i] - prices[i - 1]
        gains.append(diff if diff > 0 else 0.0)
        losses.append(abs(diff) if diff < 0 else 0.0)

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    if avg_loss == 0:
        rsi[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi[period] = 100.0 - (100.0 / (1.0 + rs))

    for i in range(period + 1, len(prices)):
        diff = prices[i] - prices[i - 1]
        gain = diff if diff > 0 else 0.0
        loss = abs(diff) if diff < 0 else 0.0

        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period

        if avg_loss == 0:
            rsi[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi[i] = 100.0 - (100.0 / (1.0 + rs))

    return rsi

def calculate_bollinger_bands(prices: List[float], period: int = 20, num_std: float = 2.0):
    """Bandas de Bollinger (Média, Banda Superior e Banda Inferior)."""
    sma = calculate_sma(prices, period)
    upper = [None] * len(prices)
    lower = [None] * len(prices)

    for i in range(period - 1, len(prices)):
        window = prices[i - period + 1 : i + 1]
        mean = sma[i]
        variance = sum((x - mean) ** 2 for x in window) / period
        std_dev = variance ** 0.5

        upper[i] = mean + (num_std * std_dev)
        lower[i] = mean - (num_std * std_dev)

    return {"middle": sma, "upper": upper, "lower": lower}

if __name__ == "__main__":
    from binance_client import BinanceClient

    client = BinanceClient()
    print("[*] Baixando 50 candles de 1h de ETH/USDT para calcular indicadores...")
    candles = client.get_historical_klines("ETHUSDT", interval="1h", limit=50)
    closes = [c["close"] for c in candles]

    ema_20 = calculate_ema(closes, 20)
    rsi_14 = calculate_rsi(closes, 14)
    bands = calculate_bollinger_bands(closes, 20)

    last_close = closes[-1]
    last_ema = ema_20[-1]
    last_rsi = rsi_14[-1]
    last_upper = bands["upper"][-1]
    last_lower = bands["lower"][-1]

    print("\n--- ANÁLISE TÉCNICA ETH/USDT ---")
    print(f"Preço Atual:       ${last_close:,.2f}")
    print(f"EMA (20):          ${last_ema:,.2f} ({'ACIMA' if last_close > last_ema else 'ABAIXO'})")
    print(f"RSI (14):          {last_rsi:.2f} ({'SOBRECOMPRA' if last_rsi >= 70 else 'SOBREVENDA' if last_rsi <= 30 else 'NEUTRO'})")
    print(f"Banda Superior:    ${last_upper:,.2f}")
    print(f"Banda Inferior:    ${last_lower:,.2f}")
