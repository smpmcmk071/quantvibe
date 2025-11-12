import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Calendar, DollarSign } from "lucide-react";
import { format } from "date-fns";

export default function SignalCard({ signal }) {
  const getSignalBadge = (finalSignal) => {
    if (finalSignal === 'BUY') return <Badge className="bg-green-600">BUY</Badge>;
    if (finalSignal === 'SELL') return <Badge className="bg-red-600">SELL</Badge>;
    return <Badge variant="outline">HOLD</Badge>;
  };

  const getSignalIcon = (finalSignal) => {
    if (finalSignal === 'BUY') return <TrendingUp className="w-5 h-5 text-green-600" />;
    if (finalSignal === 'SELL') return <TrendingDown className="w-5 h-5 text-red-600" />;
    return <Minus className="w-5 h-5 text-gray-400" />;
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {getSignalIcon(signal.final_signal)}
            <div>
              <CardTitle className="text-xl">{signal.ticker}</CardTitle>
              <p className="text-sm text-gray-500">{signal.source}</p>
            </div>
          </div>
          {getSignalBadge(signal.final_signal)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="w-4 h-4" />
            {format(new Date(signal.date), 'MMM dd, yyyy')}
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-600" />
            <span className="font-semibold">${signal.close?.toFixed(2)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2 border-t">
          <div>
            <p className="text-xs text-gray-500">RSI</p>
            <p className="font-semibold text-sm">{signal.rsi?.toFixed(1) || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Volume</p>
            <p className="font-semibold text-sm">
              {signal.volume ? (signal.volume / 1000000).toFixed(1) + 'M' : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Change</p>
            <p className={`font-semibold text-sm ${signal.close_pct_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {signal.close_pct_change?.toFixed(2)}%
            </p>
          </div>
        </div>

        {signal.has_master_number && (
          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
            🔮 Master Number Day
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}