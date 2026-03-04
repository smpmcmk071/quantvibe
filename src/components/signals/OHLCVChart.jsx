import React, { useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CustomCandlestick = (props) => {
  const { x, y, width, payload } = props;
  if (!payload || payload.open == null) return null;

  const { open, close, high, low } = payload;
  const isUp = close >= open;
  const color = isUp ? '#16a34a' : '#dc2626';
  const bodyTop = Math.min(open, close);
  const bodyBottom = Math.max(open, close);
  const scale = props.yAxisMap?.[0]?.scale || props.scale;

  // Use the pre-computed y values from recharts
  const yOpen = props.yOpen;
  const yClose = props.yClose;
  const yHigh = props.yHigh;
  const yLow = props.yLow;

  if (yOpen == null) return null;

  const candleWidth = Math.max(width * 0.6, 2);
  const centerX = x + width / 2;

  return (
    <g>
      {/* High-Low wick */}
      <line x1={centerX} y1={yHigh} x2={centerX} y2={yLow} stroke={color} strokeWidth={1} />
      {/* Body */}
      <rect
        x={centerX - candleWidth / 2}
        y={Math.min(yOpen, yClose)}
        width={candleWidth}
        height={Math.max(Math.abs(yOpen - yClose), 1)}
        fill={color}
        stroke={color}
      />
    </g>
  );
};

const CandlestickBar = (props) => {
  const { x, width, yAxisMap, payload, index, data } = props;
  if (!payload || !data) return null;
  const row = data[index];
  if (!row) return null;

  const yAxis = props.viewBox ? null : yAxisMap?.['0'] || yAxisMap?.[0];
  const toY = (val) => {
    if (!yAxis) return 0;
    return yAxis.scale(val);
  };

  return (
    <CustomCandlestick
      x={x}
      width={width}
      payload={row}
      yOpen={toY(row.open)}
      yClose={toY(row.close)}
      yHigh={toY(row.high)}
      yLow={toY(row.low)}
    />
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-slate-500">Open</span><span className="font-medium">${d.open?.toFixed(2)}</span>
        <span className="text-slate-500">High</span><span className="font-medium text-green-600">${d.high?.toFixed(2)}</span>
        <span className="text-slate-500">Low</span><span className="font-medium text-red-600">${d.low?.toFixed(2)}</span>
        <span className="text-slate-500">Close</span><span className="font-medium">${d.close?.toFixed(2)}</span>
        {d.volume != null && <><span className="text-slate-500">Volume</span><span className="font-medium">{(d.volume / 1e6).toFixed(2)}M</span></>}
        {d.rsi != null && <><span className="text-slate-500">RSI</span><span className={`font-medium ${d.rsi > 70 ? 'text-red-600' : d.rsi < 30 ? 'text-green-600' : ''}`}>{d.rsi?.toFixed(1)}</span></>}
      </div>
    </div>
  );
};

export default function OHLCVChart({ data, ticker, interval }) {
  const [view, setView] = useState('price'); // 'price' | 'volume' | 'rsi'

  // Data is newest-first from the table; reverse for chart (oldest→newest)
  const chartData = [...data].reverse().map(row => ({
    ...row,
    label: row.timestamp
      ? new Date(row.timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : row.date,
  }));

  const prices = chartData.map(d => d.close).filter(Boolean);
  const priceMin = Math.min(...chartData.map(d => d.low).filter(Boolean)) * 0.998;
  const priceMax = Math.max(...chartData.map(d => d.high).filter(Boolean)) * 1.002;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>📊 {ticker} Chart — {interval}</CardTitle>
          <div className="flex gap-1">
            {['price', 'volume', 'rsi'].map(v => (
              <Button key={v} size="sm" variant={view === v ? 'default' : 'outline'}
                className="text-xs capitalize" onClick={() => setView(v)}>
                {v}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === 'price' && (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[priceMin, priceMax]} tick={{ fontSize: 10 }} tickFormatter={v => `$${v.toFixed(0)}`} width={60} />
              <Tooltip content={<CustomTooltip />} />
              {/* Price line as fallback visual */}
              <Line type="monotone" dataKey="close" stroke="#3b82f6" dot={false} strokeWidth={1.5} name="Close" />
              <Line type="monotone" dataKey="high" stroke="#16a34a" dot={false} strokeWidth={0.8} strokeDasharray="2 2" name="High" />
              <Line type="monotone" dataKey="low" stroke="#dc2626" dot={false} strokeWidth={0.8} strokeDasharray="2 2" name="Low" />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {view === 'volume' && (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1e6).toFixed(0)}M`} width={55} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="volume" name="Volume"
                fill="#94a3b8"
                label={false}
                shape={(props) => {
                  const { x, y, width, height, payload } = props;
                  const color = payload?.close >= payload?.open ? '#86efac' : '#fca5a5';
                  return <rect x={x} y={y} width={width} height={height} fill={color} />;
                }}
              />
              <Line type="monotone" dataKey="close" stroke="#3b82f6" dot={false} strokeWidth={1.5} yAxisId={0} name="Close" />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {view === 'rsi' && (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={35} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={70} stroke="#dc2626" strokeDasharray="4 2" label={{ value: 'OB 70', position: 'right', fontSize: 10, fill: '#dc2626' }} />
              <ReferenceLine y={30} stroke="#16a34a" strokeDasharray="4 2" label={{ value: 'OS 30', position: 'right', fontSize: 10, fill: '#16a34a' }} />
              <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="2 2" />
              <Line type="monotone" dataKey="rsi" stroke="#8b5cf6" dot={false} strokeWidth={2} name="RSI" connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}