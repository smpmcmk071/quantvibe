import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function calculateEMA(data, period) {
    const ema = [];
    const k = 2 / (period + 1);
    let firstEMA = null;

    for (let i = 0; i < data.length; i++) {
        const close = data[i].close;
        
        if (firstEMA === null) {
            if (i === period - 1) {
                const sum = data.slice(0, period).reduce((acc, d) => acc + d.close, 0);
                firstEMA = sum / period;
                ema.push(firstEMA);
            } else {
                ema.push(null);
            }
        } else {
            const prevEMA = ema[i - 1];
            const newEMA = close * k + prevEMA * (1 - k);
            ema.push(newEMA);
        }
    }
    return ema;
}

function calculateRSI(data, period) {
    const rsi = [];
    const k = 1 / period;
    let avgGain = null;
    let avgLoss = null;

    for (let i = 0; i < data.length; i++) {
        if (i === 0) {
            rsi.push(null);
            continue;
        }

        const delta = data[i].close - data[i - 1].close;
        const gain = delta > 0 ? delta : 0;
        const loss = delta < 0 ? -delta : 0;

        if (i === period) {
            const sumGain = data.slice(1, period + 1).reduce((sum, d, idx) => {
                const d_val = d.close - data[idx].close;
                return sum + (d_val > 0 ? d_val : 0);
            }, 0);
            const sumLoss = data.slice(1, period + 1).reduce((sum, d, idx) => {
                const d_val = d.close - data[idx].close;
                return sum + (d_val < 0 ? -d_val : 0);
            }, 0);
            avgGain = sumGain / period;
            avgLoss = sumLoss / period;
        }

        if (avgGain !== null && avgLoss !== null) {
            avgGain = avgGain * (1 - k) + gain * k;
            avgLoss = avgLoss * (1 - k) + loss * k;
            
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsiVal = 100 - (100 / (1 + rs));
            rsi.push(rsiVal);
        } else {
            rsi.push(null);
        }
    }

    return rsi;
}

function detectDivergences(data, rsiData, window = 5) {
    const bullDiv = new Array(data.length).fill(false);
    const bearDiv = new Array(data.length).fill(false);

    for (let i = window; i < data.length - window; i++) {
        if (rsiData[i] === null || rsiData[i - window] === null) continue;

        const priceSlice = data.slice(i - window, i + window + 1).map(d => d.close);
        const rsiSlice = rsiData.slice(i - window, i + window + 1).filter(v => v !== null);

        if (rsiSlice.length === 0) continue;

        const minPrice = Math.min(...priceSlice);
        const maxPrice = Math.max(...priceSlice);
        const minRSI = Math.min(...rsiSlice);
        const maxRSI = Math.max(...rsiSlice);

        const isCurrentPriceLow = data[i].close === minPrice;
        const isCurrentPriceHigh = data[i].close === maxPrice;
        const isCurrentRSILow = rsiData[i] === minRSI;
        const isCurrentRSIHigh = rsiData[i] === maxRSI;

        if (i >= window * 2) {
            const prevPriceSlice = data.slice(i - window * 2 - window, i - window + 1).map(d => d.close);
            const prevRsiSlice = rsiData.slice(i - window * 2 - window, i - window + 1).filter(v => v !== null);

            if (prevRsiSlice.length === 0) continue;

            const prevMinPrice = Math.min(...prevPriceSlice);
            const prevMinRSI = Math.min(...prevRsiSlice);
            const prevMaxPrice = Math.max(...prevPriceSlice);
            const prevMaxRSI = Math.max(...prevRsiSlice);

            if (isCurrentPriceLow && isCurrentRSILow && 
                data[i].close < prevMinPrice && rsiData[i] > prevMinRSI) {
                bullDiv[i] = true;
            }

            if (isCurrentPriceHigh && isCurrentRSIHigh && 
                data[i].close > prevMaxPrice && rsiData[i] < prevMaxRSI) {
                bearDiv[i] = true;
            }
        }
    }

    return { bullDiv, bearDiv };
}

function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
        } else {
            const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.volume, 0);
            sma.push(sum / period);
        }
    }
    return sma;
}

function calculateStdDev(data, period) {
    const stdDev = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            stdDev.push(null);
        } else {
            const slice = data.slice(i - period + 1, i + 1).map(d => d.volume);
            const mean = slice.reduce((a, b) => a + b, 0) / period;
            const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
            stdDev.push(Math.sqrt(variance));
        }
    }
    return stdDev;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, config = {} } = await req.json();

        if (!data || !Array.isArray(data)) {
            return Response.json({ error: 'Data array is required' }, { status: 400 });
        }

        // Calculate all indicators on the same data snapshot
        const emaConfig = config.ema_strategy || {};
        const fast = emaConfig.fast || 20;
        const medium = emaConfig.medium || 50;
        const slow = emaConfig.slow || 200;

        const emaFast = calculateEMA(data, fast);
        const emaMedium = calculateEMA(data, medium);
        const emaSlow = calculateEMA(data, slow);

        const rsiConfig = config.rsi || {};
        const rsiPeriod = rsiConfig.period || 14;
        const overbought = rsiConfig.overbought || 70;
        const oversold = rsiConfig.oversold || 30;

        const rsiData = calculateRSI(data, rsiPeriod);
        const { bullDiv, bearDiv } = detectDivergences(data, rsiData, 5);

        const volumeSMA = calculateSMA(data, 20);
        const volumeStdDev = calculateStdDev(data, 20);

        // Build results with all indicators
        const results = data.map((row, idx) => {
            const result = { ...row };

            // EMA values
            result[`ema_${fast}`] = emaFast[idx];
            result[`ema_${medium}`] = emaMedium[idx];
            result[`ema_${slow}`] = emaSlow[idx];
            result.ema_fast = emaFast[idx];
            result.ema_medium = emaMedium[idx];
            result.ema_slow = emaSlow[idx];

            // EMA crossovers
            if (idx > 0 && emaFast[idx] !== null && emaMedium[idx] !== null) {
                const currentAbove = emaFast[idx] > emaMedium[idx];
                const prevAbove = emaFast[idx - 1] > emaMedium[idx - 1];
                result.buy_cross = !prevAbove && currentAbove;
                result.sell_cross = prevAbove && !currentAbove;
                result.ema_fast_above_medium = currentAbove;
            } else {
                result.buy_cross = false;
                result.sell_cross = false;
                result.ema_fast_above_medium = false;
            }

            if (idx > 0 && emaFast[idx] !== null && emaSlow[idx] !== null) {
                const currentAbove = emaFast[idx] > emaSlow[idx];
                const prevAbove = emaFast[idx - 1] > emaSlow[idx - 1];
                result.buy_cross_9_34 = !prevAbove && currentAbove;
                result.sell_cross_9_34 = prevAbove && !currentAbove;
                result.ema_fast_above_slow = currentAbove;
            } else {
                result.buy_cross_9_34 = false;
                result.sell_cross_9_34 = false;
                result.ema_fast_above_slow = false;
            }

            // RSI values and signals
            const rsi = rsiData[idx];
            result.rsi = rsi !== null ? parseFloat(rsi.toFixed(2)) : null;

            if (rsi === null) {
                result.rsi_signal = null;
            } else if (rsi >= overbought) {
                result.rsi_signal = 'overbought';
            } else if (rsi <= oversold) {
                result.rsi_signal = 'oversold';
            } else {
                result.rsi_signal = 'neutral';
            }

            result.rsi_bull_div = bullDiv[idx];
            result.rsi_bear_div = bearDiv[idx];

            // Volume indicators
            const vol_sma = volumeSMA[idx];
            const vol_std = volumeStdDev[idx];
            const z_score = vol_sma && vol_std ? (row.volume - vol_sma) / vol_std : 0;

            result.vol_sma = vol_sma;
            result.vol_std = vol_std;
            result.vol_z_score = parseFloat(z_score.toFixed(2));
            result.vol_spike = z_score > 2;

            return result;
        });

        return Response.json({
            success: true,
            config_used: { ema: { fast, medium, slow }, rsi: { period: rsiPeriod, overbought, oversold } },
            count: results.length,
            data: results
        });

    } catch (error) {
        console.error('Comprehensive signals error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to calculate comprehensive signals'
        }, { status: 500 });
    }
    });