import React, { useEffect, useState } from 'react';
import {
  SafeAreaView, View, Text, TextInput, Pressable, ScrollView, StyleSheet, StatusBar, ActivityIndicator
} from 'react-native';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

async function req(path, opt = {}) {
  const token = globalThis.__token;
  const r = await fetch(API + path, {
    ...opt,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opt.headers || {})
    }
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || 'Request failed');
  }
  return r.json();
}

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [logged, setLogged] = useState(false);
  const [register, setRegister] = useState(false);
  const [tab, setTab] = useState('Home');
  const [items, setItems] = useState([]);
  const [deals, setDeals] = useState([]);
  const [monitoring, setMonitoring] = useState([]);
  const [orders, setOrders] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    try {
      const [i, d, m, o] = await Promise.all([
        req('/api/items'),
        req('/api/deals'),
        req('/api/monitoring'),
        req('/api/orders')
      ]);
      setItems(i.items || []);
      setDeals(d.deals || []);
      setMonitoring(m.items || []);
      setOrders(o || []);
      setLogged(true);
    } catch (e) {
      setToast(e.message);
    }
  };

  useEffect(() => {
    if (globalThis.__token) load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const auth = async () => {
    if (!email.trim() || !password.trim()) {
      setToast('Enter email and password');
      return;
    }
    setBusy(true);
    try {
      const mode = register ? 'register' : 'login';
      const x = await req(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password })
      });
      globalThis.__token = x.access_token;
      await load();
      setToast(register ? 'Account created!' : 'Signed in!');
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const runIntent = async () => {
    if (!input.trim()) return;
    setBusy(true);
    try {
      await req('/api/intent', {
        method: 'POST',
        body: JSON.stringify({ text: input.trim() })
      });
      setInput('');
      await load();
      setToast('Added to shopping plan');
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const buyItem = async (id) => {
    setBusy(true);
    try {
      const res = await req(`/api/items/${id}/checkout`, { method: 'POST' });
      setToast(res.message || 'Checkout completed');
      await load();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const monitorItem = async (id) => {
    try {
      await req(`/api/items/${id}/monitor`, { method: 'POST' });
      await load();
      setToast('Monitoring started');
    } catch (e) {
      setToast(e.message);
    }
  };

  if (!logged) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" />
        <View style={s.authContainer}>
          <View style={s.logoBadge}><Text style={s.logoText}>✨ ShopAgent</Text></View>
          <Text style={s.authTitle}>{register ? 'Create account' : 'Welcome back'}</Text>
          <Text style={s.authSubtitle}>Personal AI shopping agent optimizing strictly for your benefit.</Text>

          <TextInput
            style={s.input}
            placeholder="Email address"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={s.input}
            placeholder="Password (min 6 characters)"
            placeholderTextColor="#64748b"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={s.primaryBtn} onPress={auth} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{register ? 'Create Account' : 'Sign In'}</Text>}
          </Pressable>

          <Pressable onPress={() => setRegister(!register)} style={{ marginTop: 16 }}>
            <Text style={s.switchText}>{register ? 'Already have an account? Sign in' : 'Need an account? Create one'}</Text>
          </Pressable>

          {toast ? <Text style={s.toast}>{toast}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  const todoItems = items.filter(x => x.status === 'TODO');

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <Text style={s.logoText}>✨ ShopAgent</Text>
        <Pressable onPress={() => { globalThis.__token = null; setLogged(false); }}>
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      <ScrollView style={s.body}>
        {tab === 'Home' && (
          <>
            <Text style={s.mainTitle}>Don't shop. Tell ShopAgent.</Text>
            <View style={s.commandBox}>
              <TextInput
                style={s.commandInput}
                placeholder="Try: Monitor headphones under ₹25,000"
                placeholderTextColor="#64748b"
                value={input}
                onChangeText={setInput}
              />
              <Pressable style={s.runBtn} onPress={runIntent} disabled={busy}>
                <Text style={s.runBtnText}>{busy ? '...' : 'Run'}</Text>
              </Pressable>
            </View>

            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statNum}>{todoItems.length}</Text>
                <Text style={s.statLabel}>To-Buy</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNum}>{monitoring.length}</Text>
                <Text style={s.statLabel}>Monitoring</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNum}>{orders.length}</Text>
                <Text style={s.statLabel}>Orders</Text>
              </View>
            </View>

            <Text style={s.sectionTitle}>Active Shopping Plan</Text>
            {todoItems.map(i => (
              <View style={s.card} key={i.id}>
                <Text style={s.cardTitle}>{i.name}</Text>
                <Text style={s.cardPrice}>{i.current_price ? `₹${i.current_price.toLocaleString()}` : 'Verifying store price...'}</Text>
                <View style={s.cardActions}>
                  {i.mode !== 'MONITOR' && (
                    <Pressable style={s.secBtn} onPress={() => monitorItem(i.id)}>
                      <Text style={s.secBtnText}>Monitor</Text>
                    </Pressable>
                  )}
                  <Pressable style={s.actionBtn} onPress={() => buyItem(i.id)}>
                    <Text style={s.actionBtnText}>Buy Now</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === 'To-Buy' && (
          <>
            <Text style={s.mainTitle}>To-Buy List</Text>
            {todoItems.map(i => (
              <View style={s.card} key={i.id}>
                <Text style={s.cardTitle}>{i.name}</Text>
                <Text style={s.cardPrice}>{i.current_price ? `₹${i.current_price.toLocaleString()}` : 'Live price check'}</Text>
                <View style={s.cardActions}>
                  <Pressable style={s.actionBtn} onPress={() => buyItem(i.id)}>
                    <Text style={s.actionBtnText}>Buy Now</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === 'Monitoring' && (
          <>
            <Text style={s.mainTitle}>Active Price Monitoring</Text>
            {monitoring.map(m => (
              <View style={s.card} key={m.id}>
                <Text style={s.cardTitle}>{m.item.name}</Text>
                <Text style={s.cardPrice}>{m.best?.true_total ? `Current: ₹${m.best.true_total.toLocaleString()}` : 'Scheduled check'}</Text>
                <Text style={s.metaText}>Target: {m.item.target_price ? `₹${m.item.target_price.toLocaleString()}` : 'None'}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'Deals' && (
          <>
            <Text style={s.mainTitle}>Verified Opportunities</Text>
            {deals.map(d => (
              <View style={s.card} key={d.product_id}>
                <Text style={s.cardTitle}>{d.product}</Text>
                <Text style={s.cardPrice}>₹{Number(d.price).toLocaleString()}</Text>
                <Text style={{ color: '#22c55e', fontSize: 13, marginTop: 4 }}>{d.discount_percent}% below historical average</Text>
                <Text style={s.metaText}>{d.reason}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'Orders' && (
          <>
            <Text style={s.mainTitle}>Purchase History</Text>
            {orders.map(o => (
              <View style={s.card} key={o.id}>
                <Text style={s.cardTitle}>{o.product_name}</Text>
                <Text style={s.cardPrice}>₹{Number(o.price).toLocaleString()}</Text>
                <Text style={s.metaText}>{o.store} • {o.status}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {toast ? <Text style={s.floatingToast}>{toast}</Text> : null}

      <View style={s.nav}>
        {['Home', 'To-Buy', 'Monitoring', 'Deals', 'Orders'].map(x => (
          <Pressable key={x} onPress={() => setTab(x)} style={s.navItem}>
            <Text style={tab === x ? s.navActive : s.navText}>{x}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080c14' },
  authContainer: { padding: 24, marginTop: 60 },
  logoBadge: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#6d45ff22', borderRadius: 99, alignSelf: 'flex-start' },
  logoText: { color: '#a78bfa', fontSize: 14, fontWeight: '800' },
  authTitle: { fontSize: 32, fontWeight: '800', color: '#fff', marginVertical: 10 },
  authSubtitle: { fontSize: 14, color: '#94a3b8', lineHeight: 20, marginBottom: 24 },
  input: { backgroundColor: '#0f1523', borderWidth: 1, borderColor: '#222d42', borderRadius: 10, padding: 14, color: '#fff', fontSize: 15, marginBottom: 12 },
  primaryBtn: { backgroundColor: '#6d45ff', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  switchText: { color: '#a78bfa', textAlign: 'center', fontSize: 14, fontWeight: '600' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  signOutText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  body: { padding: 18 },
  mainTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 16 },
  commandBox: { backgroundColor: '#0f1523', borderWidth: 1, borderColor: '#5d58b7', borderRadius: 12, padding: 6, flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  commandInput: { flex: 1, color: '#fff', paddingHorizontal: 12, fontSize: 14 },
  runBtn: { backgroundColor: '#6d45ff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  runBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statBox: { flex: 1, backgroundColor: '#0f1523', borderWidth: 1, borderColor: '#222d42', borderRadius: 10, padding: 14, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 12 },
  card: { backgroundColor: '#0f1523', borderWidth: 1, borderColor: '#222d42', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cardPrice: { fontSize: 18, fontWeight: '800', color: '#a78bfa', marginTop: 4 },
  metaText: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' },
  actionBtn: { backgroundColor: '#6d45ff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  secBtn: { backgroundColor: '#1a243a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#222d42' },
  secBtnText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  floatingToast: { position: 'absolute', bottom: 70, alignSelf: 'center', backgroundColor: '#1e293b', color: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, overflow: 'hidden', fontSize: 13, fontWeight: '700', borderWidth: 1, borderColor: '#334155' },
  nav: { height: 60, backgroundColor: '#0b101c', borderTopWidth: 1, borderTopColor: '#1e293b', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  navItem: { padding: 8 },
  navText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  navActive: { color: '#a78bfa', fontSize: 12, fontWeight: '800' }
});
