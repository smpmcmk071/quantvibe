import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
        } else {
            const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            sma.push(sum / period);
        }
    }
    return sma;
}

function calculateStdDev(data, period, mean) {
    const stdDev = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1 || !mean[i]) {
            stdDev.push(null);
        } else {
            const slice = data.slice(i - period + 1, i + 1);
            const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean[i], 2), 0) / period;
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

        const { data: ohlcvData, config = {} } = await req.json();

        if (!ohlcvData || !Array.isArray(ohlcvData)) {
            return Response.json({ error: 'OHLCV data array is required' }, { status: 400 });
        }

        const zscorePeriod = config.volume_zscore_period || 20;
        const spikeThreshold = config.volume_spike_threshold || 1.7;
        const maPeriod = config.volume_ma_period || 20;

        const volumes = ohlcvData.map(d => d.volume);
        const volMA = calculateSMA(volumes, maPeriod);
        const volMean = calculateSMA(volumes, zscorePeriod);
        const volStdDev = calculateStdDev(volumes, zscorePeriod, volMean);

        // Calculate OBV
        const obv = [0];
        for (let i = 1; i < ohlcvData.length; i++) {
            if (ohlcvData[i].close > ohlcvData[i - 1].close) {
                obv.push(obv[i - 1] + ohlcvData[i].volume);
            } else if (ohlcvData[i].close < ohlcvData[i - 1].close) {
                obv.push(obv[i - 1] - ohlcvData[i].volume);
            } else {
                obv.push(obv[i - 1]);
            }
        }

        const results = ohlcvData.map((row, idx) => {
            const result = { ...row };

            result.vol_ma = volMA[idx];
            result.obv = obv[idx];

            // Z-score
            if (volMean[idx] && volStdDev[idx] && volStdDev[idx] !== 0) {
                result.vol_zscore = (row.volume - volMean[idx]) / volStdDev[idx];
            } else {
                result.vol_zscore = 0;
            }

            result.vol_spike = result.vol_zscore > spikeThreshold;
            result.vol_ratio = result.vol_ma ? row.volume / result.vol_ma : 1.0;

            // Trend
            if (result.vol_zscore > spikeThreshold * 1.5) result.vol_trend = 'extreme_high';
            else if (result.vol_zscore > spikeThreshold) result.vol_trend = 'high';
            else if (result.vol_zscore > 0) result.vol_trend = 'above_avg';
            else if (result.vol_zscore >= -spikeThreshold) result.vol_trend = 'below_avg';
            else result.vol_trend = 'low';

            // Momentum
            if (idx > 0 && results[idx - 1].vol_zscore !== undefined) {
                result.vol_momentum = result.vol_zscore - results[idx - 1].vol_zscore;
            }

            // Breakout
            if (idx > 1) {
                const lowVolPeriod = results[idx - 1].vol_zscore < 0 && results[idx - 2].vol_zscore < 0;
                result.vol_breakout = result.vol_spike && lowVolPeriod;
            }

            result.vol_strength = Math.max(0, Math.min(100, (result.vol_zscore / spikeThreshold) * 50 + 50));

            // Divergence
            if (idx > 0) {
                const priceChange = (row.close - ohlcvData[idx - 1].close) / ohlcvData[idx - 1].close;
                const volChange = result.vol_zscore - (results[idx - 1].vol_zscore || 0);
                
                result.vol_bullish_div = priceChange < -0.01 && volChange > 0.5;
                result.vol_bearish_div = priceChange > 0.01 && volChange < -0.5;
            }

            // Signal
            result.volume_signal = 'hold';
            if (result.vol_spike) {
                if (idx > 0 && row.close > ohlcvData[idx - 1].close) {
                    result.volume_signal = 'vol_buy';
                } else if (idx > 0) {
                    result.volume_signal = 'vol_sell';
                }
            }
            if (result.vol_breakout) {
                result.volume_signal = 'vol_breakout';
            }

            return result;
        });

        return Response.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('Volume calculation error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});