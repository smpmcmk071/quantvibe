import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function calculateRSI(data, period) {
    const rsi = [];
    const k = 1 / period;
    let avgGain = null;
    let avgLoss = null;

    for (let i = 0; i < data.length; i++) {
        if (i === 0) {
            rsi.push(50);
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
            rsi.push(50);
        }
    }

    return rsi;
}

function detectDivergences(data, rsiData, period = 14) {
    const bullDiv = new Array(data.length).fill(false);
    const bearDiv = new Array(data.length).fill(false);
    const window = 5;

    for (let i = window; i < data.length - window; i++) {
        // Get price and RSI in window
        const priceSlice = data.slice(i - window, i + window + 1).map(d => d.close);
        const rsiSlice = rsiData.slice(i - window, i + window + 1);

        const minPrice = Math.min(...priceSlice);
        const maxPrice = Math.max(...priceSlice);
        const minRSI = Math.min(...rsiSlice.filter(v => v !== null));
        const maxRSI = Math.max(...rsiSlice.filter(v => v !== null));

        const isCurrentPriceLow = data[i].close === minPrice;
        const isCurrentPriceHigh = data[i].close === maxPrice;
        const isCurrentRSILow = rsiData[i] === minRSI;
        const isCurrentRSIHigh = rsiData[i] === maxRSI;

        // Check previous window (5 bars back)
        if (i >= window * 2) {
            const prevPriceSlice = data.slice(i - window * 2 - window, i - window + 1).map(d => d.close);
            const prevRsiSlice = rsiData.slice(i - window * 2 - window, i - window + 1);

            const prevMinPrice = Math.min(...prevPriceSlice);
            const prevMinRSI = Math.min(...prevRsiSlice.filter(v => v !== null));
            const prevMaxPrice = Math.max(...prevPriceSlice);
            const prevMaxRSI = Math.max(...prevRsiSlice.filter(v => v !== null));

            // Bullish divergence: price lower low, RSI higher low
            if (isCurrentPriceLow && isCurrentRSILow && 
                data[i].close < prevMinPrice && rsiData[i] > prevMinRSI) {
                bullDiv[i] = true;
            }

            // Bearish divergence: price higher high, RSI lower high
            if (isCurrentPriceHigh && isCurrentRSIHigh && 
                data[i].close > prevMaxPrice && rsiData[i] < prevMaxRSI) {
                bearDiv[i] = true;
            }
        }
    }

    return { bullDiv, bearDiv };
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

        // Get RSI config
        const rsiConfig = config.rsi || {};
        const period = rsiConfig.period || 14;
        const overbought = rsiConfig.overbought || 70;
        const oversold = rsiConfig.oversold || 30;

        // Calculate RSI
        const rsiData = calculateRSI(data, period);

        // Detect divergences
        const { bullDiv, bearDiv } = detectDivergences(data, rsiData, period);

        // Build results
        const results = data.map((row, idx) => {
            const result = { ...row };
            const rsi = rsiData[idx];

            result.rsi = parseFloat(rsi.toFixed(2));

            // RSI signal
            if (rsi >= overbought) {
                result.rsi_signal = 'overbought';
            } else if (rsi <= oversold) {
                result.rsi_signal = 'oversold';
            } else {
                result.rsi_signal = 'neutral';
            }

            // Divergences
            result.rsi_bull_div = bullDiv[idx];
            result.rsi_bear_div = bearDiv[idx];

            // Trade signals
            result.rsi_trade_signal = 'hold';
            if (bullDiv[idx]) {
                result.rsi_trade_signal = 'rsi_bull_divergence';
            } else if (bearDiv[idx]) {
                result.rsi_trade_signal = 'rsi_bear_divergence';
            } else if (rsi <= oversold) {
                result.rsi_trade_signal = 'rsi_buy';
            } else if (rsi >= overbought) {
                result.rsi_trade_signal = 'rsi_sell';
            }

            return result;
        });

        return Response.json({
            success: true,
            rsi_config: { period, overbought, oversold },
            count: results.length,
            data: results
        });

    } catch (error) {
        console.error('RSI calculation error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to calculate RSI'
        }, { status: 500 });
    }
});