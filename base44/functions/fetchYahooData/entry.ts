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

        // Validate interval - minimum is 15m
        const allowedIntervals = ['15m', '30m', '1h', '1d', '1wk', '1mo'];
        if (!allowedIntervals.includes(interval)) {
            return Response.json({ 
                error: `Invalid interval "${interval}". Minimum supported interval is 15m. Allowed: ${allowedIntervals.join(', ')}`
            }, { status: 400 });
        }

        // Adaptive rate limiting based on interval type
        const delayMap = { '15m': 2000, '30m': 1500, '1h': 1000, '1d': 500, '1wk': 500, '1mo': 500 };
        const delay = delayMap[interval] || 1000;

        // Fetch with exponential backoff retry
        const fetchWithRetry = async (url, options, retries = 3) => {
            for (let attempt = 0; attempt < retries; attempt++) {
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
                const res = await fetch(url, options);
                if (res.status === 429) {
                    // Rate limited - wait longer before retry
                    if (attempt < retries - 1) continue;
                    return Response.json({ error: 'Yahoo Finance rate limit reached. Please wait a moment and try again.' }, { status: 429 });
                }
                return res;
            }
        };

        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
        const params = new URLSearchParams({
            interval: interval,
            range: period
        });

        const response = await fetchWithRetry(`${yahooUrl}?${params}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (!response.ok) {
            return Response.json({ 
                error: `Yahoo Finance API error: ${response.status}`,
                details: response.status === 404 ? 'Ticker not found' : 'API rate limit reached or service unavailable'
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

        // Keep in chronological order (oldest to newest) for calculations

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