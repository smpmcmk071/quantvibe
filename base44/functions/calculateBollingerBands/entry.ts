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

function calculateStdDev(data, period, sma) {
    const stdDev = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1 || !sma[i]) {
            stdDev.push(null);
        } else {
            const slice = data.slice(i - period + 1, i + 1);
            const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma[i], 2), 0) / period;
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

        const bbConfig = config.bollinger || {};
        const period = bbConfig.bb_period || 20;
        const stdDevMultiplier = bbConfig.bb_std_dev || 2.0;
        const squeezeThreshold = bbConfig.bb_squeeze_threshold || 0.05;

        const closes = ohlcvData.map(d => d.close);
        const sma = calculateSMA(closes, period);
        const stdDev = calculateStdDev(closes, period, sma);

        const results = ohlcvData.map((row, idx) => {
            const result = { ...row };

            result.bb_middle = sma[idx];
            result.bb_upper = sma[idx] && stdDev[idx] ? sma[idx] + (stdDev[idx] * stdDevMultiplier) : null;
            result.bb_lower = sma[idx] && stdDev[idx] ? sma[idx] - (stdDev[idx] * stdDevMultiplier) : null;

            if (result.bb_upper && result.bb_lower && result.bb_middle) {
                result.bb_width = (result.bb_upper - result.bb_lower) / result.bb_middle;
                
                const bandRange = result.bb_upper - result.bb_lower;
                result.bb_position = bandRange > 0 ? (result.close - result.bb_lower) / bandRange : 0.5;
                result.bb_position = Math.max(0, Math.min(1, result.bb_position));

                result.bb_squeeze = result.bb_width < squeezeThreshold;
                result.bb_touch_upper = result.close >= result.bb_upper;
                result.bb_touch_lower = result.close <= result.bb_lower;

                // Breakouts
                if (idx > 0 && results[idx - 1].bb_squeeze) {
                    result.bb_breakout_up = result.bb_touch_upper;
                    result.bb_breakout_down = result.bb_touch_lower;
                }

                // Width change
                if (idx > 0 && results[idx - 1].bb_width) {
                    result.bb_width_change = result.bb_width - results[idx - 1].bb_width;
                    result.bb_expanding = result.bb_width_change > 0;
                    result.bb_contracting = result.bb_width_change < 0;
                }

                // Trend
                if (result.bb_position > 0.8) result.bb_trend = 'strong_bull';
                else if (result.bb_position > 0.6) result.bb_trend = 'bull';
                else if (result.bb_position >= 0.4) result.bb_trend = 'neutral';
                else if (result.bb_position >= 0.2) result.bb_trend = 'bear';
                else result.bb_trend = 'strong_bear';

                result.bb_overbought = result.bb_position > 0.95;
                result.bb_oversold = result.bb_position < 0.05;
                result.bb_distance_pct = ((result.close - result.bb_middle) / result.bb_middle * 100).toFixed(2);

                // Signal
                result.bb_signal = 'hold';
                if (result.bb_breakout_up) result.bb_signal = 'bb_breakout_buy';
                else if (result.bb_breakout_down) result.bb_signal = 'bb_breakout_sell';
                else if (result.bb_oversold) result.bb_signal = 'bb_oversold';
                else if (result.bb_overbought) result.bb_signal = 'bb_overbought';
            }

            return result;
        });

        return Response.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('Bollinger Bands calculation error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});