import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, CheckCircle, AlertCircle, Loader2, Zap } from "lucide-react";

export default function Admin() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [settingTier, setSettingTier] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    
    try {
      const fileUrl = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6914f8d4d7a77bd1578389d6/e71e8716a_tradingsignals.txt';
      
      const response = await base44.functions.invoke('importSignals', { file_url: fileUrl });
      
      setResult({
        success: true,
        message: response.data.message,
        total: response.data.total_lines
      });
    } catch (error) {
      setResult({
        success: false,
        message: error.message
      });
    } finally {
      setImporting(false);
    }
  };

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

        {/* Import Signals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Import Trading Signals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Import your CSV data file into the TradingSignal database. This will process the uploaded file and create all signal records.
            </p>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Note:</strong> This imports the file you uploaded. Make sure it's in the correct CSV format with all required columns.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleImport} 
              disabled={importing}
              size="lg"
              className="w-full"
            >
              {importing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Importing... This may take a few minutes
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Start Import
                </>
              )}
            </Button>

            {result && (
              <Alert className={result.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
                {result.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription>
                  <div className="space-y-1">
                    <p className={result.success ? "text-green-800 font-semibold" : "text-red-800 font-semibold"}>
                      {result.success ? '✅ Import Successful!' : '❌ Import Failed'}
                    </p>
                    <p className="text-sm">{result.message}</p>
                    {result.total && (
                      <p className="text-sm font-mono">
                        Total records processed: {result.total.toLocaleString()}
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">📋 Import Instructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-blue-800 space-y-2">
            <p><strong>Step 1:</strong> Click "Activate Elite Tier" to get full access</p>
            <p><strong>Step 2:</strong> Click "Start Import" to load your CSV data</p>
            <p><strong>Step 3:</strong> Wait for completion (may take 2-5 minutes for large files)</p>
            <p><strong>Step 4:</strong> Go to Dashboard and search for tickers!</p>
            <p className="pt-2 border-t border-blue-300 mt-4">
              💡 <strong>Tip:</strong> The import happens in batches of 100 records to ensure stability.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}