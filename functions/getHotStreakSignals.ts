import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, config = {} } = await req.json();

        if (!Array.isArray(data) || data.length === 0) {
            return Response.json({ error: 'Data array is required' }, { status: 400 });
        }

        const lookback_hours = config.lookback_hours || 240; // 10 days default
        const strength_threshold = config.strength_threshold || 50;

        // Find compatible EMA and buy_cross columns
        let fast_ema = null;
        let buy_cross_col = null;

        const row = data[0];
        if (row.ema_fast && row.buy_cross) {
            fast_ema = 'ema_fast';
            buy_cross_col = 'buy_cross';
        } else if (row.ema_8 && row.buy_cross) {
            fast_ema = 'ema_8';
            buy_cross_col = 'buy_cross';
        } else if (row.ema_8 && row.buy_cross_8_200) {
            fast_ema = 'ema_8';
            buy_cross_col = 'buy_cross_8_200';
        } else if (row.ema_20 && row.buy_cross_20_50) {
            fast_ema = 'ema_20';
            buy_cross_col = 'buy_cross_20_50';
        } else if (row.ema_34 && row.buy_cross) {
            fast_ema = 'ema_34';
            buy_cross_col = 'buy_cross';
        }

        if (!fast_ema || !buy_cross_col) {
            console.log('⚠️  Hot Streak: No compatible EMA columns found');
            return Response.json({
                data: data.map(row => ({
                    ...row,
                    hot_streak_active: false,
                    hot_streak_strength: 0,
                    hot_streak_signal: 'NO_SETUP'
                }))
            });
        }

        // Get all buy cross timestamps
        const cross_timestamps = data
            .map((row, idx) => row[buy_cross_col] ? { ts: new Date(row.date || row.timestamp * 1000), idx } : null)
            .filter(Boolean);

        if (cross_timestamps.length === 0) {
            console.log('ℹ️  Hot Streak: No buy crosses detected');
            return Response.json({
                data: data.map(row => ({
                    ...row,
                    hot_streak_active: false,
                    hot_streak_strength: 0,
                    hot_streak_signal: 'NO_SETUP'
                }))
            });
        }

        const lookback_ms = lookback_hours * 60 * 60 * 1000;

        // Enrich data with hot streak calculations
        const enriched = data.map((row, idx) => {
            const row_ts = new Date(row.date || row.timestamp * 1000);

            // TIME-BASED CROSSOVER DETECTION (GAP-AWARE)
            const recent_cross = cross_timestamps.some(cross => {
                const time_diff = row_ts - cross.ts;
                return time_diff >= 0 && time_diff <= lookback_ms;
            });

            // MOMENTUM STRENGTH CALCULATION
            const ema_val = row[fast_ema];
            const close_val = row.close;

            if (!ema_val || !close_val) {
                return {
                    ...row,
                    hot_streak_active: false,
                    hot_streak_strength: 0,
                    hot_streak_signal: 'NO_SETUP'
                };
            }

            let strength = 0;

            // Price above EMA percentage (0-100 scale)
            const price_above_pct = Math.max(0, ((close_val - ema_val) / ema_val) * 100);
            strength += price_above_pct * 0.2; // 0-20 points

            // Recent crossover boost
            if (recent_cross) {
                strength += 30; // 30 points for recent cross
            }

            // Price rising (compare to 3 bars back)
            if (idx >= 3 && close_val > data[idx - 3].close) {
                strength += 20; // 20 points for rising price
            }

            // Volume increasing (vs 20-bar MA)
            if (row.volume) {
                let vol_sum = 0;
                let vol_count = 0;
                for (let i = Math.max(0, idx - 19); i <= idx; i++) {
                    if (data[i].volume) {
                        vol_sum += data[i].volume;
                        vol_count++;
                    }
                }
                const vol_ma = vol_count > 0 ? vol_sum / vol_count : 0;
                if (row.volume > vol_ma) {
                    strength += 10; // 10 points for volume increase
                }
            }

            // Cap at 100
            strength = Math.min(100, strength);

            // Determine hot_streak_active
            const hot_streak_active = strength >= strength_threshold && recent_cross;

            // Determine signal
            let signal = 'WAITING';
            if (hot_streak_active) {
                signal = 'RIDE_MOMENTUM';
            } else if (idx > 0) {
                const prev_active = data[idx - 1].hot_streak_active;
                const momentum_fading = strength < strength_threshold * 0.7;
                if (prev_active && !hot_streak_active && momentum_fading) {
                    signal = 'STREAK_ENDING';
                } else if (!recent_cross) {
                    signal = 'NO_SETUP';
                }
            } else if (!recent_cross) {
                signal = 'NO_SETUP';
            }

            return {
                ...row,
                hot_streak_active,
                hot_streak_strength: strength,
                hot_streak_signal: signal
            };
        });

        const active_count = enriched.filter(row => row.hot_streak_active).length;
        const max_strength = Math.max(...enriched.map(row => row.hot_streak_strength));

        console.log(`✓ Hot Streak: ${active_count} active periods detected (max strength: ${max_strength.toFixed(1)})`);
        console.log(`ℹ️  Lookback: ${lookback_hours} hours (${(lookback_hours / 24).toFixed(1)} days)`);

        return Response.json({ data: enriched });

    } catch (error) {
        console.error('Hot Streak error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to calculate hot streak signals'
        }, { status: 500 });
    }
});