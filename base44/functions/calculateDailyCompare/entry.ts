import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: ohlcvData } = await req.json();

        if (!ohlcvData || !Array.isArray(ohlcvData)) {
            return Response.json({ error: 'OHLCV data array is required' }, { status: 400 });
        }

        const results = ohlcvData.map((row, idx) => {
            const result = { ...row };

            if (idx > 0) {
                const prev = ohlcvData[idx - 1];
                
                result.daily_low_higher = row.low > prev.low;
                result.daily_high_higher = row.high > prev.high;
                result.daily_close_higher = row.close > prev.close;

                const allHigher = result.daily_low_higher && result.daily_high_higher && result.daily_close_higher;
                const crossWarn = !result.daily_low_higher;

                if (allHigher) {
                    result.daily_compare_flag = 'neutral';
                } else if (crossWarn) {
                    result.daily_compare_flag = 'cross';
                } else {
                    result.daily_compare_flag = '';
                }
            }

            return result;
        });

        return Response.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('Daily compare calculation error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});