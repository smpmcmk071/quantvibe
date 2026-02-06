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
  const [tickerPullCount, setTickerPullCount] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const currentUser = await base44.auth.me();
    setUser(currentUser);
  };



  const { data: watchlist = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Watchlist.filter({ user_email: user.email });
    },
    enabled: !!user
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: async () => {
      if (user?.role !== 'admin') return [];
      return await base44.entities.User.list();
    },
    enabled: !!user && user?.role === 'admin'
  });

  const updateUserLimitMutation = useMutation({
    mutationFn: async ({ userId, newLimit }) => {
      return await base44.entities.User.update(userId, { daily_pulls_limit: newLimit });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
    }
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async (data) => await base44.entities.Watchlist.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['watchlist'] })
  });

  const handleSearch = async () => {
    if (!ticker) return;
    
    const today = new Date().toISOString().split('T')[0];
    const tickerUpper = ticker.toUpperCase();
    
    // Check per-ticker rate limit
    const existingPull = await base44.entities.TickerPull.filter({
      user_email: user.email,
      ticker: tickerUpper,
      pull_date: today
    });
    
    const currentTickerPulls = existingPull.length > 0 ? existingPull[0].pull_count : 0;
    
    if (currentTickerPulls >= user?.daily_pulls_limit) {
      alert(`Daily limit reached for ${tickerUpper}! You've pulled this ticker ${currentTickerPulls} times today.`);
      return;
    }

    setIsLoadingYahoo(true);
    setYahooData(null);

    try {
      // Step 1: Fetch raw data once
      const rawDataResponse = await base44.functions.invoke('fetchYahooData', {
        ticker: tickerUpper,
        interval: interval,
        period: period
      });

      if (rawDataResponse.data.error) {
        alert(rawDataResponse.data.error);
        return;
      }

      const rawData = rawDataResponse.data.data;
      console.log('RAW DATA:', rawData); // Debug: see all fetched data

      // Step 2: Calculate volume signals
      const volumeResponse = await base44.functions.invoke('getVolumeSignals', {
        data: rawData
      });

      let enrichedData = volumeResponse.data.data;

      // Step 3: Calculate RSI signals
      const rsiResponse = await base44.functions.invoke('getRSISignals', {
        data: rawData
      });

      const rsiData = rsiResponse.data.data;

      // Step 4: Calculate Numerology signals
      const numerologyResponse = await base44.functions.invoke('getNumerologySignals', {
        data: rawData
      });

      const numerologyData = numerologyResponse.data.data;

      // Step 5: Merge results (volume + RSI + numerology)
      enrichedData = enrichedData.map((row, idx) => ({
        ...row,
        ...rsiData[idx],
        ...numerologyData[idx]
      }));

      // Reverse for display (newest first) but keep calculations in chronological order
      enrichedData.reverse();

      setYahooData({
        ...rawDataResponse.data,
        data: enrichedData
      });

      // Update per-ticker pull count
      if (existingPull.length > 0) {
        await base44.entities.TickerPull.update(existingPull[0].id, {
          pull_count: currentTickerPulls + 1
        });
        setTickerPullCount(currentTickerPulls + 1);
      } else {
        await base44.entities.TickerPull.create({
          user_email: user.email,
          ticker: tickerUpper,
          pull_date: today,
          pull_count: 1
        });
        setTickerPullCount(1);
      }

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
              {ticker && tickerPullCount > 0 && (
                <div>
                  <p className="text-xs text-slate-500">Pulls for {ticker.toUpperCase()}</p>
                  <p className="font-semibold">{tickerPullCount} / {user.daily_pulls_limit}</p>
                </div>
              )}
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

                {ticker && tickerPullCount >= user.daily_pulls_limit && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Daily limit reached for {ticker.toUpperCase()}! You've pulled this ticker {tickerPullCount} times today.
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
                            <th className="px-2 py-2 text-right font-semibold">Vol Z-Score</th>
                            <th className="px-2 py-2 text-center font-semibold">Vol Spike</th>
                            <th className="px-2 py-2 text-center font-semibold">Vol Trend</th>
                            <th className="px-2 py-2 text-center font-semibold">Vol Signal</th>
                            <th className="px-2 py-2 text-right font-semibold">RSI</th>
                            <th className="px-2 py-2 text-center font-semibold">RSI Signal</th>
                            <th className="px-2 py-2 text-center font-semibold">RSI Bull Div</th>
                            <th className="px-2 py-2 text-center font-semibold">RSI Bear Div</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yahooData.data.map((row, idx) => (
                            <tr key={idx} className={`border-b hover:bg-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                              <td className="px-2 py-1.5 font-medium">
                                {row.timestamp ? new Date(row.timestamp * 1000).toLocaleString('en-US', { 
                                  month: '2-digit', 
                                  day: '2-digit', 
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  hour12: false
                                }) : row.date}
                              </td>
                              <td className="px-2 py-1.5 text-right">${row.open?.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right">${row.high?.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right">${row.low?.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right font-semibold">${row.close?.toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-right">{row.volume ? (row.volume / 1000000).toFixed(2) + 'M' : '-'}</td>
                              <td className={`px-2 py-1.5 text-right font-semibold ${row.return_1d > 0 ? 'text-green-600' : row.return_1d < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                {row.return_1d ? row.return_1d.toFixed(2) + '%' : '-'}
                              </td>
                              <td className="px-2 py-1.5 text-right">{row.vol_zscore ? row.vol_zscore.toFixed(2) : '-'}</td>
                              <td className="px-2 py-1.5 text-center">{row.vol_spike ? '✓' : '-'}</td>
                              <td className="px-2 py-1.5 text-center capitalize text-xs">{row.vol_trend || '-'}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                  row.volume_signal === 'vol_buy' ? 'bg-green-100 text-green-800' : 
                                  row.volume_signal === 'vol_sell' ? 'bg-red-100 text-red-800' :
                                  row.volume_signal === 'vol_breakout' ? 'bg-blue-100 text-blue-800' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {row.volume_signal || 'hold'}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-right">{row.rsi ? row.rsi.toFixed(2) : '-'}</td>
                              <td className="px-2 py-1.5 text-center capitalize text-xs">{row.rsi_signal || '-'}</td>
                              <td className="px-2 py-1.5 text-center">{row.rsi_bull_div ? '✓' : '-'}</td>
                              <td className="px-2 py-1.5 text-center">{row.rsi_bear_div ? '✓' : '-'}</td>
                              </tr>
                              ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
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

              {/* Admin: All Users Management */}
              {user?.role === 'admin' && (
                <Card>
                  <CardHeader>
                    <CardTitle>👥 All Users (Admin Only)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Name</th>
                            <th className="px-3 py-2 text-left font-semibold">Email</th>
                            <th className="px-3 py-2 text-left font-semibold">Role</th>
                            <th className="px-3 py-2 text-center font-semibold">Tier</th>
                            <th className="px-3 py-2 text-center font-semibold">Daily Limit</th>
                            <th className="px-3 py-2 text-center font-semibold">Pulls Today</th>
                            <th className="px-3 py-2 text-center font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allUsers.map((u) => (
                            <tr key={u.id} className="border-b hover:bg-slate-50">
                              <td className="px-3 py-2">{u.full_name}</td>
                              <td className="px-3 py-2">{u.email}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'}`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center capitalize">{u.tier || 'starter'}</td>
                              <td className="px-3 py-2 text-center">
                                <Input
                                  type="number"
                                  value={u.daily_pulls_limit}
                                  onChange={(e) => {
                                    const newLimit = parseInt(e.target.value);
                                    if (newLimit >= 0) {
                                      updateUserLimitMutation.mutate({ userId: u.id, newLimit });
                                    }
                                  }}
                                  className="w-20 text-center"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">{u.pulls_today || 0}</td>
                              <td className="px-3 py-2 text-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    updateUserLimitMutation.mutate({ 
                                      userId: u.id, 
                                      newLimit: 0 
                                    });
                                  }}
                                >
                                  Reset Pulls
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
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