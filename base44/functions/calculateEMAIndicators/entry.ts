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

        // Get EMA periods from config (with defaults)
        const emaConfig = config.ema_strategy || {};
        const fast = emaConfig.fast || 20;
        const medium = emaConfig.medium || 50;
        const slow = emaConfig.slow || 200;

        // Calculate EMAs
        const emaFast = calculateEMA(data, fast);
        const emaMedium = calculateEMA(data, medium);
        const emaSlow = calculateEMA(data, slow);

        // Build results with crossover detection
        const results = data.map((row, idx) => {
            const result = { ...row };
            
            // Add EMA values
            result[`ema_${fast}`] = emaFast[idx];
            result[`ema_${medium}`] = emaMedium[idx];
            result[`ema_${slow}`] = emaSlow[idx];
            result.ema_fast = emaFast[idx];
            result.ema_medium = emaMedium[idx];
            result.ema_slow = emaSlow[idx];

            // Fast/Medium crossover
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

            // Fast/Slow crossover
            if (idx > 0 && emaFast[idx] !== null && emaSlow[idx] !== null) {
                const currentAbove = emaFast[idx] > emaSlow[idx];
                const prevAbove = emaFast[idx - 1] > emaSlow[idx - 1];
                result.buy_cross_fast_slow = !prevAbove && currentAbove;
                result.sell_cross_fast_slow = prevAbove && !currentAbove;
                result.ema_fast_above_slow = currentAbove;
            } else {
                result.buy_cross_fast_slow = false;
                result.sell_cross_fast_slow = false;
                result.ema_fast_above_slow = false;
            }

            // Medium/Slow crossover
            if (idx > 0 && emaMedium[idx] !== null && emaSlow[idx] !== null) {
                const currentAbove = emaMedium[idx] > emaSlow[idx];
                const prevAbove = emaMedium[idx - 1] > emaSlow[idx - 1];
                result.buy_cross_medium_slow = !prevAbove && currentAbove;
                result.sell_cross_medium_slow = prevAbove && !currentAbove;
                result.ema_medium_above_slow = currentAbove;
            } else {
                result.buy_cross_medium_slow = false;
                result.sell_cross_medium_slow = false;
                result.ema_medium_above_slow = false;
            }

            // Percentage differences
            result.ema_fast_medium_diff_pct = emaMedium[idx] ? 
                parseFloat(((emaFast[idx] - emaMedium[idx]) / emaMedium[idx] * 100).toFixed(2)) : null;
            result.ema_fast_slow_diff_pct = emaSlow[idx] ? 
                parseFloat(((emaFast[idx] - emaSlow[idx]) / emaSlow[idx] * 100).toFixed(2)) : null;
            result.ema_medium_slow_diff_pct = emaSlow[idx] ? 
                parseFloat(((emaMedium[idx] - emaSlow[idx]) / emaSlow[idx] * 100).toFixed(2)) : null;

            // Price vs EMA flags
            result.price_above_fast = emaFast[idx] ? row.close > emaFast[idx] : false;
            result.price_above_medium = emaMedium[idx] ? row.close > emaMedium[idx] : false;
            result.price_above_slow = emaSlow[idx] ? row.close > emaSlow[idx] : false;

            // Combined: price above any EMA
            result.any_ema_crossed = result.price_above_fast || result.price_above_medium || result.price_above_slow;

            return result;
        });

        return Response.json({
            success: true,
            ema_config: { fast, medium, slow },
            count: results.length,
            data: results
        });

    } catch (error) {
        console.error('EMA indicators error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to calculate EMA indicators'
        }, { status: 500 });
    }
});