"""
Módulo de Análise Estatística e Volatilidade Histórica (ETH, BTC, etc.)
Coleta candles históricos (1h ajustável) da Binance com paginação inteligente e cache local,
calculando padrões de volatilidade e volume por período (Madrugada, Manhã, Tarde, Noite),
por hora do dia (0h-23h), dia da semana e sessões globais de mercado.
"""

import os
import json
import time
import math
from datetime import datetime, timezone, timedelta
from binance_client import BinanceClient

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache_market")

class VolatilityAnalyzer:
    """Analisador de volatilidade intraday e horária baseado em dados históricos."""

    def __init__(self, client=None):
        self.client = client or BinanceClient()
        os.makedirs(CACHE_DIR, exist_ok=True)

    def _get_cache_filepath(self, symbol, interval):
        clean_symbol = symbol.upper().replace("/", "")
        return os.path.join(CACHE_DIR, f"klines_{clean_symbol}_{interval}.json")

    def _load_cached_candles(self, symbol, interval):
        filepath = self._get_cache_filepath(symbol, interval)
        if os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) > 0:
                        return data
            except Exception as e:
                print(f"[!] Erro ao carregar cache de candles: {e}")
        return []

    def _save_cached_candles(self, symbol, interval, candles):
        filepath = self._get_cache_filepath(symbol, interval)
        try:
            # Ordenar e remover duplicatas por timestamp
            seen = set()
            unique_candles = []
            for c in candles:
                ts = c.get("timestamp")
                if ts and ts not in seen:
                    seen.add(ts)
                    unique_candles.append(c)
            unique_candles.sort(key=lambda x: x["timestamp"])

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(unique_candles, f)
        except Exception as e:
            print(f"[!] Erro ao salvar cache de candles: {e}")

    def fetch_historical_candles_range(self, symbol="ETHUSDT", interval="1h", start_ts_ms=None, end_ts_ms=None, progress_callback=None):
        """
        Busca candles históricos no intervalo [start_ts_ms, end_ts_ms] com paginação automática.
        Utiliza cache local para otimizar velocidade e evitar estresse na API.
        """
        symbol = symbol.upper().replace("/", "")
        now_ms = int(time.time() * 1000)

        if end_ts_ms is None:
            end_ts_ms = now_ms
        if start_ts_ms is None:
            # Padrão: 2 anos atrás (2 * 365 dias)
            start_ts_ms = end_ts_ms - (2 * 365 * 24 * 3600 * 1000)

        # 1. Carregar candles já cacheados
        cached_all = self._load_cached_candles(symbol, interval)
        cached_map = {c["timestamp"]: c for c in cached_all}

        # Identificar quais intervalos ainda precisamos baixar
        # O Binance retorna até 1000 candles por requisição
        candles_result = []
        
        # Se temos cache suficiente para cobrir parte ou tudo
        needed_start = start_ts_ms
        needed_end = end_ts_ms

        batch_size = 1000
        # Mapeamento do intervalo para estimar milissegundos por candle
        interval_ms_map = {
            "1m": 60 * 1000,
            "5m": 5 * 60 * 1000,
            "15m": 15 * 60 * 1000,
            "30m": 30 * 60 * 1000,
            "1h": 3600 * 1000,
            "2h": 2 * 3600 * 1000,
            "4h": 4 * 3600 * 1000,
            "1d": 86400 * 1000,
        }
        step_ms = interval_ms_map.get(interval, 3600 * 1000)

        # Se o cache cobre o período solicitado
        has_min = min(cached_map.keys()) if cached_map else None
        has_max = max(cached_map.keys()) if cached_map else None

        # Verificar se precisamos baixar dados mais antigos ou mais novos
        fetch_ranges = []
        if not cached_map:
            fetch_ranges.append((start_ts_ms, end_ts_ms))
        else:
            if start_ts_ms < has_min:
                fetch_ranges.append((start_ts_ms, min(has_min - 1, end_ts_ms)))
            if end_ts_ms > has_max + step_ms:
                fetch_ranges.append((max(has_max + 1, start_ts_ms), end_ts_ms))

        # Baixar dados ausentes
        new_candles = []
        for r_start, r_end in fetch_ranges:
            curr_start = r_start
            iterations = 0
            max_iterations = 60  # Segurança: até 60.000 candles por requisição
            while curr_start < r_end and iterations < max_iterations:
                iterations += 1
                try:
                    batch = self.client.get_historical_klines(
                        symbol=symbol,
                        interval=interval,
                        limit=batch_size,
                        start_time=curr_start,
                        end_time=r_end
                    )
                except Exception as e:
                    print(f"[!] Erro ao buscar lote ({symbol}, {interval}, start={curr_start}): {e}")
                    # Tentar uma vez mais com fallback URL se falhar
                    time.sleep(0.4)
                    try:
                        self.client.base_url = BinanceClient.FALLBACK_URL
                        batch = self.client.get_historical_klines(
                            symbol=symbol,
                            interval=interval,
                            limit=batch_size,
                            start_time=curr_start,
                            end_time=r_end
                        )
                        self.client.base_url = BinanceClient.BASE_URL
                    except Exception as e2:
                        print(f"[!] Falha no fallback também: {e2}")
                        break

                if not batch:
                    break

                for c in batch:
                    cached_map[c["timestamp"]] = c
                    new_candles.append(c)

                # Próximo lote: timestamp do último candle + 1 milissegundo
                last_ts = batch[-1]["timestamp"]
                if last_ts <= curr_start:
                    curr_start = curr_start + step_ms
                else:
                    curr_start = last_ts + 1

                if progress_callback:
                    progress_callback(len(cached_map))

                # Pausa leve para respeitar limites de taxa da Binance
                time.sleep(0.08)

                if len(batch) < batch_size:
                    break

        # Se novos candles foram baixados, atualizar cache local
        if new_candles:
            self._save_cached_candles(symbol, interval, list(cached_map.values()))

        # Filtrar candles no intervalo pedido
        filtered = [
            c for ts, c in cached_map.items()
            if start_ts_ms <= ts <= end_ts_ms
        ]
        filtered.sort(key=lambda x: x["timestamp"])
        return filtered

    def analyze_volatility(self, symbol="ETHUSDT", interval="1h", start_date_str=None, end_date_str=None, years=2, tz_offset_hours=-3):
        """
        Executa a análise de volatilidade nos candles do período especificado.
        tz_offset_hours: fuso horário em horas (ex: -3 para Horário de Brasília / UTC-3).
        """
        now = datetime.now(timezone.utc)
        
        # Processar datas
        if end_date_str:
            try:
                dt_end = datetime.strptime(end_date_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
                end_ts_ms = int(dt_end.timestamp() * 1000)
            except Exception:
                end_ts_ms = int(now.timestamp() * 1000)
        else:
            end_ts_ms = int(now.timestamp() * 1000)

        if start_date_str:
            try:
                dt_start = datetime.strptime(start_date_str, "%Y-%m-%d").replace(hour=0, minute=0, second=0, tzinfo=timezone.utc)
                start_ts_ms = int(dt_start.timestamp() * 1000)
            except Exception:
                start_ts_ms = end_ts_ms - int(years * 365.25 * 24 * 3600 * 1000)
        else:
            start_ts_ms = end_ts_ms - int(years * 365.25 * 24 * 3600 * 1000)

        # Buscar candles
        candles = self.fetch_historical_candles_range(
            symbol=symbol,
            interval=interval,
            start_ts_ms=start_ts_ms,
            end_ts_ms=end_ts_ms
        )

        if not candles:
            return {
                "success": False,
                "error": f"Nenhum dado encontrado para {symbol} no intervalo especificado.",
                "total_candles": 0
            }

        # Estruturas para agregação
        # 1. Períodos do dia (Madrugada, Manhã, Tarde, Noite)
        periods_def = {
            "madrugada": {
                "name": "Madrugada",
                "hours_range": "00:00 - 05:59",
                "hours": set([0, 1, 2, 3, 4, 5]),
                "description": "Abertura dos mercados asiáticos e menor liquidez ocidental",
                "icon": "moon",
                "color": "#8e44ad"
            },
            "manha": {
                "name": "Manhã",
                "hours_range": "06:00 - 11:59",
                "hours": set([6, 7, 8, 9, 10, 11]),
                "description": "Abertura de Londres e Europa, início do fluxo institucional europeu",
                "icon": "sunrise",
                "color": "#3498db"
            },
            "tarde": {
                "name": "Tarde",
                "hours_range": "12:00 - 17:59",
                "hours": set([12, 13, 14, 15, 16, 17]),
                "description": "Abertura de Nova York (Wall Street) e sobreposição com Londres (Pico Global)",
                "icon": "sun",
                "color": "#f0b90b"
            },
            "noite": {
                "name": "Noite",
                "hours_range": "18:00 - 23:59",
                "hours": set([18, 19, 20, 21, 22, 23]),
                "description": "Fechamento de NY e transição para o mercado asiático e traders de varejo",
                "icon": "sunset",
                "color": "#e67e22"
            }
        }

        periods_data = {
            key: {
                "key": key,
                "name": info["name"],
                "hours_range": info["hours_range"],
                "description": info["description"],
                "icon": info["icon"],
                "color": info["color"],
                "amplitudes_pct": [],
                "amplitudes_usd": [],
                "volumes_usd": [],
                "volumes_base": [],
                "body_pcts": [],
                "bullish_count": 0,
                "bearish_count": 0,
                "neutral_count": 0,
                "returns_pct": [],
                "max_candle": None,
                "min_candle": None
            }
            for key, info in periods_def.items()
        }

        # 2. Agregação por 24 horas (0 a 23)
        hours_data = [
            {
                "hour": h,
                "hour_label": f"{h:02d}:00",
                "amplitudes_pct": [],
                "amplitudes_usd": [],
                "volumes_usd": [],
                "candle_count": 0
            }
            for h in range(24)
        ]

        # 3. Agregação por dia da semana (0 = Segunda, 6 = Domingo)
        weekdays_names = [
            "Segunda-feira", "Terça-feira", "Quarta-feira", 
            "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"
        ]
        weekdays_short = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
        weekdays_data = [
            {
                "day_index": i,
                "name": weekdays_names[i],
                "short_name": weekdays_short[i],
                "amplitudes_pct": [],
                "volumes_usd": [],
                "candle_count": 0
            }
            for i in range(7)
        ]

        # 4. Matriz Heatmap: 7 dias x 24 horas
        heatmap_matrix = [[[] for _ in range(24)] for _ in range(7)]

        # 5. Lista de maiores spikes históricos (Top 10)
        all_candles_processed = []

        total_volume_usd = 0.0

        for c in candles:
            open_p = c["open"]
            high_p = c["high"]
            low_p = c["low"]
            close_p = c["close"]
            vol_base = c["volume"]
            vol_quote = c.get("quote_asset_volume", vol_base * close_p)
            ts = c["timestamp"]

            total_volume_usd += vol_quote

            # Amplitude %: variação da mínima até a máxima do candle
            if low_p > 0:
                amplitude_pct = ((high_p - low_p) / low_p) * 100.0
            else:
                amplitude_pct = 0.0

            amplitude_usd = high_p - low_p
            body_pct = (abs(close_p - open_p) / open_p * 100.0) if open_p > 0 else 0.0
            return_pct = ((close_p - open_p) / open_p * 100.0) if open_p > 0 else 0.0

            # Converter timestamp para o timezone local do usuário
            # ts é UTC em ms
            utc_dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
            local_dt = utc_dt + timedelta(hours=tz_offset_hours)
            
            local_hour = local_dt.hour
            local_weekday = local_dt.weekday() # 0 = Segunda, 6 = Domingo
            local_str = local_dt.strftime("%Y-%m-%d %H:%M")

            candle_info = {
                "timestamp": ts,
                "datetime_local": local_str,
                "datetime_utc": c.get("datetime_utc", utc_dt.strftime("%Y-%m-%d %H:%M:%S")),
                "local_hour": local_hour,
                "local_weekday": local_weekday,
                "open": open_p,
                "high": high_p,
                "low": low_p,
                "close": close_p,
                "volume": vol_base,
                "quote_volume": vol_quote,
                "amplitude_pct": round(amplitude_pct, 3),
                "amplitude_usd": round(amplitude_usd, 2),
                "return_pct": round(return_pct, 3),
                "direction": "up" if close_p > open_p else ("down" if close_p < open_p else "flat")
            }

            all_candles_processed.append(candle_info)

            # Classificar em período
            target_period_key = "madrugada"
            for p_key, p_info in periods_def.items():
                if local_hour in p_info["hours"]:
                    target_period_key = p_key
                    break

            p_dest = periods_data[target_period_key]
            p_dest["amplitudes_pct"].append(amplitude_pct)
            p_dest["amplitudes_usd"].append(amplitude_usd)
            p_dest["volumes_usd"].append(vol_quote)
            p_dest["volumes_base"].append(vol_base)
            p_dest["body_pcts"].append(body_pct)
            p_dest["returns_pct"].append(return_pct)

            if close_p > open_p:
                p_dest["bullish_count"] += 1
            elif close_p < open_p:
                p_dest["bearish_count"] += 1
            else:
                p_dest["neutral_count"] += 1

            # Rastrear máxima e mínima amplitude
            if p_dest["max_candle"] is None or amplitude_pct > p_dest["max_candle"]["amplitude_pct"]:
                p_dest["max_candle"] = candle_info

            # Agregação horária (0 a 23)
            h_dest = hours_data[local_hour]
            h_dest["amplitudes_pct"].append(amplitude_pct)
            h_dest["amplitudes_usd"].append(amplitude_usd)
            h_dest["volumes_usd"].append(vol_quote)
            h_dest["candle_count"] += 1

            # Agregação por dia da semana (0 a 6)
            w_dest = weekdays_data[local_weekday]
            w_dest["amplitudes_pct"].append(amplitude_pct)
            w_dest["volumes_usd"].append(vol_quote)
            w_dest["candle_count"] += 1

            # Matriz Heatmap
            heatmap_matrix[local_weekday][local_hour].append(amplitude_pct)

        # Consolidar estatísticas dos 4 períodos
        periods_summary = []
        for key in ["madrugada", "manha", "tarde", "noite"]:
            item = periods_data[key]
            amps = item["amplitudes_pct"]
            vols = item["volumes_usd"]
            count = len(amps)

            if count > 0:
                amps_sorted = sorted(amps)
                avg_amp = sum(amps) / count
                median_amp = amps_sorted[count // 2]
                variance = sum((x - avg_amp) ** 2 for x in amps) / count
                std_dev = math.sqrt(variance)
                
                avg_vol = sum(vols) / count
                tot_vol = sum(vols)
                avg_return = sum(item["returns_pct"]) / count
                win_rate = (item["bullish_count"] / count) * 100.0
            else:
                avg_amp = 0.0
                median_amp = 0.0
                std_dev = 0.0
                avg_vol = 0.0
                tot_vol = 0.0
                avg_return = 0.0
                win_rate = 0.0

            periods_summary.append({
                "key": key,
                "name": item["name"],
                "hours_range": item["hours_range"],
                "description": item["description"],
                "icon": item["icon"],
                "color": item["color"],
                "candle_count": count,
                "avg_volatility_pct": round(avg_amp, 2),
                "median_volatility_pct": round(median_amp, 2),
                "std_dev_pct": round(std_dev, 2),
                "max_volatility_pct": round(item["max_candle"]["amplitude_pct"], 2) if item["max_candle"] else 0.0,
                "max_candle": item["max_candle"],
                "avg_volume_usd": round(avg_vol, 2),
                "total_volume_usd": round(tot_vol, 2),
                "volume_share_pct": round((tot_vol / total_volume_usd * 100.0) if total_volume_usd > 0 else 0.0, 1),
                "bullish_count": item["bullish_count"],
                "bearish_count": item["bearish_count"],
                "neutral_count": item["neutral_count"],
                "win_rate_bullish_pct": round(win_rate, 1),
                "avg_return_pct": round(avg_return, 3),
            })

        # Identificar período campeão e período mais calmo
        sorted_by_vol = sorted(periods_summary, key=lambda x: x["avg_volatility_pct"], reverse=True)
        most_volatile_period = sorted_by_vol[0] if sorted_by_vol else None
        least_volatile_period = sorted_by_vol[-1] if sorted_by_vol else None

        # Consolidar horas do dia
        hours_summary = []
        for h in hours_data:
            amps = h["amplitudes_pct"]
            vols = h["volumes_usd"]
            c_count = len(amps)
            avg_a = (sum(amps) / c_count) if c_count > 0 else 0.0
            avg_v = (sum(vols) / c_count) if c_count > 0 else 0.0
            hours_summary.append({
                "hour": h["hour"],
                "label": h["hour_label"],
                "avg_volatility_pct": round(avg_a, 2),
                "avg_volume_usd": round(avg_v, 2),
                "candle_count": c_count
            })

        # Pico horário absoluto
        peak_hour = max(hours_summary, key=lambda x: x["avg_volatility_pct"]) if hours_summary else None
        lowest_hour = min(hours_summary, key=lambda x: x["avg_volatility_pct"]) if hours_summary else None

        # Consolidar dias da semana
        weekdays_summary = []
        for w in weekdays_data:
            amps = w["amplitudes_pct"]
            vols = w["volumes_usd"]
            c_count = len(amps)
            avg_a = (sum(amps) / c_count) if c_count > 0 else 0.0
            avg_v = (sum(vols) / c_count) if c_count > 0 else 0.0
            weekdays_summary.append({
                "day_index": w["day_index"],
                "name": w["name"],
                "short_name": w["short_name"],
                "avg_volatility_pct": round(avg_a, 2),
                "avg_volume_usd": round(avg_v, 2),
                "candle_count": c_count
            })

        peak_weekday = max(weekdays_summary, key=lambda x: x["avg_volatility_pct"]) if weekdays_summary else None

        # Consolidar Heatmap (médias da matriz 7x24)
        heatmap_processed = []
        for day_idx in range(7):
            row = []
            for hour_idx in range(24):
                vals = heatmap_matrix[day_idx][hour_idx]
                avg_val = (sum(vals) / len(vals)) if vals else 0.0
                row.append(round(avg_val, 2))
            heatmap_processed.append(row)

        # Top 10 Maiores Spikes Históricos de Volatilidade
        top_spikes = sorted(all_candles_processed, key=lambda x: x["amplitude_pct"], reverse=True)[:10]

        # Estatísticas Globais
        all_amps = [c["amplitude_pct"] for c in all_candles_processed]
        overall_avg_vol = (sum(all_amps) / len(all_amps)) if all_amps else 0.0
        overall_max_vol = max(all_amps) if all_amps else 0.0

        # Calcular diferença percentual entre período mais volátil e mais calmo
        diff_pct = 0.0
        if least_volatile_period and least_volatile_period["avg_volatility_pct"] > 0 and most_volatile_period:
            diff_pct = ((most_volatile_period["avg_volatility_pct"] - least_volatile_period["avg_volatility_pct"]) 
                        / least_volatile_period["avg_volatility_pct"]) * 100.0

        # Texto explicativo gerado dinamicamente
        tz_label = f"UTC{tz_offset_hours:+d}:00" if tz_offset_hours != 0 else "UTC"
        if tz_offset_hours == -3:
            tz_label = "Horário de Brasília (UTC-3)"

        first_date = all_candles_processed[0]["datetime_local"] if all_candles_processed else ""
        last_date = all_candles_processed[-1]["datetime_local"] if all_candles_processed else ""

        # Comparação direta Manhã vs Tarde (conforme prompt quantitativo específico)
        manha_item = next((p for p in periods_summary if p["key"] == "manha"), None)
        tarde_item = next((p for p in periods_summary if p["key"] == "tarde"), None)
        
        direct_comparison = None
        if manha_item and tarde_item:
            manha_avg = manha_item["avg_volatility_pct"]
            tarde_avg = tarde_item["avg_volatility_pct"]
            if tarde_avg >= manha_avg:
                winner_name = "Tarde"
                loser_name = "Manhã"
                winner_range = "12:00 - 17:59"
                diff_morning_afternoon = ((tarde_avg - manha_avg) / manha_avg * 100.0) if manha_avg > 0 else 0.0
            else:
                winner_name = "Manhã"
                loser_name = "Tarde"
                winner_range = "06:00 - 11:59"
                diff_morning_afternoon = ((manha_avg - tarde_avg) / tarde_avg * 100.0) if tarde_avg > 0 else 0.0

            direct_comparison = {
                "winner": winner_name,
                "winner_range": winner_range,
                "diff_pct": round(diff_morning_afternoon, 2),
                "verdict": f"A volatilidade foi historicamente MAIOR no período da {winner_name} ({winner_range}), superando a {loser_name} em +{diff_morning_afternoon:.2f}% de amplitude média por candle.",
                "fuso_adotado": tz_label,
                "formula": "(High - Low) / Low * 100",
                "manha": {
                    "nome": "Manhã",
                    "intervalo": "06:00 às 11:59",
                    "candles": manha_item["candle_count"],
                    "media_pct": manha_item["avg_volatility_pct"],
                    "mediana_pct": manha_item["median_volatility_pct"],
                    "maximo_pct": manha_item["max_volatility_pct"],
                    "desvio_padrao_pct": manha_item["std_dev_pct"],
                    "volume_total_usd": manha_item["total_volume_usd"],
                    "volume_medio_usd": manha_item["avg_volume_usd"]
                },
                "tarde": {
                    "nome": "Tarde",
                    "intervalo": "12:00 às 17:59",
                    "candles": tarde_item["candle_count"],
                    "media_pct": tarde_item["avg_volatility_pct"],
                    "mediana_pct": tarde_item["median_volatility_pct"],
                    "maximo_pct": tarde_item["max_volatility_pct"],
                    "desvio_padrao_pct": tarde_item["std_dev_pct"],
                    "volume_total_usd": tarde_item["total_volume_usd"],
                    "volume_medio_usd": tarde_item["avg_volume_usd"]
                }
            }

        insight_text = (
            f"No período analisado ({first_date} a {last_date}, fuso {tz_label}), "
            f"o período de maior volatilidade média para {symbol} ({interval}) foi a "
            f"**{most_volatile_period['name']}** ({most_volatile_period['hours_range']}) com oscilação média de "
            f"**{most_volatile_period['avg_volatility_pct']}%** por candle, o que representa **+{diff_pct:.1f}%** de amplitude "
            f"em comparação com a **{least_volatile_period['name']}** ({least_volatile_period['avg_volatility_pct']}%), o momento mais calmo do mercado. "
            f"O horário de pico intraday foi às **{peak_hour['label']}** ({peak_hour['avg_volatility_pct']}%) e o dia da semana mais ativo foi **{peak_weekday['name']}**."
        )

        return {
            "success": True,
            "symbol": symbol,
            "interval": interval,
            "total_candles": len(all_candles_processed),
            "date_range": {
                "start": first_date,
                "end": last_date,
                "start_utc": all_candles_processed[0]["datetime_utc"] if all_candles_processed else "",
                "end_utc": all_candles_processed[-1]["datetime_utc"] if all_candles_processed else "",
                "years_requested": years
            },
            "timezone": {
                "offset_hours": tz_offset_hours,
                "label": tz_label
            },
            "overall": {
                "avg_volatility_pct": round(overall_avg_vol, 2),
                "max_volatility_pct": round(overall_max_vol, 2),
                "total_volume_usd": round(total_volume_usd, 2)
            },
            "insights": {
                "summary": insight_text,
                "champion_period": most_volatile_period,
                "calmest_period": least_volatile_period,
                "volatility_premium_pct": round(diff_pct, 1),
                "peak_hour": peak_hour,
                "lowest_hour": lowest_hour,
                "peak_weekday": peak_weekday,
                "direct_comparison": direct_comparison
            },
            "periods": periods_summary,
            "hours": hours_summary,
            "weekdays": weekdays_summary,
            "heatmap": {
                "weekdays": weekdays_short,
                "hours": [f"{h:02d}h" for h in range(24)],
                "matrix": heatmap_processed
            },
            "top_spikes": top_spikes
        }

    def analyze_from_csv(self, csv_content_or_filepath, tz_offset_hours=-3):
        """Permite analisar diretamente um arquivo CSV de candles (seja exportado da Binance ou pelo script)."""
        import csv
        import io
        
        candles = []
        if os.path.exists(str(csv_content_or_filepath)):
            with open(csv_content_or_filepath, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
        else:
            reader = csv.DictReader(io.StringIO(str(csv_content_or_filepath)))
            rows = list(reader)

        for r in rows:
            try:
                # Detectar campos flexivelmente
                ts = int(r.get("timestamp_ms") or r.get("timestamp") or r.get("open_time") or 0)
                if not ts and "datetime_utc" in r:
                    dt = datetime.strptime(r["datetime_utc"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                    ts = int(dt.timestamp() * 1000)

                candles.append({
                    "timestamp": ts,
                    "datetime_utc": r.get("datetime_utc", ""),
                    "open": float(r.get("open") or r.get("Open") or 0),
                    "high": float(r.get("high") or r.get("High") or 0),
                    "low": float(r.get("low") or r.get("Low") or 0),
                    "close": float(r.get("close") or r.get("Close") or 0),
                    "volume": float(r.get("volume") or r.get("Volume") or 0),
                    "quote_asset_volume": float(r.get("quote_asset_volume") or r.get("QuoteVolume") or 0),
                    "number_of_trades": int(r.get("trades_count") or r.get("trades") or 0)
                })
            except Exception:
                continue

        if not candles:
            return {"success": False, "error": "Formato de CSV inválido ou sem candles legíveis."}

        # Salvar em cache temporário e rodar análise
        symbol = "CSV_IMPORT"
        interval = "1h"
        candles.sort(key=lambda x: x["timestamp"])
        self._save_cached_candles(symbol, interval, candles)
        start_ts = candles[0]["timestamp"]
        end_ts = candles[-1]["timestamp"]
        
        start_date = datetime.fromtimestamp(start_ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        end_date = datetime.fromtimestamp(end_ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        
        res = self.analyze_volatility(
            symbol=symbol,
            interval=interval,
            start_date_str=start_date,
            end_date_str=end_date,
            tz_offset_hours=tz_offset_hours
        )
        return res

if __name__ == "__main__":
    analyzer = VolatilityAnalyzer()
    print("Testando análise rápida para ETHUSDT (últimos 30 dias)...")
    res = analyzer.analyze_volatility(symbol="ETHUSDT", interval="1h", years=0.1, tz_offset_hours=-3)
    if res.get("success"):
        print(f"Sucesso! Total candles analisados: {res['total_candles']}")
        print(f"Resumo: {res['insights']['summary']}")
    else:
        print(f"Falha: {res.get('error')}")
