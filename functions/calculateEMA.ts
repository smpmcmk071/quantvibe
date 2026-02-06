import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    const emaData = [];
    
    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    emaData.push(ema);
    
    for (let i = period; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
        emaData.push(ema);
    }
    
    return emaData;
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

        const emaConfig = config.ema_strategy || {};
        const fast = emaConfig.fast || 13;
        const medium = emaConfig.medium || 48;
        const slow = emaConfig.slow || 200;

        const closes = ohlcvData.map(d => d.close);
        
        // Calculate EMAs
        const emaFast = calculateEMA(closes, fast);
        const emaMedium = calculateEMA(closes, medium);
        const emaSlow = calculateEMA(closes, slow);
        const ema9 = calculateEMA(closes, 9);
        const ema34 = calculateEMA(closes, 34);

        // Add EMA values to each row
        const results = ohlcvData.map((row, idx) => {
            const result = { ...row };
            
            if (idx >= fast - 1) result[`ema_${fast}`] = emaFast[idx - (fast - 1)];
            if (idx >= medium - 1) result[`ema_${medium}`] = emaMedium[idx - (medium - 1)];
            if (idx >= slow - 1) result[`ema_${slow}`] = emaSlow[idx - (slow - 1)];
            if (idx >= 8) result.ema_9 = ema9[idx - 8];
            if (idx >= 33) result.ema_34 = ema34[idx - 33];
            
            result.ema_fast = result[`ema_${fast}`];
            result.ema_medium = result[`ema_${medium}`];
            result.ema_slow = result[`ema_${slow}`];

            // Calculate crossovers
            if (idx > 0 && result.ema_fast && result.ema_medium) {
                const prevFast = results[idx - 1][`ema_${fast}`];
                const prevMedium = results[idx - 1][`ema_${medium}`];
                
                result.ema_fast_above_medium = result.ema_fast > result.ema_medium;
                result.buy_cross = prevFast <= prevMedium && result.ema_fast > result.ema_medium;
                result.sell_cross = prevFast >= prevMedium && result.ema_fast < result.ema_medium;
            }

            if (idx > 0 && result.ema_fast && result.ema_slow) {
                const prevFast = results[idx - 1][`ema_${fast}`];
                const prevSlow = results[idx - 1][`ema_${slow}`];
                
                result.ema_fast_above_slow = result.ema_fast > result.ema_slow;
                result.buy_cross_fast_slow = prevFast <= prevSlow && result.ema_fast > result.ema_slow;
                result.sell_cross_fast_slow = prevFast >= prevSlow && result.ema_fast < result.ema_slow;
            }

            if (idx > 0 && result.ema_medium && result.ema_slow) {
                const prevMedium = results[idx - 1][`ema_${medium}`];
                const prevSlow = results[idx - 1][`ema_${slow}`];
                
                result.ema_medium_above_slow = result.ema_medium > result.ema_slow;
                result.buy_cross_medium_slow = prevMedium <= prevSlow && result.ema_medium > result.ema_slow;
                result.sell_cross_medium_slow = prevMedium >= prevSlow && result.ema_medium < result.ema_slow;
            }

            // 9/34 crossover
            if (idx > 0 && result.ema_9 && result.ema_34) {
                const prev9 = results[idx - 1].ema_9;
                const prev34 = results[idx - 1].ema_34;
                
                result.ema_9_above_34 = result.ema_9 > result.ema_34;
                result.buy_cross_9_34 = prev9 <= prev34 && result.ema_9 > result.ema_34;
                result.sell_cross_9_34 = prev9 >= prev34 && result.ema_9 < result.ema_34;
            }

            // Percentage differences
            if (result.ema_fast && result.ema_medium) {
                result.ema_fast_medium_diff_pct = ((result.ema_fast - result.ema_medium) / result.ema_medium * 100).toFixed(2);
            }
            if (result.ema_fast && result.ema_slow) {
                result.ema_fast_slow_diff_pct = ((result.ema_fast - result.ema_slow) / result.ema_slow * 100).toFixed(2);
            }
            if (result.ema_9 && result.ema_34) {
                result.ema_9_34_diff_pct = ((result.ema_9 - result.ema_34) / result.ema_34 * 100).toFixed(2);
            }

            // Price above EMAs
            result.price_above_fast = result.ema_fast ? result.close > result.ema_fast : false;
            result.price_above_medium = result.ema_medium ? result.close > result.ema_medium : false;
            result.price_above_slow = result.ema_slow ? result.close > result.ema_slow : false;
            result.any_ema_crossed = result.price_above_fast || result.price_above_medium || result.price_above_slow;

            return result;
        });

        return Response.json({
            success: true,
            data: results,
            config: { fast, medium, slow }
        });

    } catch (error) {
        console.error('EMA calculation error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});