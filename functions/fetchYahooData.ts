import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { ticker, interval = '1d', period = '30d' } = await req.json();

        if (!ticker) {
            return Response.json({ error: 'Ticker is required' }, { status: 400 });
        }

        // Rate limiting: Add delay between requests to respect Yahoo Finance limits
        // Yahoo Finance allows ~2000 requests/hour, so ~1 request every 2 seconds is safe
        await new Promise(resolve => setTimeout(resolve, 2000));

        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
        const params = new URLSearchParams({
            interval: interval,
            range: period
        });

        const response = await fetch(`${yahooUrl}?${params}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        if (!response.ok) {
            return Response.json({ 
                error: `Yahoo Finance API error: ${response.status}`,
                details: 'Ticker may not exist or API rate limit reached'
            }, { status: response.status });
        }

        const data = await response.json();

        if (!data.chart?.result?.[0]) {
            return Response.json({ 
                error: 'No data returned from Yahoo Finance',
                ticker: ticker
            }, { status: 404 });
        }

        const result = data.chart.result[0];
        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};

        const ohlcvData = timestamps.map((ts, idx) => ({
            date: new Date(ts * 1000).toISOString().split('T')[0],
            timestamp: ts,
            open: quote.open?.[idx],
            high: quote.high?.[idx],
            low: quote.low?.[idx],
            close: quote.close?.[idx],
            volume: quote.volume?.[idx]
        })).filter(row => row.close !== null && row.close !== undefined);

        // Calculate basic metrics
        for (let i = 0; i < ohlcvData.length; i++) {
            if (i > 0) {
                const prevClose = ohlcvData[i - 1].close;
                ohlcvData[i].return_1d = ((ohlcvData[i].close - prevClose) / prevClose) * 100;
            }
        }

        return Response.json({
            success: true,
            ticker: ticker.toUpperCase(),
            interval: interval,
            period: period,
            data: ohlcvData,
            count: ohlcvData.length
        });

    } catch (error) {
        console.error('Yahoo fetch error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to fetch data from Yahoo Finance'
        }, { status: 500 });
    }
});