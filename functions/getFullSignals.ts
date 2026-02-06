import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { ticker, interval, period, config = {} } = await req.json();

        if (!ticker) {
            return Response.json({ error: 'Ticker is required' }, { status: 400 });
        }

        // Step 1: Fetch raw OHLCV data
        const fetchResponse = await base44.asServiceRole.functions.invoke('fetchYahooData', {
            ticker,
            interval,
            period
        });

        if (!fetchResponse.data.data || fetchResponse.data.error) {
            return Response.json({ 
                error: fetchResponse.data.error || 'Failed to fetch data' 
            }, { status: 400 });
        }

        let layeredData = fetchResponse.data.data;

        // Step 2: Layer EMA indicators
        const emaResponse = await base44.asServiceRole.functions.invoke('calculateEMAIndicators', {
            data: layeredData,
            config
        });

        if (emaResponse.data.error) {
            return Response.json({ 
                error: `EMA calculation failed: ${emaResponse.data.error}` 
            }, { status: 500 });
        }

        layeredData = emaResponse.data.data;

        // Step 3: Layer RSI indicators
        const rsiResponse = await base44.asServiceRole.functions.invoke('calculateRSI', {
            data: layeredData,
            config
        });

        if (rsiResponse.data.error) {
            return Response.json({ 
                error: `RSI calculation failed: ${rsiResponse.data.error}` 
            }, { status: 500 });
        }

        layeredData = rsiResponse.data.data;

        // Step 4: Layer Volume indicators
        const volumeResponse = await base44.asServiceRole.functions.invoke('calculateVolume', {
            data: layeredData,
            config
        });

        if (volumeResponse.data.error) {
            return Response.json({ 
                error: `Volume calculation failed: ${volumeResponse.data.error}` 
            }, { status: 500 });
        }

        layeredData = volumeResponse.data.data;

        // Return fully layered data
        return Response.json({
            success: true,
            ticker,
            interval,
            period,
            count: layeredData.length,
            data: layeredData
        });

    } catch (error) {
        console.error('Full signals orchestration error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to build full signal stack'
        }, { status: 500 });
    }
});