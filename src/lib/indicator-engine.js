function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toSeries(values) {
  return values.map((value) => Number(value));
}

export function computeSMA(values, period = 20) {
  const series = toSeries(values);
  return series.map((_, index) => {
    if (index < period - 1) return null;
    const slice = series.slice(index - period + 1, index + 1);
    return slice.reduce((sum, item) => sum + item, 0) / period;
  });
}

export function computeEMA(values, period = 20) {
  const series = toSeries(values);
  const k = 2 / (period + 1);
  const result = [];
  let prev = null;
  for (let i = 0; i < series.length; i += 1) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (i === period - 1) {
      const slice = series.slice(0, period);
      prev = slice.reduce((sum, item) => sum + item, 0) / period;
      result.push(prev);
      continue;
    }
    prev = series[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function computeBollinger(values, period = 20, multiplier = 2) {
  const series = toSeries(values);
  const middle = computeSMA(series, period);
  const upper = [];
  const lower = [];
  for (let i = 0; i < series.length; i += 1) {
    if (i < period - 1 || middle[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = series.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    upper.push(mean + multiplier * std);
    lower.push(mean - multiplier * std);
  }
  return { middle, upper, lower };
}

export function computeRSI(values, period = 14) {
  const series = toSeries(values);
  const result = Array(series.length).fill(null);
  if (series.length <= period) return result;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = series[i] - series[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < series.length; i += 1) {
    const change = series[i] - series[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function computeMACD(values, fast = 12, slow = 26, signal = 9) {
  const series = toSeries(values);
  const fastEMA = computeEMA(series, fast);
  const slowEMA = computeEMA(series, slow);
  const macd = fastEMA.map((value, index) => {
    const slowValue = slowEMA[index];
    if (value === null || slowValue === null) return null;
    return value - slowValue;
  });
  const signalLine = [];
  let prevSignal = null;
  for (let i = 0; i < macd.length; i += 1) {
    if (macd[i] === null) {
      signalLine.push(null);
      continue;
    }
    if (i < signal - 1) {
      signalLine.push(null);
      continue;
    }
    if (i === signal - 1) {
      const slice = macd.slice(0, signal);
      prevSignal = slice.reduce((sum, item) => sum + (item ?? 0), 0) / signal;
      signalLine.push(prevSignal);
      continue;
    }
    prevSignal = (prevSignal ?? macd[i] ?? 0) * 0.9 + (macd[i] ?? 0) * 0.1;
    signalLine.push(prevSignal);
  }
  return { macd, signalLine };
}

export function computeATR(values, period = 14) {
  const series = toSeries(values);
  const result = Array(series.length).fill(null);
  if (series.length < 2) return result;
  const trueRanges = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1];
    const current = series[i];
    const high = Math.max(prev, current) + Math.abs(current - prev) * 0.35;
    const low = Math.min(prev, current) - Math.abs(current - prev) * 0.35;
    const range = high - low;
    trueRanges.push(range);
  }
  let initial = 0;
  for (let i = 0; i < period && i < trueRanges.length; i += 1) initial += trueRanges[i];
  result[period] = initial / period;
  for (let i = period + 1; i < series.length; i += 1) {
    const previous = result[i - 1];
    result[i] = ((previous ?? 0) * (period - 1) + trueRanges[i - 1]) / period;
  }
  return result;
}

export function computeVWAP(values, period = 20) {
  const series = toSeries(values);
  const result = [];
  for (let i = 0; i < series.length; i += 1) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    const slice = series.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, item) => sum + item, 0) / period;
    result.push(avg);
  }
  return result;
}

export function computeStochastic(values, period = 14, smooth = 3) {
  const series = toSeries(values);
  const result = [];
  for (let i = 0; i < series.length; i += 1) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    const window = series.slice(i - period + 1, i + 1);
    const high = Math.max(...window);
    const low = Math.min(...window);
    const spread = high - low || 1;
    const percentK = ((series[i] - low) / spread) * 100;
    result.push(percentK);
  }
  const smoothed = [];
  for (let i = 0; i < result.length; i += 1) {
    if (result[i] === null) {
      smoothed.push(null);
      continue;
    }
    if (i < smooth - 1) {
      smoothed.push(result[i]);
      continue;
    }
    const slice = result.slice(i - smooth + 1, i + 1).filter((item) => item !== null);
    smoothed.push(slice.reduce((sum, item) => sum + item, 0) / slice.length);
  }
  return smoothed;
}

export function computeMomentum(values, period = 10) {
  const series = toSeries(values);
  return series.map((value, index) => {
    if (index < period) return null;
    return value - series[index - period];
  });
}

export function computeOBV(values) {
  const series = toSeries(values);
  const result = [];
  let total = 0;
  for (let i = 0; i < series.length; i += 1) {
    if (i === 0) {
      result.push(series[0]);
      continue;
    }
    const delta = series[i] - series[i - 1];
    total += delta >= 0 ? 1 : -1;
    result.push(series[i] + total);
  }
  return result;
}

export function computeADX(values, period = 14) {
  const series = toSeries(values);
  const result = Array(series.length).fill(null);
  if (series.length < period + 1) return result;
  const dx = [];
  for (let i = 1; i < series.length; i += 1) {
    const move = series[i] - series[i - 1];
    const upMove = move > 0 ? move : 0;
    const downMove = move < 0 ? -move : 0;
    const plusDI = upMove / Math.max(1, Math.abs(series[i] - series[i - 1]));
    const minusDI = downMove / Math.max(1, Math.abs(series[i] - series[i - 1]));
    const dxValue = Math.abs(plusDI - minusDI) / (plusDI + minusDI + 1e-8) * 100;
    dx.push(dxValue);
  }
  let smoothedDx = 0;
  for (let i = 0; i < period && i < dx.length; i += 1) smoothedDx += dx[i];
  smoothedDx /= period;
  for (let i = period; i < dx.length; i += 1) {
    smoothedDx = (smoothedDx * (period - 1) + dx[i]) / period;
    result[i + 1] = smoothedDx;
  }
  return result;
}

export function computeCCI(values, period = 20) {
  const series = toSeries(values);
  const result = [];
  for (let i = 0; i < series.length; i += 1) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    const slice = series.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, item) => sum + item, 0) / period;
    const deviation = slice.reduce((sum, item) => sum + Math.abs(item - mean), 0) / period;
    const cci = deviation === 0 ? 0 : (series[i] - mean) / (0.015 * deviation);
    result.push(cci);
  }
  return result;
}

export function computeIndicatorSeries(values, indicator, period = 14) {
  switch (indicator) {
    case "SMA":
      return computeSMA(values, period);
    case "EMA":
      return computeEMA(values, period);
    case "Bollinger":
      return computeBollinger(values, period);
    case "RSI":
      return computeRSI(values, period);
    case "MACD":
      return computeMACD(values, 12, 26, 9);
    case "ATR":
      return computeATR(values, period);
    case "VWAP":
      return computeVWAP(values, period);
    case "Stochastic":
      return computeStochastic(values, period);
    case "Momentum":
      return computeMomentum(values, period);
    case "OBV":
      return computeOBV(values);
    case "ADX":
      return computeADX(values, period);
    case "CCI":
      return computeCCI(values, period);
    default:
      return [];
  }
}

export function getIndicatorColor(indicator) {
  switch (indicator) {
    case "SMA":
      return "oklch(0.61 0.21 259)";
    case "EMA":
      return "oklch(0.91 0.14 41)";
    case "Bollinger":
      return "oklch(0.72 0.18 198)";
    case "RSI":
      return "oklch(0.78 0.18 148)";
    case "MACD":
      return "oklch(0.73 0.22 293)";
    case "ATR":
      return "oklch(0.78 0.16 25)";
    case "VWAP":
      return "oklch(0.69 0.17 220)";
    case "Stochastic":
      return "oklch(0.82 0.16 320)";
    case "Momentum":
      return "oklch(0.7 0.2 145)";
    case "OBV":
      return "oklch(0.79 0.14 54)";
    case "ADX":
      return "oklch(0.74 0.18 12)";
    case "CCI":
      return "oklch(0.69 0.16 270)";
    default:
      return "oklch(0.6 0.14 220)";
  }
}

export function getIndicatorScale(indicator, value) {
  if (indicator === "RSI" || indicator === "Stochastic") return clamp(value, 0, 100);
  if (indicator === "MACD") return clamp(value, -100, 100);
  if (indicator === "ADX") return clamp(value, 0, 100);
  if (indicator === "CCI") return clamp(value, -200, 200);
  return value;
}
