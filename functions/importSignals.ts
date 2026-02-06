import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const { file_url } = await req.json();

        if (!file_url) {
            return Response.json({ error: 'file_url is required' }, { status: 400 });
        }

        // Fetch the CSV file
        const response = await fetch(file_url);
        const csvText = await response.text();

        // Parse CSV
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
        
        const records = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            // Simple CSV parser (handles quoted values)
            const values = [];
            let current = '';
            let inQuotes = false;
            
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            values.push(current.trim());

            // Map to entity fields
            const record = {
                ticker: values[headers.indexOf('ticker')]?.replace(/"/g, ''),
                source: values[headers.indexOf('source')]?.replace(/"/g, '') || 'yahoo',
                date: values[headers.indexOf('ts')]?.replace(/"/g, '').split(' ')[0],
                open: parseFloat(values[headers.indexOf('open')]) || null,
                high: parseFloat(values[headers.indexOf('high')]) || null,
                low: parseFloat(values[headers.indexOf('low')]) || null,
                close: parseFloat(values[headers.indexOf('close')]) || null,
                volume: parseFloat(values[headers.indexOf('volume')]) || null,
                close_pct_change: parseFloat(values[headers.indexOf('close_pct_change')]) || null,
                ema_9: parseFloat(values[headers.indexOf('ema_9')]) || null,
                ema_13: parseFloat(values[headers.indexOf('ema_13')]) || null,
                ema_34: parseFloat(values[headers.indexOf('ema_34')]) || null,
                ema_65: parseFloat(values[headers.indexOf('ema_65')]) || null,
                ema_200: parseFloat(values[headers.indexOf('ema_200')]) || null,
                buy_cross: values[headers.indexOf('buy_cross')] === 'True',
                sell_cross: values[headers.indexOf('sell_cross')] === 'True',
                buy_cross_9_34: values[headers.indexOf('buy_cross_9_34')] === 'True',
                sell_cross_9_34: values[headers.indexOf('sell_cross_9_34')] === 'True',
                rsi: parseFloat(values[headers.indexOf('rsi')]) || null,
                rsi_signal: values[headers.indexOf('rsi_signal')]?.replace(/"/g, ''),
                rsi_bull_div: values[headers.indexOf('rsi_bull_div')] === 'True',
                rsi_bear_div: values[headers.indexOf('rsi_bear_div')] === 'True',
                macd_line: parseFloat(values[headers.indexOf('macd_line')]) || null,
                macd_signal: parseFloat(values[headers.indexOf('macd_signal')]) || null,
                macd_histogram: parseFloat(values[headers.indexOf('macd_histogram')]) || null,
                macd_cross_up: values[headers.indexOf('macd_cross_up')] === 'True',
                macd_cross_down: values[headers.indexOf('macd_cross_down')] === 'True',
                bb_upper: parseFloat(values[headers.indexOf('bb_upper')]) || null,
                bb_middle: parseFloat(values[headers.indexOf('bb_middle')]) || null,
                bb_lower: parseFloat(values[headers.indexOf('bb_lower')]) || null,
                bb_position: parseFloat(values[headers.indexOf('bb_position')]) || null,
                bb_squeeze: values[headers.indexOf('bb_squeeze')] === 'True',
                vol_spike: values[headers.indexOf('vol_spike')] === 'True',
                vol_trend: values[headers.indexOf('vol_trend')]?.replace(/"/g, ''),
                final_signal: values[headers.indexOf('final_signal')]?.replace(/"/g, ''),
                numerology_greg_date: values[headers.indexOf('numerology_greg_date')]?.replace(/"/g, ''),
                numerology_meaning: values[headers.indexOf('numerology_meaning')]?.replace(/"/g, ''),
                numerology_signal: values[headers.indexOf('numerology_signal')]?.replace(/"/g, ''),
                hebrew_date: values[headers.indexOf('hebrew_date')]?.replace(/"/g, ''),
                hebrew_day_vibe: parseInt(values[headers.indexOf('hebrew_day_vibe')]) || null,
                hebrew_month_vibe: parseInt(values[headers.indexOf('hebrew_month_vibe')]) || null,
                hebrew_year_vibe: parseInt(values[headers.indexOf('hebrew_year_vibe')]) || null,
                hebrew_meaning: values[headers.indexOf('hebrew_meaning')]?.replace(/"/g, ''),
                hebrew_holiday_alert: values[headers.indexOf('hebrew_holiday_alert')]?.replace(/"/g, ''),
                has_master_number: values[headers.indexOf('has_master_number')] === 'True',
                master_locations: values[headers.indexOf('master_locations')]?.replace(/"/g, ''),
                day_vibe: parseInt(values[headers.indexOf('day_vibe')]) || null,
                month_vibe: parseInt(values[headers.indexOf('month_vibe')]) || null,
                year_vibe: parseInt(values[headers.indexOf('year_vibe')]) || null,
                shemitah_year_position: parseInt(values[headers.indexOf('shemitah_year_position')]) || null,
                shemitah_alert: values[headers.indexOf('shemitah_alert')]?.replace(/"/g, '')
            };

            // Only add valid records
            if (record.ticker && record.date) {
                records.push(record);
            }

            // Bulk insert in batches of 100
            if (records.length >= 100) {
                await base44.asServiceRole.entities.TradingSignal.bulkCreate(records);
                records.length = 0; // Clear array
            }
        }

        // Insert remaining records
        if (records.length > 0) {
            await base44.asServiceRole.entities.TradingSignal.bulkCreate(records);
        }

        return Response.json({ 
            success: true, 
            message: `Imported ${lines.length - 1} signals successfully`,
            total_lines: lines.length - 1
        });

    } catch (error) {
        console.error('Import error:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack 
        }, { status: 500 });
    }
});