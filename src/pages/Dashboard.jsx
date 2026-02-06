import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Download, Star, Settings, TrendingUp, Database, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import SignalCard from "../components/signals/SignalCard";
import SignalChart from "../components/signals/SignalChart";
import AccessControl from "../components/AccessControl";

export default function Dashboard() {
  const [ticker, setTicker] = useState('');
  const [source, setSource] = useState('yahoo');
  const [interval, setInterval] = useState('1d');
  const [period, setPeriod] = useState('30d');
  const [searchResults, setSearchResults] = useState([]);
  const [yahooData, setYahooData] = useState(null);
  const [isLoadingYahoo, setIsLoadingYahoo] = useState(false);
  const [user, setUser] = useState(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const queryClient = useQueryClient();

  // Column configuration by indicator
  const [visibleColumns, setVisibleColumns] = useState({
    // Core (always visible)
    date: true,
    close: true,
    change_pct: true,
    volume: true,
    final_signal: true,
    
    // RSI Module
    rsi: true,
    rsi_signal: false,
    rsi_bull_div: false,
    rsi_bear_div: false,
    
    // EMA Module
    ema_cross: true,
    ema_9: false,
    ema_34: false,
    ema_200: false,
    
    // MACD Module
    macd_cross: true,
    macd_line: false,
    macd_histogram: false,
    
    // Bollinger Module
    bb_signal: true,
    bb_position: true,
    bb_upper: false,
    bb_lower: false,
    
    // Volume Module
    vol_spike: true,
    vol_trend: false,
    
    // Numerology Module (Premium)
    numerology_master: true,
    numerology_meaning: false,
    hebrew_date: false,
    hebrew_holiday: false,
    shemitah_alert: false
  });

  const columnGroups = {
    core: {
      name: 'Core Data',
      premium: false,
      columns: ['date', 'close', 'change_pct', 'volume', 'final_signal']
    },
    rsi: {
      name: 'RSI Indicator',
      premium: false,
      columns: ['rsi', 'rsi_signal', 'rsi_bull_div', 'rsi_bear_div']
    },
    ema: {
      name: 'EMA Indicators',
      premium: false,
      columns: ['ema_cross', 'ema_9', 'ema_34', 'ema_200']
    },
    macd: {
      name: 'MACD Indicator',
      premium: false,
      columns: ['macd_cross', 'macd_line', 'macd_histogram']
    },
    bollinger: {
      name: 'Bollinger Bands',
      premium: false,
      columns: ['bb_signal', 'bb_position', 'bb_upper', 'bb_lower']
    },
    volume: {
      name: 'Volume Analysis',
      premium: false,
      columns: ['vol_spike', 'vol_trend']
    },
    numerology: {
      name: 'Numerology (Premium)',
      premium: true,
      requiredAccess: 'has_numerology_premium',
      columns: ['numerology_master', 'numerology_meaning', 'hebrew_date', 'hebrew_holiday', 'shemitah_alert']
    }
  };

  const toggleColumn = (col) => {
    setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const toggleGroup = (groupKey) => {
    const group = columnGroups[groupKey];
    const allVisible = group.columns.every(col => visibleColumns[col]);
    const newState = { ...visibleColumns };
    group.columns.forEach(col => {
      newState[col] = !allVisible;
    });
    setVisibleColumns(newState);
  };

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const currentUser = await base44.auth.me();
    setUser(currentUser);
  };

  const { data: signals = [], isLoading } = useQuery({
    queryKey: ['signals', ticker, source],
    queryFn: async () => {
      if (!ticker) return [];
      const results = await base44.entities.TradingSignal.filter(
        { ticker: ticker.toUpperCase(), source },
        '-date',
        30
      );
      return results;
    },
    enabled: !!ticker
  });

  const { data: watchlist = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Watchlist.filter({ user_email: user.email });
    },
    enabled: !!user
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async (data) => await base44.entities.Watchlist.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] })
  });

  const handleSearch = async () => {
    if (!ticker) return;
    
    // Check rate limit
    if (user?.pulls_today >= user?.daily_pulls_limit) {
      alert('Daily limit reached! Upgrade to get more pulls.');
      return;
    }

    setIsLoadingYahoo(true);
    setYahooData(null);

    try {
      // Fetch raw OHLCV data only
      const response = await base44.functions.invoke('fetchYahooData', {
        ticker: ticker.toUpperCase(),
        interval: interval,
        period: period
      });

      if (response.data.error) {
        alert(response.data.error);
        return;
      }

      setYahooData(response.data);

      // Increment pulls counter
      const today = new Date().toISOString().split('T')[0];
      const pullsToday = user.last_pull_date === today ? user.pulls_today + 1 : 1;
      
      await base44.auth.updateMe({
        pulls_today: pullsToday,
        last_pull_date: today
      });

    } catch (error) {
      alert('Failed to fetch data: ' + error.message);
    } finally {
      setIsLoadingYahoo(false);
    }
  };

  const handleAddToWatchlist = () => {
    if (!user) return;
    
    if (watchlist.length >= user.max_tickers) {
      alert(`You can only track ${user.max_tickers} tickers on your tier. Upgrade for more!`);
      return;
    }

    addToWatchlistMutation.mutate({
      user_email: user.email,
      ticker: ticker.toUpperCase(),
      source
    });
  };

  const exportToCSV = () => {
    if (signals.length === 0) return;
    
    const headers = Object.keys(signals[0]).join(',');
    const rows = signals.map(s => Object.values(s).join(',')).join('\n');
    const csv = `${headers}\n${rows}`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ticker}_signals_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Loading...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">📊 QuantVibe</h1>
            <p className="text-slate-600">Quantitative Trading Signals Dashboard</p>
          </div>
          <Card className="px-4 py-2">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-slate-500">Tier</p>
                <p className="font-semibold capitalize">{user.tier}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Pulls Today</p>
                <p className="font-semibold">{user.pulls_today || 0} / {user.daily_pulls_limit}</p>
              </div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="search" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="search">
              <Search className="w-4 h-4 mr-2" />
              Search Signals
            </TabsTrigger>
            <TabsTrigger value="watchlist">
              <Star className="w-4 h-4 mr-2" />
              Watchlist ({watchlist.length})
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Search Tab */}
          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>🔍 Search Trading Signals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3 flex-wrap">
                  <Input
                    placeholder="Enter ticker (SPY, QQQ, BTC-USD...)"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="flex-1 min-w-[200px]"
                  />
                  <Select value={interval} onValueChange={setInterval}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1m">1m</SelectItem>
                      <SelectItem value="5m">5m</SelectItem>
                      <SelectItem value="15m">15m</SelectItem>
                      <SelectItem value="1h">1h</SelectItem>
                      <SelectItem value="1d">1d</SelectItem>
                      <SelectItem value="1wk">1wk</SelectItem>
                      <SelectItem value="1mo">1mo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7d">7 days</SelectItem>
                      <SelectItem value="30d">30 days</SelectItem>
                      <SelectItem value="60d">60 days</SelectItem>
                      <SelectItem value="90d">90 days</SelectItem>
                      <SelectItem value="1y">1 year</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleSearch} disabled={!ticker || isLoadingYahoo}>
                    {isLoadingYahoo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                    Fetch Data
                  </Button>
                </div>

                {(user.pulls_today >= user.daily_pulls_limit) && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Daily limit reached! Upgrade to <strong>Pro</strong> ($377/mo) for 50 pulls/day or <strong>Elite</strong> ($577/mo) for unlimited.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {yahooData && yahooData.data && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      📈 {yahooData.ticker} - OHLCV Data ({yahooData.count} rows)
                    </CardTitle>
                    <p className="text-sm text-slate-500">
                      Interval: {yahooData.interval} | Period: {yahooData.period}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-auto max-h-[600px]">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 border-b sticky top-0">
                          <tr>
                            <th className="px-2 py-2 text-left font-semibold">Timestamp</th>
                            <th className="px-2 py-2 text-right font-semibold">Open</th>
                            <th className="px-2 py-2 text-right font-semibold">High</th>
                            <th className="px-2 py-2 text-right font-semibold">Low</th>
                            <th className="px-2 py-2 text-right font-semibold">Close</th>
                            <th className="px-2 py-2 text-right font-semibold">Volume</th>
                            <th className="px-2 py-2 text-right font-semibold">Return %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yahooData.data.map((row, idx) => (
                            <tr key={idx} className={`border-b hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                              <td className="px-2 py-1.5 font-medium">
                                {row.timestamp ? new Date(row.timestamp * 1000).toLocaleString() : row.date}
                              </td>
                              <td className="px-2 py-1.5 text-right">${row.open?.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right">${row.high?.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right">${row.low?.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold">${row.close?.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right">{row.volume ? (row.volume / 1000000).toFixed(2) + 'M' : '-'}</td>
                              <td className={`px-2 py-1.5 text-right font-semibold ${row.return_1d > 0 ? 'text-green-600' : row.return_1d < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                {row.return_1d ? row.return_1d.toFixed(2) + '%' : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {signals.length > 0 && (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold">
                    Results for {ticker} ({signals.length} days)
                  </h3>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowColumnSettings(!showColumnSettings)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Columns
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleAddToWatchlist}>
                      <Star className="w-4 h-4 mr-2" />
                      Watchlist
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportToCSV}>
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </div>

                {/* Column Settings Panel */}
                {showColumnSettings && (
                  <Card className="bg-slate-50">
                    <CardHeader>
                      <CardTitle className="text-lg">📊 Column Visibility</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {Object.entries(columnGroups).map(([key, group]) => {
                          const hasAccess = !group.premium || user[group.requiredAccess];
                          return (
                            <div key={key} className={`border rounded-lg p-3 ${!hasAccess ? 'opacity-50 bg-gray-100' : 'bg-white'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-semibold text-sm flex items-center gap-1">
                                  {group.name}
                                  {group.premium && !hasAccess && <span className="text-xs text-red-600">🔒</span>}
                                </h4>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => hasAccess && toggleGroup(key)}
                                  disabled={!hasAccess}
                                  className="h-6 px-2 text-xs"
                                >
                                  {group.columns.every(col => visibleColumns[col]) ? 'Hide All' : 'Show All'}
                                </Button>
                              </div>
                              <div className="space-y-1">
                                {group.columns.map(col => (
                                  <label key={col} className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={visibleColumns[col]}
                                      onChange={() => hasAccess && toggleColumn(col)}
                                      disabled={!hasAccess}
                                      className="rounded"
                                    />
                                    <span className={!hasAccess ? 'text-gray-400' : ''}>
                                      {col.replace(/_/g, ' ')}
                                    </span>
                                  </label>
                                ))}
                              </div>
                              {group.premium && !hasAccess && (
                                <p className="text-xs text-red-600 mt-2">Upgrade to Pro/Elite</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Data Table */}
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-auto max-h-[600px]">
                      <table className="w-full text-xs relative">
                        <thead className="bg-slate-100 border-b sticky top-0 z-10">
                          <tr>
                            {visibleColumns.date && <th className="px-2 py-1.5 text-left font-semibold sticky left-0 bg-slate-100 z-20 border-r-2 border-slate-300">Date</th>}
                            {visibleColumns.close && <th className="px-2 py-1.5 text-right font-semibold sticky left-[90px] bg-slate-100 z-20 border-r-2 border-slate-300">Close</th>}
                            {visibleColumns.change_pct && <th className="px-2 py-1.5 text-right font-semibold sticky left-[160px] bg-slate-100 z-20 border-r-2 border-slate-300">Change %</th>}
                            {visibleColumns.volume && <th className="px-2 py-1.5 text-right font-semibold sticky left-[240px] bg-slate-100 z-20 border-r-2 border-slate-300">Volume</th>}
                            {visibleColumns.final_signal && <th className="px-2 py-1.5 text-center font-semibold">Signal</th>}
                            
                            {/* RSI */}
                            {visibleColumns.rsi && <th className="px-2 py-1.5 text-right font-semibold">RSI</th>}
                            {visibleColumns.rsi_signal && <th className="px-2 py-1.5 text-center font-semibold">RSI Signal</th>}
                            {visibleColumns.rsi_bull_div && <th className="px-2 py-1.5 text-center font-semibold">RSI Bull</th>}
                            {visibleColumns.rsi_bear_div && <th className="px-2 py-1.5 text-center font-semibold">RSI Bear</th>}
                            
                            {/* EMA */}
                            {visibleColumns.ema_cross && <th className="px-2 py-1.5 text-center font-semibold">EMA Cross</th>}
                            {visibleColumns.ema_9 && <th className="px-2 py-1.5 text-right font-semibold">EMA 9</th>}
                            {visibleColumns.ema_34 && <th className="px-2 py-1.5 text-right font-semibold">EMA 34</th>}
                            {visibleColumns.ema_200 && <th className="px-2 py-1.5 text-right font-semibold">EMA 200</th>}
                            
                            {/* MACD */}
                            {visibleColumns.macd_cross && <th className="px-2 py-1.5 text-center font-semibold">MACD</th>}
                            {visibleColumns.macd_line && <th className="px-2 py-1.5 text-right font-semibold">MACD Line</th>}
                            {visibleColumns.macd_histogram && <th className="px-2 py-1.5 text-right font-semibold">MACD Hist</th>}
                            
                            {/* Bollinger */}
                            {visibleColumns.bb_signal && <th className="px-2 py-1.5 text-center font-semibold">BB Signal</th>}
                            {visibleColumns.bb_position && <th className="px-2 py-1.5 text-center font-semibold">BB Pos</th>}
                            {visibleColumns.bb_upper && <th className="px-2 py-1.5 text-right font-semibold">BB Upper</th>}
                            {visibleColumns.bb_lower && <th className="px-2 py-1.5 text-right font-semibold">BB Lower</th>}
                            
                            {/* Volume */}
                            {visibleColumns.vol_spike && <th className="px-2 py-1.5 text-center font-semibold">Vol Spike</th>}
                            {visibleColumns.vol_trend && <th className="px-2 py-1.5 text-center font-semibold">Vol Trend</th>}
                            
                            {/* Numerology (Premium) */}
                            {visibleColumns.numerology_master && user.has_numerology_premium && <th className="px-2 py-1.5 text-center font-semibold">Master#</th>}
                            {visibleColumns.numerology_meaning && user.has_numerology_premium && <th className="px-2 py-1.5 text-left font-semibold">Meaning</th>}
                            {visibleColumns.hebrew_date && user.has_numerology_premium && <th className="px-2 py-1.5 text-left font-semibold">Hebrew Date</th>}
                            {visibleColumns.hebrew_holiday && user.has_numerology_premium && <th className="px-2 py-1.5 text-left font-semibold">Holiday</th>}
                            {visibleColumns.shemitah_alert && user.has_numerology_premium && <th className="px-2 py-1.5 text-left font-semibold">Shemitah</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {signals.map((s, idx) => (
                            <tr key={s.id} className={`border-b hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                              {visibleColumns.date && <td className={`px-2 py-1 font-medium sticky left-0 z-10 border-r-2 border-slate-300 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>{s.date}</td>}
                              {visibleColumns.close && <td className={`px-2 py-1 text-right sticky left-[90px] z-10 border-r-2 border-slate-300 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>${s.close?.toFixed(2)}</td>}
                              {visibleColumns.change_pct && (
                                <td className={`px-2 py-1 text-right font-semibold sticky left-[160px] z-10 border-r-2 border-slate-300 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} ${s.close_pct_change > 0 ? 'text-green-600' : s.close_pct_change < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                  {s.close_pct_change?.toFixed(2)}%
                                </td>
                              )}
                              {visibleColumns.volume && <td className={`px-2 py-1 text-right sticky left-[240px] z-10 border-r-2 border-slate-300 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>{s.volume ? (s.volume / 1000000).toFixed(1) + 'M' : '-'}</td>}
                              {visibleColumns.final_signal && (
                                <td className="px-2 py-1 text-center">
                                  {s.final_signal?.toUpperCase() === 'BUY' && <span className="px-3 py-1 bg-green-100 text-green-800 rounded font-bold text-sm">🟢 BUY</span>}
                                  {s.final_signal?.toUpperCase() === 'SELL' && <span className="px-3 py-1 bg-red-100 text-red-800 rounded font-bold text-sm">🔴 SELL</span>}
                                  {s.final_signal?.toUpperCase() === 'HOLD' && <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded font-semibold text-sm">⚪ HOLD</span>}
                                  {!s.final_signal && <span className="text-slate-400 text-xs">-</span>}
                                  {s.final_signal && !['BUY', 'SELL', 'HOLD'].includes(s.final_signal.toUpperCase()) && (
                                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{s.final_signal}</span>
                                  )}
                                </td>
                              )}
                              
                              {/* RSI */}
                              {visibleColumns.rsi && (
                                <td className={`px-2 py-1 text-right ${s.rsi > 70 ? 'text-red-600 font-semibold' : s.rsi < 30 ? 'text-green-600 font-semibold' : 'text-slate-600'}`}>
                                  {s.rsi?.toFixed(0)}
                                </td>
                              )}
                              {visibleColumns.rsi_signal && <td className="px-2 py-1 text-center">{s.rsi_signal || '-'}</td>}
                              {visibleColumns.rsi_bull_div && <td className="px-2 py-1 text-center">{s.rsi_bull_div ? '✓' : '-'}</td>}
                              {visibleColumns.rsi_bear_div && <td className="px-2 py-1 text-center">{s.rsi_bear_div ? '✓' : '-'}</td>}
                              
                              {/* EMA */}
                              {visibleColumns.ema_cross && (
                                <td className="px-2 py-1 text-center">
                                  {s.buy_cross && <span className="text-green-600 font-bold text-base">⬆️</span>}
                                  {s.sell_cross && <span className="text-red-600 font-bold text-base">⬇️</span>}
                                  {s.buy_cross_9_34 && <span className="text-green-500 font-bold text-base">↗️</span>}
                                  {s.sell_cross_9_34 && <span className="text-red-500 font-bold text-base">↘️</span>}
                                  {!s.buy_cross && !s.sell_cross && !s.buy_cross_9_34 && !s.sell_cross_9_34 && <span className="text-slate-300">◆</span>}
                                </td>
                              )}
                              {visibleColumns.ema_9 && <td className="px-2 py-1 text-right">{s.ema_9?.toFixed(2)}</td>}
                              {visibleColumns.ema_34 && <td className="px-2 py-1 text-right">{s.ema_34?.toFixed(2)}</td>}
                              {visibleColumns.ema_200 && <td className="px-2 py-1 text-right">{s.ema_200?.toFixed(2)}</td>}
                              
                              {/* MACD */}
                              {visibleColumns.macd_cross && (
                                <td className="px-2 py-1 text-center">
                                  {s.macd_cross_up && <span className="text-green-600 font-bold text-lg">▲</span>}
                                  {s.macd_cross_down && <span className="text-red-600 font-bold text-lg">▼</span>}
                                  {!s.macd_cross_up && !s.macd_cross_down && <span className="text-slate-300">-</span>}
                                </td>
                              )}
                              {visibleColumns.macd_line && <td className="px-2 py-1 text-right">{s.macd_line?.toFixed(3)}</td>}
                              {visibleColumns.macd_histogram && <td className="px-2 py-1 text-right">{s.macd_histogram?.toFixed(3)}</td>}
                              
                              {/* Bollinger */}
                              {visibleColumns.bb_signal && (
                                <td className="px-2 py-1 text-center">
                                  {s.bb_squeeze ? <span className="text-orange-600 font-bold text-lg">⚡</span> : <span className="text-slate-300">○</span>}
                                </td>
                              )}
                              {visibleColumns.bb_position && (
                                <td className={`px-2 py-1 text-right ${s.bb_position > 0.8 ? 'text-red-600 font-semibold' : s.bb_position < 0.2 ? 'text-green-600 font-semibold' : 'text-slate-600'}`}>
                                  {s.bb_position ? (s.bb_position * 100).toFixed(0) + '%' : '-'}
                                </td>
                              )}
                              {visibleColumns.bb_upper && <td className="px-2 py-1 text-right">{s.bb_upper?.toFixed(2)}</td>}
                              {visibleColumns.bb_lower && <td className="px-2 py-1 text-right">{s.bb_lower?.toFixed(2)}</td>}
                              
                              {/* Volume */}
                              {visibleColumns.vol_spike && (
                                <td className="px-2 py-1 text-center">
                                  {s.vol_spike ? <span className="text-blue-600 font-bold text-base">📊</span> : <span className="text-slate-300">▬</span>}
                                </td>
                              )}
                              {visibleColumns.vol_trend && <td className="px-2 py-1 text-center">{s.vol_trend || '-'}</td>}
                              
                              {/* Numerology (Premium only) */}
                              {visibleColumns.numerology_master && user.has_numerology_premium && (
                                <td className="px-2 py-1 text-center">
                                  {s.has_master_number ? <span className="text-purple-600 font-bold text-base">🔮</span> : <span className="text-slate-300">○</span>}
                                </td>
                              )}
                              {visibleColumns.numerology_meaning && user.has_numerology_premium && (
                                <td className="px-2 py-1">{s.numerology_meaning || '-'}</td>
                              )}
                              {visibleColumns.hebrew_date && user.has_numerology_premium && (
                                <td className="px-2 py-1">{s.hebrew_date || '-'}</td>
                              )}
                              {visibleColumns.hebrew_holiday && user.has_numerology_premium && (
                                <td className="px-2 py-1">{s.hebrew_holiday_alert || '-'}</td>
                              )}
                              {visibleColumns.shemitah_alert && user.has_numerology_premium && (
                                <td className="px-2 py-1">{s.shemitah_alert || '-'}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <SignalChart data={signals} ticker={ticker} />
              </>
            )}
          </TabsContent>

          {/* Watchlist Tab */}
          <TabsContent value="watchlist">
            <Card>
              <CardHeader>
                <CardTitle>
                  ⭐ My Watchlist ({watchlist.length} / {user.max_tickers})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {watchlist.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">
                    No tickers in watchlist. Search for signals and add them!
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {watchlist.map((item) => (
                      <Card key={item.id} className="hover:shadow-md transition-shadow">
                        <CardHeader>
                          <CardTitle>{item.ticker}</CardTitle>
                          <p className="text-sm text-slate-500">{item.source}</p>
                        </CardHeader>
                        {item.notes && (
                          <CardContent>
                            <p className="text-sm">{item.notes}</p>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>👤 Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Name</p>
                      <p className="font-semibold">{user.full_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Email</p>
                      <p className="font-semibold">{user.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Current Tier</p>
                      <p className="font-semibold capitalize">{user.tier}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Daily Limit</p>
                      <p className="font-semibold">{user.daily_pulls_limit} pulls/day</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>🎯 Feature Access</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Macro Data Access</span>
                      <span className={user.has_macro_access ? "text-green-600" : "text-red-600"}>
                        {user.has_macro_access ? "✓ Enabled" : "✗ Disabled"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Numerology Premium</span>
                      <span className={user.has_numerology_premium ? "text-green-600" : "text-red-600"}>
                        {user.has_numerology_premium ? "✓ Enabled" : "✗ Disabled"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Auction Data Premium</span>
                      <span className={user.has_auction_premium ? "text-green-600" : "text-red-600"}>
                        {user.has_auction_premium ? "✓ Enabled" : "✗ Disabled"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>💎 Upgrade Plans</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="border rounded-lg p-4 space-y-2">
                      <h3 className="font-bold text-lg">Starter</h3>
                      <p className="text-2xl font-bold">$77<span className="text-sm">/mo</span></p>
                      <ul className="text-sm space-y-1">
                        <li>✓ 10 pulls/day</li>
                        <li>✓ 5 tickers</li>
                        <li>✓ Technical signals</li>
                      </ul>
                      {user.tier === 'starter' && (
                        <p className="text-green-600 text-sm font-semibold">Current Plan</p>
                      )}
                    </div>
                    <div className="border-2 border-blue-500 rounded-lg p-4 space-y-2">
                      <h3 className="font-bold text-lg">Pro</h3>
                      <p className="text-2xl font-bold">$377<span className="text-sm">/mo</span></p>
                      <ul className="text-sm space-y-1">
                        <li>✓ 50 pulls/day</li>
                        <li>✓ 15 tickers</li>
                        <li>✓ Numerology Premium</li>
                        <li>✓ Macro Data</li>
                        <li>✓ API access</li>
                      </ul>
                      {user.tier === 'pro' ? (
                        <p className="text-green-600 text-sm font-semibold">Current Plan</p>
                      ) : (
                        <Button className="w-full">Upgrade</Button>
                      )}
                    </div>
                    <div className="border-2 border-purple-500 rounded-lg p-4 space-y-2">
                      <h3 className="font-bold text-lg">Elite</h3>
                      <p className="text-2xl font-bold">$577<span className="text-sm">/mo</span></p>
                      <ul className="text-sm space-y-1">
                        <li>✓ Unlimited pulls</li>
                        <li>✓ 50 tickers</li>
                        <li>✓ All Premium Features</li>
                        <li>✓ Auction Data</li>
                        <li>✓ White-label option</li>
                      </ul>
                      {user.tier === 'elite' ? (
                        <p className="text-green-600 text-sm font-semibold">Current Plan</p>
                      ) : (
                        <Button className="w-full">Upgrade</Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}