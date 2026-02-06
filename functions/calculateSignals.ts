import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Fetch OHLCV data
        const yahooResponse = await base44.functions.invoke('fetchYahooData', {
            ticker,
            interval,
            period
        });

        if (yahooResponse.data.error || !yahooResponse.data.data) {
            return Response.json({ 
                error: yahooResponse.data.error || 'No data returned',
                ticker 
            }, { status: 404 });
        }

        let data = yahooResponse.data.data;

        // Calculate EMA indicators
        const emaResponse = await base44.functions.invoke('calculateEMA', {
            data,
            config
        });
        data = emaResponse.data.data;

        // Calculate Bollinger Bands
        const bbResponse = await base44.functions.invoke('calculateBollingerBands', {
            data,
            config
        });
        data = bbResponse.data.data;

        // Calculate Volume indicators
        const volumeResponse = await base44.functions.invoke('calculateVolume', {
            data,
            config
        });
        data = volumeResponse.data.data;

        // Calculate Daily Compare
        const dailyResponse = await base44.functions.invoke('calculateDailyCompare', {
            data
        });
        data = dailyResponse.data.data;

        // Generate final signal
        data = data.map(row => {
            const signals = [];
            
            // EMA signals
            if (row.buy_cross || row.buy_cross_9_34) signals.push('BUY');
            if (row.sell_cross || row.sell_cross_9_34) signals.push('SELL');
            
            // Bollinger signals
            if (row.bb_signal === 'bb_breakout_buy' || row.bb_signal === 'bb_oversold') signals.push('BUY');
            if (row.bb_signal === 'bb_breakout_sell' || row.bb_signal === 'bb_overbought') signals.push('SELL');
            
            // Volume signals
            if (row.volume_signal === 'vol_buy') signals.push('BUY');
            if (row.volume_signal === 'vol_sell') signals.push('SELL');
            
            // Daily compare
            if (row.daily_compare_flag === 'cross') signals.push('SELL');

            // Determine final signal
            const buyCount = signals.filter(s => s === 'BUY').length;
            const sellCount = signals.filter(s => s === 'SELL').length;

            if (buyCount > sellCount && buyCount >= 2) {
                row.final_signal = 'BUY';
            } else if (sellCount > buyCount && sellCount >= 2) {
                row.final_signal = 'SELL';
            } else {
                row.final_signal = 'HOLD';
            }

            return row;
        });

        return Response.json({
            success: true,
            ticker: ticker.toUpperCase(),
            interval,
            period,
            count: data.length,
            data: data
        });

    } catch (error) {
        console.error('Signal calculation error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to calculate trading signals'
        }, { status: 500 });
    }
});