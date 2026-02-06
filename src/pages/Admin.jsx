import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Zap } from "lucide-react";

export default function Admin() {
  const [settingTier, setSettingTier] = useState(false);

  const setEliteTier = async () => {
    setSettingTier(true);
    try {
      await base44.auth.updateMe({
        tier: 'elite',
        daily_pulls_limit: 999999,
        has_macro_access: true,
        has_numerology_premium: true,
        has_auction_premium: true,
        max_tickers: 50,
        allowed_modules: ['bollinger', 'rsi', 'macd', 'ema', 'volume', 'numerology', 'auction', 'hebrew']
      });
      
      alert('✅ Elite tier activated! Refresh the page to see changes.');
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setSettingTier(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">⚙️ Admin Panel</h1>
          <p className="text-slate-600">Import data and manage your account</p>
        </div>

        {/* Set Elite Tier */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-600" />
              Activate Elite Tier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Click below to activate Elite tier with full access to all features.
            </p>
            <Button 
              onClick={setEliteTier} 
              disabled={settingTier}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {settingTier ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Activating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Activate Elite Tier
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}