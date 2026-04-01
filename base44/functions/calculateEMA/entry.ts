import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function calculateEMAForPeriod(data, period) {
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

        const { data } = await req.json();

        if (!data || !Array.isArray(data)) {
            return Response.json({ error: 'Data array is required' }, { status: 400 });
        }

        const periods = [50, 200];
        const emaData = {};

        periods.forEach(period => {
            emaData[`ema_${period}`] = calculateEMAForPeriod(data, period);
        });

        const results = data.map((row, idx) => {
            const result = { ...row };
            periods.forEach(period => {
                result[`ema_${period}`] = emaData[`ema_${period}`][idx];
            });
            return result;
        });

        return Response.json({
            success: true,
            count: results.length,
            data: results
        });

    } catch (error) {
        console.error('EMA calculation error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to calculate EMA'
        }, { status: 500 });
    }
});