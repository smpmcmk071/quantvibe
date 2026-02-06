import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

        // Process each row with numerology calculations
        const enrichedData = data.map((row) => {
            if (!row.date) return row;

            const [yearStr, monthStr, dayStr] = row.date.split('-');
            const month = parseInt(monthStr, 10);
            const day = parseInt(dayStr, 10);
            const year = parseInt(yearStr, 10);

            // Individual vibes
            const day_vibe = reduceToSingleDigit(day, true);
            const month_vibe = reduceToSingleDigit(month, true);
            const year_sum = String(year).split('').reduce((a, b) => a + parseInt(b), 0);
            const year_vibe = reduceToSingleDigit(year_sum, true);

            // Full Date EASTERN (digit-by-digit, Month+Day+Year)
            const full_date_eastern_sum = String(`${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}${year}`)
                .split('')
                .reduce((a, b) => a + parseInt(b), 0);
            const full_date_eastern = reduceToSingleDigit(full_date_eastern_sum, true);

            // Full Date WESTERN (component sum: Month + Day + Year)
            const full_date_western_sum = month + day + year;
            const full_date_western = reduceToSingleDigit(full_date_western_sum, true);

            // Get meanings and signals
            const numerology_meaning = getNumerologyMeaning(full_date_western);
            const numerology_signal = getNumerologySignal(full_date_western);

            // Detect master numbers
            const master_numbers = [11, 22, 33];
            const master_locations = [];
            
            if (master_numbers.includes(day_vibe)) master_locations.push(`day:${day_vibe}`);
            if (master_numbers.includes(month_vibe)) master_locations.push(`month:${month_vibe}`);
            if (master_numbers.includes(year_vibe)) master_locations.push(`year:${year_vibe}`);
            if (master_numbers.includes(full_date_eastern)) master_locations.push(`eastern:${full_date_eastern}`);
            if (master_numbers.includes(full_date_western)) master_locations.push(`western:${full_date_western}`);

            return {
                ...row,
                day_vibe,
                month_vibe,
                year_vibe,
                full_date_eastern,
                full_date_western,
                numerology_meaning,
                numerology_signal,
                has_master_number: master_locations.length > 0,
                master_locations: master_locations.join(' | ')
            };
        });

        return Response.json({
            success: true,
            data: enrichedData,
            count: enrichedData.length
        });

    } catch (error) {
        console.error('Numerology error:', error);
        return Response.json({ 
            error: error.message,
            details: 'Failed to calculate numerology signals'
        }, { status: 500 });
    }
});

function reduceToSingleDigit(num, keepMaster = true) {
    while (num > 9) {
        if (keepMaster && [11, 22, 33].includes(num)) {
            return num;
        }
        num = String(num).split('').reduce((a, b) => a + parseInt(b), 0);
    }
    return num;
}

function getNumerologyMeaning(number) {
    const meanings = {
        1: "Leadership, Independence, New Beginnings",
        2: "Balance, Partnership, Diplomacy",
        3: "Creativity, Expression, Joy",
        4: "Stability, Foundation, Hard Work",
        5: "Change, Freedom, Adventure",
        6: "Harmony, Responsibility, Love",
        7: "Spirituality, Analysis, Wisdom",
        8: "Abundance, Power, Success",
        9: "Completion, Compassion, Universal Love",
        11: "Master Intuition, Spiritual Insight, Enlightenment",
        22: "Master Builder, Large-Scale Manifestation, Visionary",
        33: "Master Teacher, Healing, Compassion"
    };
    return meanings[number] || "Unknown";
}

function getNumerologySignal(number) {
    if (number === 11) return "MASTER_11_INTUITION";
    if (number === 22) return "MASTER_22_BUILD";
    if (number === 33) return "MASTER_33_TEACH";
    if (number === 8) return "ABUNDANCE_DAY";
    if (number === 1) return "NEW_BEGINNING";
    if (number === 9) return "COMPLETION";
    return "NEUTRAL";
}