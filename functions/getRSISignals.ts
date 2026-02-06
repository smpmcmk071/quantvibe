import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        // Get local window
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

        // Compare with previous window
        if (i >= window * 2) {
            const prevPriceSlice = data.slice(i - window * 2 - window, i - window + 1).map(d => d.close);
            const prevRsiSlice = rsiData.slice(i - window * 2 - window, i - window + 1).filter(v => v !== null);

            if (prevRsiSlice.length === 0) continue;

            const prevMinPrice = Math.min(...prevPriceSlice);
            const prevMinRSI = Math.min(...prevRsiSlice);
            const prevMaxPrice = Math.max(...prevPriceSlice);
            const prevMaxRSI = Math.max(...prevRsiSlice);

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

        const { ticker, interval = '1d', period = '30d', config = {} } = await req.json();

        if (!ticker) {
            return Response.json({ error: 'Ticker is required' }, { status: 400 });
        }

        // Fetch data from Yahoo
        const fetchResponse = await base44.functions.invoke('fetchYahooData', {
            ticker,
            interval,
            period
        });

        if (fetchResponse.data.error) {
            return Response.json({ error: fetchResponse.data.error }, { status: 400 });
        }

        const data = fetchResponse.data.data;
        if (!data || data.length === 0) {
            return Response.json({ error: 'No data available' }, { status: 400 });
        }

        // Get RSI config
        const rsiConfig = config.rsi || {};
        const rsiPeriod = rsiConfig.period || 14;
        const overbought = rsiConfig.overbought || 70;
        const oversold = rsiConfig.oversold || 30;

        // Calculate RSI
        const rsiData = calculateRSI(data, rsiPeriod);

        // Detect divergences
        const { bullDiv, bearDiv } = detectDivergences(data, rsiData, 5);

        // Build results
        const results = data.map((row, idx) => {
            const result = { ...row };
            const rsi = rsiData[idx];

            result.rsi = rsi !== null ? parseFloat(rsi.toFixed(2)) : null;

            // RSI signal
            if (rsi === null) {
                result.rsi_signal = null;
            } else if (rsi >= overbought) {
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
            } else if (rsi !== null && rsi <= oversold) {
                result.rsi_trade_signal = 'rsi_buy';
            } else if (rsi !== null && rsi >= overbought) {
                result.rsi_trade_signal = 'rsi_sell';
            }

            return result;
        });

        return Response.json({
            success: true,
            ticker,
            interval,
            period,
            rsi_config: { period: rsiPeriod, overbought, oversold },
            count: results.length,
            data: results
        });

    } catch (error) {
        console.error('RSI signals error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to calculate RSI signals'
        }, { status: 500 });
    }
});