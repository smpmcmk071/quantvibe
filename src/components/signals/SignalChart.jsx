import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from "date-fns";

export default function SignalChart({ data, ticker }) {
  const chartData = data.map(d => ({
    date: format(new Date(d.date), 'MM/dd'),
    Close: d.close,
    EMA_9: d.ema_9,
    EMA_34: d.ema_34,
    EMA_200: d.ema_200,
    RSI: d.rsi,
    signal: d.final_signal
  })).reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle>📈 {ticker} - Price & Technical Indicators (30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="Close" stroke="#1e40af" strokeWidth={2} dot={false} />
            <Line yAxisId="left" type="monotone" dataKey="EMA_9" stroke="#10b981" strokeWidth={1} dot={false} />
            <Line yAxisId="left" type="monotone" dataKey="EMA_34" stroke="#f59e0b" strokeWidth={1} dot={false} />
            <Line yAxisId="left" type="monotone" dataKey="EMA_200" stroke="#ef4444" strokeWidth={1} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="RSI" stroke="#8b5cf6" strokeWidth={1} dot={false} />
            <ReferenceLine yAxisId="right" y={70} stroke="#ef4444" strokeDasharray="3 3" />
            <ReferenceLine yAxisId="right" y={30} stroke="#10b981" strokeDasharray="3 3" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}