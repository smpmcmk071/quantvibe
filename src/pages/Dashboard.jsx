import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Download, Star, Settings, TrendingUp, Database, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import SignalCard from "../components/signals/SignalCard";
import SignalChart from "../components/signals/SignalChart";
import AccessControl from "../components/AccessControl";

export default function Dashboard() {
  const [ticker, setTicker] = useState('');
  const [source, setSource] = useState('yahoo');
  const [searchResults, setSearchResults] = useState([]);
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

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

    // Increment pulls counter
    const today = new Date().toISOString().split('T')[0];
    const pullsToday = user.last_pull_date === today ? user.pulls_today + 1 : 1;
    
    await base44.auth.updateMe({
      pulls_today: pullsToday,
      last_pull_date: today
    });

    // Trigger search
    queryClient.invalidateQueries({ queryKey: ['signals', ticker, source] });
    setSearchResults(signals);
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
                <div className="flex gap-3">
                  <Input
                    placeholder="Enter ticker (SPY, QQQ, NVDA...)"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="flex-1"
                  />
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yahoo">Yahoo</SelectItem>
                      <SelectItem value="kraken">Kraken</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleSearch} disabled={!ticker || isLoading}>
                    <Search className="w-4 h-4 mr-2" />
                    Search
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

            {signals.length > 0 && (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold">
                    Results for {ticker} ({signals.length} days)
                  </h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleAddToWatchlist}>
                      <Star className="w-4 h-4 mr-2" />
                      Add to Watchlist
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportToCSV}>
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </div>

                <SignalChart data={signals} ticker={ticker} />

                {/* Numerology Access Control */}
                <AccessControl
                  hasAccess={user.has_numerology_premium}
                  featureName="Numerology Premium Content"
                  requiredTier="Pro or Elite"
                >
                  <Card className="bg-purple-50 border-purple-200">
                    <CardHeader>
                      <CardTitle className="text-purple-900">🔮 Numerology Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        {signals.slice(0, 5).map((s, i) => (
                          <div key={i} className="text-sm">
                            <p className="font-semibold">{s.date}</p>
                            {s.has_master_number && (
                              <p className="text-purple-700">Master Number: {s.master_locations}</p>
                            )}
                            {s.hebrew_holiday_alert && (
                              <p className="text-purple-600">{s.hebrew_holiday_alert}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </AccessControl>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {signals.slice(0, 9).map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
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