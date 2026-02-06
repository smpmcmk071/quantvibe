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

        const { data } = await req.json();

        if (!data || !Array.isArray(data)) {
            return Response.json({ error: 'Data array is required' }, { status: 400 });
        }

        // Step 2: Calculate volume indicators
        const zscorePeriod = 20;
        const spikeThreshold = 1.7;
        const maPeriod = 20;

        const volumes = data.map(d => d.volume);
        const volMA = calculateSMA(volumes, maPeriod);
        const volMean = calculateSMA(volumes, zscorePeriod);
        const volStdDev = calculateStdDev(volumes, zscorePeriod, volMean);

        // Calculate OBV
        const obv = [0];
        for (let i = 1; i < data.length; i++) {
            if (data[i].close > data[i - 1].close) {
                obv.push(obv[i - 1] + data[i].volume);
            } else if (data[i].close < data[i - 1].close) {
                obv.push(obv[i - 1] - data[i].volume);
            } else {
                obv.push(obv[i - 1]);
            }
        }

        const results = data.map((row, idx) => {
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

            // Signal
            result.volume_signal = 'hold';
            if (result.vol_spike) {
                if (idx > 0 && row.close > data[idx - 1].close) {
                    result.volume_signal = 'vol_buy';
                } else if (idx > 0) {
                    result.volume_signal = 'vol_sell';
                }
            }

            return result;
        });

        return Response.json({
            success: true,
            count: results.length,
            data: results
        });

    } catch (error) {
        console.error('Volume signals error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to calculate volume signals'
        }, { status: 500 });
    }
});