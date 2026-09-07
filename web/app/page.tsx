'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles, Bot, Search, ListChecks, Target, TrendingDown,
  Package, CircleDollarSign, Activity, Settings, LogOut,
  ChevronDown, ExternalLink, ShieldAlert, Zap, Layers3,
  ShoppingCart, AlertTriangle, PlayCircle, Scale, Clock3,
  Check, Menu, X, Plus, Trash2, Bell, Gift, Users, Leaf,
  FileText, RefreshCw, ThumbsUp, ThumbsDown, CreditCard,
  CheckCircle2, AlertOctagon, LineChart, TrendingUp, Bookmark, PauseCircle
} from 'lucide-react';

interface Item {
  id: number;
  name: string;
  quantity: number;
  target_price?: number | null;
  max_price?: number | null;
  mode: string;
  purchase_mode: string;
  status: string;
  product_id?: number | null;
  current_price?: number | null;
  decision?: { decision: string; reason: string } | null;
  is_gift?: boolean;
  gift_recipient?: string;
  gift_message?: string;
  gift_wrap?: boolean;
  votes?: Array<{ id: number; name: string; vote: string; comment: string; created_at: string }>;
  approvals_count?: number;
  rejections_count?: number;
}

interface Listing {
  listing_id?: number;
  store: string;
  price: number;
  delivery: number;
  tax?: number;
  fees?: number;
  discounts?: number;
  cashback?: number;
  true_total: number;
  seller: string;
  seller_rating: number;
  warranty?: string;
  returns?: string;
  match_score?: number;
  url?: string;
  card_offers?: Array<{ bank: string; offer: string; effective_price: number; type: string; badge: string }>;
}

function cleanProductName(rawName?: string, maxLen = 65): string {
  if (!rawName) return '';
  let cleaned = rawName
    .replace(/^(Buy\s+|Amazon\.in\s*:\s*|Flipkart\.com\s*:\s*)/i, '')
    .replace(/(\s*:\s*Amazon\.in|\s*\|\s*Flipkart|\s*-\s*Amazon\.in).*$/i, '')
    .trim();
  if (cleaned.includes(' | ')) {
    cleaned = cleaned.split(' | ')[0].trim();
  }
  if (cleaned.length > maxLen) {
    cleaned = cleaned.slice(0, maxLen).trim() + '...';
  }
  return cleaned;
}

const API = process.env.NEXT_PUBLIC_API_URL || '';

let refreshMutex: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshMutex) return refreshMutex;
  refreshMutex = (async () => {
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('sa_refresh') : null;
    if (!refreshToken) return false;
    try {
      const refreshRes = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (refreshRes.ok) {
        const tokens = await refreshRes.json();
        localStorage.setItem('sa_access', tokens.access_token);
        localStorage.setItem('sa_refresh', tokens.refresh_token);
        return true;
      }
    } catch {}
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sa_access');
      localStorage.removeItem('sa_refresh');
      window.dispatchEvent(new Event('sa-auth-changed'));
    }
    return false;
  })().finally(() => {
    refreshMutex = null;
  });
  return refreshMutex;
}

async function req(path: string, opt: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sa_access') : null;
  let r: Response;
  try {
    r = await fetch(`${API}${path}`, {
      ...opt,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opt.headers || {}) }
    });
  } catch {
    throw new Error('Unable to connect to server. Please check if the backend is running.');
  }

  // Handle 401 Unauthorized (expired token or re-seeded database)
  if (r.status === 401 && !path.startsWith('/api/auth/')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return req(path, opt);
    }
    throw new Error('Session expired. Please sign in again.');
  }

  if (!r.ok) {
    let errMsg = 'Request failed';
    try {
      const errData = await r.json();
      if (typeof errData.detail === 'string') {
        errMsg = errData.detail;
      } else if (Array.isArray(errData.detail) && errData.detail.length > 0) {
        errMsg = errData.detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(', ');
      } else if (errData.message) {
        errMsg = errData.message;
      }
    } catch {}
    throw new Error(errMsg);
  }
  return r.json();
}

const nav = [
  ['Home', Search],
  ['To-Buy', ListChecks],
  ['Decision Lab', Sparkles],
  ['Master Cart', ShoppingCart],
  ['Batch Intake', Layers3],
  ['Monitoring', Target],
  ['Deals', TrendingDown],
  ['Orders', Package],
  ['Savings', CircleDollarSign],
  ['Agent Activity', Activity],
  ['Settings', Settings]
] as const;

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTabState] = useState('Home');
  const setTab = (newTab: string) => {
    setTabState(newTab);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('sa_active_tab', newTab); } catch {}
    }
  };

  const [mobileOpen, setMobileOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [monitor, setMonitor] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [productUrl, setProductUrlState] = useState('');
  const setProductUrl = (val: string) => {
    setProductUrlState(val);
    if (typeof window !== 'undefined') {
      try {
        if (val) localStorage.setItem('sa_product_url', val);
        else localStorage.removeItem('sa_product_url');
      } catch {}
    }
  };
  const [urlBusy, setUrlBusy] = useState(false);
  const [compare, setCompareState] = useState<any>(null);
  const setCompare = (newCompare: any) => {
    setCompareState(newCompare);
    if (typeof window !== 'undefined') {
      try {
        if (newCompare) {
          localStorage.setItem('sa_active_compare', JSON.stringify(newCompare));
        } else {
          localStorage.removeItem('sa_active_compare');
        }
      } catch {}
    }
  };

  const [decisionData, setDecisionData] = useState<any>(null);
  const [decisionPid, setDecisionPid] = useState<number | null>(null);
  const [basketData, setBasketData] = useState<any>(null);
  const [basketStrategy, setBasketStrategy] = useState('CHEAPEST');
  const [batchUrls, setBatchUrls] = useState('');
  const [batchItems, setBatchItems] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);
  const [batchMonitor, setBatchMonitor] = useState(false);
  const [batchTarget, setBatchTarget] = useState('');
  const [toast, setToast] = useState('');
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [activeReceipt, setActiveReceipt] = useState<any>(null);
  const [checkoutHandoff, setCheckoutHandoff] = useState<any>(null);
  const [preferences, setPreferences] = useState<any>({
    global_max_order: 10000,
    monthly_max: 50000,
    min_seller_rating: 4.0,
    emergency_stop: false,
    telegram_bot_token: '',
    telegram_chat_id: ''
  });

  const load = async () => {
    try {
      const [d, i, m, o, a, de] = await Promise.all([
        req('/api/dashboard'),
        req('/api/items'),
        req('/api/monitoring'),
        req('/api/orders'),
        req('/api/activity'),
        req('/api/deals')
      ]);
      setData(d);
      setItems(i.items || []);
      setMonitor(m.tasks || m.items || []);
      setOrders(o || []);
      setActivity(a || []);
      setDeals(de.deals || []);
      try { setAiStatus(await req('/api/ai/status')); } catch {}
      try { setBasketData(await req('/api/basket')); } catch {}
      try { setPreferences(await req('/api/preferences')); } catch {}

      // Check for saved Decision Lab product ID or fallback to latest product
      const savedPid = typeof window !== 'undefined' ? localStorage.getItem('sa_decision_pid') : null;
      let targetPid = savedPid ? Number(savedPid) : null;
      const itemsWithPid = (i.items || []).filter((it: any) => it.product_id);
      if (!targetPid && itemsWithPid.length > 0) {
        targetPid = itemsWithPid[itemsWithPid.length - 1].product_id;
      }
      if (targetPid) {
        setDecisionPid(targetPid);
        const dLab = await req(`/api/products/${targetPid}/decision-lab?t=${Date.now()}`).catch(() => null);
        if (dLab) setDecisionData(dLab);
      }
    } catch (err: any) {
      if (!localStorage.getItem('sa_access') || err.message?.includes('Session expired')) {
        setAuthed(false);
      } else {
        setToast(err.message || 'Failed to refresh data');
      }
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      if (typeof window !== 'undefined' && localStorage.getItem('sa_access')) {
        try {
          // Restore persisted tab, compare product, and decision lab ID across refresh
          const savedTab = localStorage.getItem('sa_active_tab');
          if (savedTab) setTabState(savedTab);
          const savedCompare = localStorage.getItem('sa_active_compare');
          if (savedCompare) {
            try { setCompareState(JSON.parse(savedCompare)); } catch {}
          }
          const savedPid = localStorage.getItem('sa_decision_pid');
          if (savedPid) setDecisionPid(Number(savedPid));
          const savedProductUrl = localStorage.getItem('sa_product_url');
          if (savedProductUrl) setProductUrlState(savedProductUrl);

          await req('/api/me');
          setAuthed(true);
          await load();

          // If an extraction was in-flight when the page refreshed, resume it seamlessly
          const inFlightUrl = localStorage.getItem('sa_extracting_url');
          if (inFlightUrl) {
            analyzeUrl(false, inFlightUrl);
          }
        } catch {
          localStorage.removeItem('sa_access');
          localStorage.removeItem('sa_refresh');
          setAuthed(false);
        }
      } else {
        setAuthed(false);
      }
    };
    initAuth();
    const handleAuthChange = () => {
      if (!localStorage.getItem('sa_access')) {
        setAuthed(false);
      }
    };
    window.addEventListener('sa-auth-changed', handleAuthChange);
    return () => window.removeEventListener('sa-auth-changed', handleAuthChange);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const auth = async () => {
    if (!email.trim() || !password.trim()) {
      setToast('Please enter your email and password');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setToast('Password must be at least 6 characters');
      return;
    }
    setBusy(true);
    try {
      const authMode = mode === 'login' ? 'login' : 'register';
      const x = await req(`/api/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password })
      });
      localStorage.setItem('sa_access', x.access_token);
      localStorage.setItem('sa_refresh', x.refresh_token);
      setAuthed(true);
      await load();
      setToast(mode === 'login' ? 'Welcome back!' : 'Account created successfully!');
    } catch (e: any) {
      setToast(e.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const analyzeUrl = async (monitor = false, urlOverride?: string) => {
    const targetUrl = (urlOverride || productUrl).trim();
    if (!targetUrl) return;
    setUrlBusy(true);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('sa_extracting_url', targetUrl); } catch {}
    }
    try {
      const x = await req('/api/products/url-analyze', {
        method: 'POST',
        body: JSON.stringify({ url: targetUrl, monitor })
      });
      if (x.product && x.product.id) {
        setDecisionPid(x.product.id);
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('sa_decision_pid', String(x.product.id)); } catch {}
        }
      }
      setCompare(x.comparison);
      setTab('Compare');
      setProductUrl('');
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('sa_extracting_url');
          localStorage.removeItem('sa_product_url');
        } catch {}
      }
      await load();
      setToast(monitor ? 'Product analyzed, compared, and 24/7 monitoring started' : 'Product analyzed and compared across live stores');
    } catch (e: any) {
      setToast(e.message);
      if (typeof window !== 'undefined') {
        try { localStorage.removeItem('sa_extracting_url'); } catch {}
      }
    } finally {
      setUrlBusy(false);
    }
  };

  const processBatch = async () => {
    const target = batchTarget.trim() ? Number(batchTarget) : undefined;
    const urls = batchUrls.split(/\n|,/).map(x => x.trim()).filter(Boolean).map(url => ({
      url,
      monitor: batchMonitor,
      target_price: Number.isFinite(target as number) ? target : undefined
    }));
    const todo_items = batchItems.split(/\n/).map(x => x.trim()).filter(Boolean);
    if (!urls.length && !todo_items.length) {
      setToast('Add at least one URL or To-Buy item');
      return;
    }
    setBatchBusy(true);
    try {
      const x = await req('/api/batch/process', {
        method: 'POST',
        body: JSON.stringify({ urls, todo_items })
      });
      setBatchResult(x);
      setBatchUrls('');
      setBatchItems('');
      setBatchTarget('');
      await load();
      setToast(`Processed ${x.summary.urls_succeeded} URLs and ${x.summary.todo_created} To-Buy items`);
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBatchBusy(false);
    }
  };

  const run = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    if (text.startsWith('http://') || text.startsWith('https://')) {
      setProductUrl(text);
      setInput('');
      await analyzeUrl(false, text);
      return;
    }
    setBusy(true);
    try {
      await req('/api/intent', {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      setInput('');
      await load();
      setToast('Shopping intent processed and added to plan');
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addNewItem = async (name: string, target_price?: number, mode = 'BUY_NOW', is_gift = false, gift_recipient = '', gift_message = '', gift_wrap = false) => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await req('/api/items', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          target_price: target_price || null,
          mode,
          is_gift,
          gift_recipient,
          gift_message,
          gift_wrap
        })
      });
      await load();
      setToast(`Added ${name} ${is_gift ? '🎁 (Gift)' : ''} to shopping plan`);
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const swapItem = async (itemId: number, newName: string) => {
    setBusy(true);
    try {
      const res = await req(`/api/items/${itemId}/swap`, {
        method: 'POST',
        body: JSON.stringify({ new_name: newName })
      });
      await load();
      setToast(`Swapped with alternative: '${newName}'`);
      if (compare && compare.product_id) {
        const p = await req(`/api/products/${res.product_id}/summary`);
        setCompare(p);
      }
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const voteItem = async (itemId: number, memberName: string, vote: 'APPROVE' | 'REJECT', comment = '') => {
    try {
      await req(`/api/items/${itemId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ member_name: memberName, vote, comment })
      });
      await load();
      setToast(`Vote ${vote === 'APPROVE' ? '👍 Approved' : '👎 Rejected'} recorded`);
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const viewOrderReceipt = async (orderId: number) => {
    try {
      const rec = await req(`/api/orders/${orderId}/receipt`);
      setActiveReceipt(rec);
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await req(`/api/items/${id}`, { method: 'DELETE' });
      await load();
      setToast('Item removed');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const toggleItemStatus = async (item: Item) => {
    try {
      const newStatus = item.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
      await req(`/api/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      await load();
      setToast(`Item marked ${newStatus}`);
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const saveForLater = async (id: number) => {
    try {
      await req(`/api/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'BUY_LATER' })
      });
      await load();
      setToast('Item moved to Buy Later');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const moveToCart = async (id: number) => {
    try {
      await req(`/api/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'TODO' })
      });
      await load();
      setToast('Item moved back to Active Cart');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const buy = async (id: number) => {
    setBusy(true);
    // Pre-open a blank tab synchronously within user click event to bypass browser popup blockers
    let storeWindow: Window | null = null;
    try {
      storeWindow = window.open('about:blank', '_blank');
    } catch {
      // Handled if browser strictly disallows synchronous window.open
    }

    try {
      const x = await req(`/api/items/${id}/checkout`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() }
      });
      const targetUrl = x.store_url || x.url;

      if (targetUrl) {
        if (storeWindow && !storeWindow.closed) {
          storeWindow.location.href = targetUrl;
        } else {
          try {
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          } catch {}
        }
      } else if (storeWindow && !storeWindow.closed) {
        storeWindow.close();
      }

      setCheckoutHandoff({
        orderNumber: x.order_number,
        product: x.product || 'Product',
        store: x.store || 'Retail Partner',
        url: targetUrl,
        total: x.total,
        message: x.message,
        savings: x.savings
      });

      setToast(x.message || `Routing to ${x.store || 'retailer'}...`);
      await load();
    } catch (e: any) {
      if (storeWindow && !storeWindow.closed) {
        storeWindow.close();
      }
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startMonitor = async (id: number) => {
    try {
      await req(`/api/items/${id}/monitor`, { method: 'POST' });
      await load();
      setToast('Monitoring active for this product');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const deleteMonitor = async (id: number) => {
    try {
      await req(`/api/items/${id}/monitor`, { method: 'DELETE' });
      await load();
      setToast('Price monitor removed');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const triggerPriceCheck = async (id: number) => {
    try {
      const res = await req(`/api/monitoring/${id}/check`, { method: 'POST' });
      await load();
      setToast(`Live price checked: ₹${Number(res.current_price || 0).toLocaleString()}`);
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const openDecisionLab = async (pid: number) => {
    setDecisionPid(pid);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('sa_decision_pid', String(pid)); } catch {}
    }
    setBusy(true);
    try {
      const lab = await req(`/api/products/${pid}/decision-lab?t=${Date.now()}`);
      setDecisionData(lab);
      setTab('Decision Lab');
      setToast('Decision Lab updated with latest intelligence');
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const compareItem = async (item: Item) => {
    if (!item.product_id) {
      setToast('No linked product catalogue entry yet.');
      return;
    }
    try {
      const p = await req(`/api/products/${item.product_id}/summary`);
      setCompare(p);
      setTab('Compare');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const savePreferences = async (newPrefs: any) => {
    setBusy(true);
    try {
      await req('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify(newPrefs)
      });
      setPreferences(newPrefs);
      setToast('Preferences saved securely');
      await load();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const signout = () => {
    localStorage.removeItem('sa_access');
    localStorage.removeItem('sa_refresh');
    localStorage.removeItem('sa_active_tab');
    localStorage.removeItem('sa_active_compare');
    localStorage.removeItem('sa_decision_pid');
    setAuthed(false);
    setTab('Home');
  };

  if (!authed) {
    return (
      <Auth
        mode={mode}
        setMode={setMode}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        auth={auth}
        busy={busy}
        toast={toast}
      />
    );
  }

  const todo = items.filter(x => x.status === 'TODO');
  const completed = items.filter(x => x.status === 'COMPLETED');
  const savedForLater = items.filter(x => x.status === 'BUY_LATER' || x.status === 'SAVED_FOR_LATER');
  const title = tab === 'Home' ? 'Good morning' : tab;
  const stats = [
    ['To-Buy', todo.length, ListChecks, 'neutral'],
    ['Monitoring', data?.stats?.monitored || monitor.length, Target, 'purple'],
    ['Verified savings', `₹${Number(data?.stats?.verified_savings || 0).toLocaleString()}`, CircleDollarSign, 'green'],
    ['Orders', orders.length, Package, 'orange']
  ];

  return (
    <div className={dark ? 'app dark' : 'app'}>
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <div><b>ShopAgent</b><small>Personal AI Shopping Assistant</small></div>
        </div>
        <div className="live-badge"><span className="live-dot" /> LIVE VERIFIED ENGINE</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button key={name} className={tab === name ? 'selected' : ''} onClick={() => { setTab(name); setMobileOpen(false); }}>
              <Icon size={18} />
              <span>{name}</span>
              {name === 'Monitoring' && monitor.length > 0 ? <em>{monitor.length}</em> : null}
              {name === 'To-Buy' && todo.length > 0 ? <em>{todo.length}</em> : null}
              {name === 'Master Cart' && todo.length > 0 ? <em>{todo.length}</em> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-agent">
          <div className="agent-orb"><Bot size={26} /></div>
          <b>AI Shopping Agent</b>
          <span>Optimizing strictly for your savings and benefit.</span>
          <button onClick={() => setTab('Agent Activity')}>View audit trail <ChevronDown size={14} /></button>
        </div>
        <button className="signout" onClick={signout}><LogOut size={16} /> Sign out</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="top-inner">
            <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X /> : <Menu />}</button>
            <div>
              <span className="crumb">SHOPAGENT / {tab.toUpperCase()}</span>
              <h1>{title}{tab === 'Home' && <span className="wave"> 👋</span>}</h1>
            </div>
            <div className="top-actions">
              <div className="global-search"><Search size={16} /><input placeholder="Search products, orders, intelligence…" /><kbd>⌘K</kbd></div>
              <button className="round" title="Notifications" onClick={() => setTab('Agent Activity')}><Bell size={17} /><i /></button>
              <button className="profile" onClick={() => setTab('Settings')}>
                <span>SA</span>
                <div><b>Account</b><small>Verified Pro</small></div>
                <ChevronDown size={14} />
              </button>
              <button className="round" title="Sign out" onClick={signout} style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)' }}>
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        <div className="content">
          {tab === 'Home' && <Home input={input} setInput={setInput} run={run} busy={busy} stats={stats} todo={todo} activity={activity} compareItem={compareItem} openDecisionLab={openDecisionLab} buy={buy} startMonitor={startMonitor} setTab={setTab} productUrl={productUrl} setProductUrl={setProductUrl} analyzeUrl={analyzeUrl} urlBusy={urlBusy} onSaveForLater={saveForLater} />}
          {tab === 'To-Buy' && (
            <TodoPage
              items={items}
              todo={todo}
              completed={completed}
              savedForLater={savedForLater}
              compareItem={compareItem}
              openDecisionLab={openDecisionLab}
              buy={buy}
              startMonitor={startMonitor}
              onAddItem={addNewItem}
              onDeleteItem={deleteItem}
              onToggleStatus={toggleItemStatus}
              onSaveForLater={saveForLater}
              onMoveToCart={moveToCart}
              onVote={voteItem}
            />
          )}
          {tab === 'Decision Lab' && (
            <DecisionLabPage
              items={items}
              selectedPid={decisionPid}
              data={decisionData}
              onSelectProduct={openDecisionLab}
              onSwap={swapItem}
              onBuy={buy}
              onRefresh={async (targetPid?: number) => {
                const pidToRefresh = targetPid || decisionPid || (decisionData && decisionData.product_id) || (items.find((x: any) => x.product_id)?.product_id);
                if (pidToRefresh) {
                  await openDecisionLab(pidToRefresh);
                }
                await load();
              }}
              refreshing={busy}
            />
          )}
          {tab === 'Master Cart' && (
            <MasterCartPage
              data={basketData}
              strategy={basketStrategy}
              setStrategy={async (st: string) => {
                setBasketStrategy(st);
                setBasketData(await req(`/api/basket?strategy=${st}`));
              }}
              todo={todo}
              savedForLater={savedForLater}
              buyItem={buy}
              onSaveForLater={saveForLater}
              onMoveToCart={moveToCart}
              onDeleteItem={deleteItem}
            />
          )}
          {tab === 'Batch Intake' && <BatchPage urls={batchUrls} setUrls={setBatchUrls} items={batchItems} setItems={setBatchItems} busy={batchBusy} result={batchResult} process={processBatch} monitor={batchMonitor} setMonitor={setBatchMonitor} target={batchTarget} setTarget={setBatchTarget} onScanInvoice={async (txt: string) => { const res = await req('/api/invoices/scan', { method: 'POST', body: JSON.stringify({ text: txt }) }); for (const it of res.items) { await addNewItem(it.item, it.price); } setToast(`Imported ${res.items.length} items from scanned invoice!`); }} />}
          {tab === 'Monitoring' && <Monitoring rows={monitor} refresh={load} openDecisionLab={openDecisionLab} onCheck={triggerPriceCheck} onDelete={deleteMonitor} />}
          {tab === 'Deals' && <Deals deals={deals} openDecisionLab={openDecisionLab} buy={buy} />}
          {tab === 'Orders' && <Orders orders={orders} onViewReceipt={viewOrderReceipt} />}
          {tab === 'Savings' && <Savings data={data} orders={orders} />}
          {tab === 'Agent Activity' && <ActivityPage rows={activity} />}
          {tab === 'Compare' && <Compare data={compare} back={() => setTab('To-Buy')} openDecisionLab={openDecisionLab} onSwap={swapItem} onRefresh={() => compare?.product_id && compareItem({ product_id: compare.product_id } as any)} refreshing={busy} />}
          {tab === 'Settings' && <SettingsPage dark={dark} setDark={setDark} aiStatus={aiStatus} preferences={preferences} savePreferences={savePreferences} busy={busy} signout={signout} />}
        </div>
      </main>
      {activeReceipt && <ReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />}
      {checkoutHandoff && <CheckoutHandoffModal handoff={checkoutHandoff} onClose={() => setCheckoutHandoff(null)} />}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function Auth({ mode, setMode, email, setEmail, password, setPassword, auth, busy, toast }: any) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <div><b>ShopAgent</b><small>Personal AI Shopping Assistant</small></div>
        </div>
        <span className="auth-eyebrow">PRIVATE SHOPPING COMMAND CENTER</span>
        <h1>{mode === 'login' ? 'Sign in to ShopAgent.' : 'Create your account.'}</h1>
        <p>One unified place to search, verify, compare, monitor, and control your shopping without markups or fake deals.</p>
        
        <form onSubmit={e => { e.preventDefault(); auth(); }} className="auth-inputs">
          <label>
            <span>Email</span>
            <input
              type="email"
              placeholder="you@domain.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="primary auth-submit"
            disabled={busy}
            style={{ width: '100%', marginTop: 12, height: 46, fontSize: 14, fontWeight: 700 }}
          >
            {busy ? 'Processing…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <div className="auth-switch" style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
            {mode === 'login' ? (
              <>New to ShopAgent? <button type="button" className="switch" style={{ width: 'auto', display: 'inline', margin: 0, padding: 0 }} onClick={() => setMode('register')}>Create account</button></>
            ) : (
              <>Already have an account? <button type="button" className="switch" style={{ width: 'auto', display: 'inline', margin: 0, padding: 0 }} onClick={() => setMode('login')}>Sign in</button></>
            )}
          </div>
        </form>
        {toast && <div className="auth-error">{toast}</div>}
      </div>
    </div>
  );
}

function Home({ input, setInput, run, busy, stats, todo, activity, compareItem, openDecisionLab, buy, startMonitor, setTab, productUrl, setProductUrl, analyzeUrl, urlBusy, onSaveForLater }: any) {
  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-badge"><Sparkles size={13} /> AI SHOPPING COMMAND CENTER</span>
          <h2>Don't shop.<br /><span>Tell ShopAgent.</span></h2>
          <p>Describe what you need. ShopAgent matches verified product DNA, compares across retailers, calculates true totals with discounts, monitors price drops, and challenges impulsive purchases.</p>
          <div className="command">
            <Search size={18} />
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()} placeholder="Try: Monitor Sony WH-1000XM6 below ₹25,000…" />
            <button onClick={run} disabled={busy}>{busy ? 'Running…' : <>Run agent <Zap size={14} /></>}</button>
          </div>
          <div className="suggestions">
            <button onClick={() => setInput('Find the cheapest 5kg basmati rice')}>Cheapest rice</button>
            <button onClick={() => setInput('Monitor Sony WH-1000XM6 below ₹25,000 and ask me before buying')}>Monitor headphones</button>
            <button onClick={() => setInput('Buy USB-C 100W cable under ₹900')}>Buy cable</button>
            <button onClick={() => setInput('Logitech MX Master 3S under ₹8,000')}>Compare mouse</button>
          </div>
          <div className="url-intake">
            <div className="url-intake-head">
              <div>
                <span className="eyebrow">PRODUCT URL INTELLIGENCE</span>
                <b>Paste any product link</b>
                <small>ShopAgent extracts Product DNA, verifies exact variants, and compares live store prices.</small>
              </div>
              <span className="url-badge">LIVE EXTRACTOR</span>
            </div>
            <div className="url-command">
              <span>↗</span>
              <input value={productUrl} onChange={e => setProductUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && analyzeUrl(false)} placeholder="https://amazon.in/dp/... or https://store.com/product/..." />
              <button onClick={() => analyzeUrl(false)} disabled={urlBusy}>{urlBusy ? 'Extracting…' : 'Compare'}</button>
              <button className="url-monitor" onClick={() => analyzeUrl(true)} disabled={urlBusy}>Compare + Monitor</button>
            </div>
            {urlBusy && (
              <div style={{
                marginTop: 10,
                padding: '8px 12px',
                background: 'rgba(15, 23, 42, 0.9)',
                borderRadius: 8,
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#38bdf8',
                fontSize: 13
              }}>
                <Sparkles size={14} className="animate-spin" />
                <span>Extracting live product specifications, stock status, and real customer reviews…</span>
              </div>
            )}
          </div>
        </div>
        <div className="hero-stats">
          {stats.map(([label, val, Icon, cls]: any) => (
            <div className={`stat-card ${cls}`} key={label}>
              <div><span>{label}</span><b>{val}</b></div>
              <Icon size={24} />
            </div>
          ))}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">YOUR SHOPPING PLAN</span><h3>To-Buy</h3></div>
            <button className="link-btn" onClick={() => setTab('To-Buy')}>View all <ChevronDown size={14} /></button>
          </div>
          {todo.length ? todo.slice(0, 5).map((i: Item) => (
            <ProductRow key={i.id} item={i} compare={() => compareItem(i)} openDecisionLab={() => i.product_id && openDecisionLab(i.product_id)} buy={() => buy(i.id)} monitor={() => startMonitor(i.id)} onSaveForLater={() => onSaveForLater && onSaveForLater(i.id)} />
          )) : (
            <Empty icon={ListChecks} text="Your To-Buy list is clear." action="Add something" onClick={() => document.querySelector<HTMLInputElement>('.command input')?.focus()} />
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">TRANSPARENT AGENT</span><h3>Live activity</h3></div>
            <button className="link-btn" onClick={() => setTab('Agent Activity')}>View all <ChevronDown size={14} /></button>
          </div>
          <ActivityMini rows={activity} />
        </section>
      </div>
    </div>
  );
}

function TodoPage({ items, todo, completed, savedForLater = [], compareItem, openDecisionLab, buy, startMonitor, onAddItem, onDeleteItem, onToggleStatus, onSaveForLater, onMoveToCart, onVote }: any) {
  const [filter, setFilter] = useState<'ALL' | 'BUY_NOW' | 'MONITOR' | 'BUY_LATER' | 'COMPLETED'>('ALL');
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemMode, setNewItemMode] = useState('BUY_NOW');
  const [showGiftOptions, setShowGiftOptions] = useState(false);
  const [isGift, setIsGift] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [giftWrap, setGiftWrap] = useState(false);

  const activeItems = items.filter((x: Item) => x.status !== 'COMPLETED' && x.status !== 'BUY_LATER' && x.status !== 'SAVED_FOR_LATER');

  const filteredItems = filter === 'COMPLETED' ? completed : filter === 'BUY_LATER' ? savedForLater : activeItems.filter((x: Item) => {
    if (filter === 'BUY_NOW') return x.mode === 'BUY_NOW';
    if (filter === 'MONITOR') return x.mode === 'MONITOR';
    return true;
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    onAddItem(
      newItemName,
      newItemPrice ? Number(newItemPrice) : undefined,
      newItemMode,
      isGift,
      giftRecipient,
      giftMessage,
      giftWrap
    );
    setNewItemName('');
    setNewItemPrice('');
    setIsGift(false);
    setGiftRecipient('');
    setGiftMessage('');
    setShowGiftOptions(false);
  };

  return (
    <div className="stack">
      <PageTitle eyebrow="SMART SHOPPING LIST" title="To-Buy" meta={`${activeItems.length} active • ${savedForLater.length} buy later`} />

      {/* Add New Item Form with Gift Mode */}
      <form className="panel" onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input style={{ flex: 2, minWidth: 200, padding: '10px 14px', borderRadius: 8, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }} placeholder="Add product or item name..." value={newItemName} onChange={e => setNewItemName(e.target.value)} />
          <input style={{ flex: 1, minWidth: 120, padding: '10px 14px', borderRadius: 8, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }} placeholder="Target price (₹)" type="number" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} />
          <select style={{ padding: '10px 14px', borderRadius: 8, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }} value={newItemMode} onChange={e => setNewItemMode(e.target.value)}>
            <option value="BUY_NOW">Buy Now</option>
            <option value="MONITOR">Monitor Price</option>
          </select>
          <button
            type="button"
            className={`filter ${isGift ? 'active' : ''}`}
            onClick={() => { setIsGift(!isGift); setShowGiftOptions(!isGift); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: isGift ? '#f97316' : undefined, color: isGift ? '#fb923c' : undefined }}
          >
            <Gift size={14} /> Gift Mode
          </button>
          <button type="submit" className="primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> Add Item</button>
        </div>

        {showGiftOptions && isGift && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, padding: '10px 14px', borderRadius: 6, background: '#1e1b4b', border: '1px dashed #f97316' }}>
            <input
              placeholder="Recipient Name (e.g. Rahul / Mom)"
              value={giftRecipient}
              onChange={e => setGiftRecipient(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: 13 }}
            />
            <input
              placeholder="Personalized Gift Note (e.g. Happy Birthday!)"
              value={giftMessage}
              onChange={e => setGiftMessage(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: 13 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fed7aa', cursor: 'pointer' }}>
              <input type="checkbox" checked={giftWrap} onChange={e => setGiftWrap(e.target.checked)} />
              Add Gift Wrap
            </label>
          </div>
        )}
      </form>

      <div className="panel">
        <div className="filterbar">
          <button className={`filter ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>Active <span>{activeItems.length}</span></button>
          <button className={`filter ${filter === 'BUY_NOW' ? 'active' : ''}`} onClick={() => setFilter('BUY_NOW')}>Buy Now <span>{activeItems.filter((x: any) => x.mode === 'BUY_NOW').length}</span></button>
          <button className={`filter ${filter === 'MONITOR' ? 'active' : ''}`} onClick={() => setFilter('MONITOR')}>Monitor <span>{activeItems.filter((x: any) => x.mode === 'MONITOR').length}</span></button>
          <button className={`filter ${filter === 'BUY_LATER' ? 'active' : ''}`} onClick={() => setFilter('BUY_LATER')}>Buy Later <span>{savedForLater.length}</span></button>
          <button className={`filter ${filter === 'COMPLETED' ? 'active' : ''}`} onClick={() => setFilter('COMPLETED')}>Completed <span>{completed.length}</span></button>
        </div>
        {filteredItems.length ? filteredItems.map((i: Item) => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => onToggleStatus(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: i.status === 'COMPLETED' ? '#22c55e' : '#64748b' }}>
              <Check size={20} />
            </button>
            <div style={{ flex: 1 }}>
              <ProductRow
                item={i}
                compare={() => compareItem(i)}
                openDecisionLab={() => i.product_id && openDecisionLab(i.product_id)}
                buy={() => buy(i.id)}
                monitor={() => startMonitor(i.id)}
                onSaveForLater={() => onSaveForLater && onSaveForLater(i.id)}
                onMoveToCart={() => onMoveToCart && onMoveToCart(i.id)}
                onVote={onVote}
              />
            </div>
            <button onClick={() => onDeleteItem(i.id)} title="Delete item" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 8 }}>
              <Trash2 size={16} />
            </button>
          </div>
        )) : <Empty icon={ListChecks} text={`No items under ${filter} filter.`} />}
      </div>
    </div>
  );
}

function PriceHistoryChart({ tracker, currentPrice }: { tracker: any; currentPrice: number }) {
  if (!tracker || !tracker.timeline || tracker.timeline.length === 0) return null;

  const timeline = tracker.timeline;
  const prices = tracker.prices || timeline.map((t: any) => t.price);
  const low = tracker.all_time_low || Math.min(...prices);
  const high = tracker.all_time_high || Math.max(...prices);
  const avg = tracker.average_price || Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length);
  const current = currentPrice || tracker.current_price;
  const diffVsAvg = current - avg;
  const diffPct = tracker.diff_pct !== undefined ? tracker.diff_pct : Math.round((diffVsAvg / Math.max(avg, 1)) * 100);

  // SVG Chart Dimensions
  const svgWidth = 800;
  const svgHeight = 220;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const minP = low * 0.96;
  const maxP = high * 1.04;
  const rangeP = Math.max(maxP - minP, 1);

  const getY = (p: number) => padTop + chartH * (1 - (p - minP) / rangeP);
  const getX = (idx: number) => padLeft + (idx / Math.max(timeline.length - 1, 1)) * chartW;

  const points = timeline.map((pt: any, i: number) => ({
    x: getX(i),
    y: getY(pt.price),
    ...pt
  }));

  const pathD = points.reduce((acc: string, pt: any, i: number) => {
    return `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;

  const yLow = getY(low);
  const yAvg = getY(avg);
  const yHigh = getY(high);

  return (
    <div className="panel" style={{ borderColor: '#3b82f6', overflow: 'hidden' }}>
      <div className="panel-head">
        <div>
          <span className="eyebrow" style={{ color: '#60a5fa' }}>90-DAY PRICE HISTORY &amp; BENCHMARKS</span>
          <h3>Price History &amp; Trend Graph</h3>
        </div>
        <span className="status blue" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={13} /> 90 Days Tracked
        </span>
      </div>

      {/* 4 Quick Stat Cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 18 }}>
        <div className="price-stat-pill" style={{ borderLeft: '4px solid #10b981' }}>
          <span>All-Time Recorded Low</span>
          <strong style={{ color: '#34d399' }}>₹{Number(low).toLocaleString()}</strong>
        </div>
        <div className="price-stat-pill" style={{ borderLeft: '4px solid #3b82f6' }}>
          <span>90-Day Fair Average</span>
          <strong style={{ color: '#60a5fa' }}>₹{Number(avg).toLocaleString()}</strong>
        </div>
        <div className="price-stat-pill" style={{ borderLeft: '4px solid #f43f5e' }}>
          <span>Highest Recorded Peak</span>
          <strong style={{ color: '#fb7185' }}>₹{Number(high).toLocaleString()}</strong>
        </div>
        <div className="price-stat-pill" style={{ borderLeft: `4px solid ${diffVsAvg <= 0 ? '#10b981' : '#f59e0b'}` }}>
          <span>Live vs 90-Day Avg</span>
          <strong style={{ color: diffVsAvg <= 0 ? '#34d399' : '#fbbf24' }}>
            {diffVsAvg <= 0 ? `-₹${Math.abs(diffVsAvg).toLocaleString()} (${Math.abs(diffPct)}% below)` : `+₹${diffVsAvg.toLocaleString()} (${diffPct}% above)`}
          </strong>
        </div>
      </div>

      {/* SVG Interactive Timeline */}
      <div className="price-history-container" style={{ padding: 12 }}>
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Reference Line: Highest */}
          <line x1={padLeft} y1={yHigh} x2={svgWidth - padRight} y2={yHigh} stroke="#f43f5e" strokeDasharray="4 4" strokeOpacity="0.5" strokeWidth="1" />
          <text x={padLeft + 6} y={yHigh - 6} fill="#fb7185" fontSize="10" fontWeight="600">PEAK ₹{Number(high).toLocaleString()}</text>

          {/* Reference Line: Average */}
          <line x1={padLeft} y1={yAvg} x2={svgWidth - padRight} y2={yAvg} stroke="#3b82f6" strokeDasharray="4 4" strokeOpacity="0.5" strokeWidth="1" />
          <text x={padLeft + 6} y={yAvg - 6} fill="#60a5fa" fontSize="10" fontWeight="600">90-DAY AVG ₹{Number(avg).toLocaleString()}</text>

          {/* Reference Line: Lowest */}
          <line x1={padLeft} y1={yLow} x2={svgWidth - padRight} y2={yLow} stroke="#10b981" strokeDasharray="4 4" strokeOpacity="0.6" strokeWidth="1.2" />
          <text x={padLeft + 6} y={yLow - 6} fill="#34d399" fontSize="10" fontWeight="700">LOW ₹{Number(low).toLocaleString()}</text>

          {/* Area Fill */}
          <path d={areaD} fill="url(#priceGradient)" />

          {/* Main Line */}
          <path d={pathD} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data Points */}
          {points.map((pt: any, i: number) => {
            const isLatest = i === points.length - 1;
            const isLowest = pt.price === low;
            return (
              <g key={i}>
                {isLatest && (
                  <circle cx={pt.x} cy={pt.y} r="8" fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.7">
                    <animate attributeName="r" values="6;11;6" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isLatest ? 5 : isLowest ? 4.5 : 3.5}
                  fill={isLatest ? '#22c55e' : isLowest ? '#34d399' : '#818cf8'}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
                <text
                  x={pt.x}
                  y={padTop + chartH + 18}
                  fill="#94a3b8"
                  fontSize="9.5"
                  textAnchor="middle"
                >
                  {pt.days_ago === 0 ? 'Live' : `${pt.days_ago}d`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Milestone event badges */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 4px 4px', marginTop: 8 }}>
        {timeline.map((m: any, i: number) => (
          <div key={i} style={{ minWidth: 140, flex: '0 0 auto', background: '#0b1329', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600 }}>{m.days_ago === 0 ? 'Today (Live)' : `${m.days_ago} days ago`}</div>
            <div style={{ fontSize: 12, color: '#fff', fontWeight: 700, margin: '2px 0' }}>₹{Number(m.price).toLocaleString()}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.event}</div>
            <div style={{ fontSize: 9, color: '#64748b' }}>{m.store}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionLabPage({ items, selectedPid, data, onSelectProduct, onSwap, onRefresh, refreshing, onBuy }: any) {
  const productItems = items.filter((x: any) => x.product_id);
  const activePid = selectedPid || (data && data.product_id) || (productItems[0]?.product_id);
  const linkedItem = items.find((x: any) => x.product_id === activePid);
  const linkedItemId = linkedItem ? linkedItem.id : activePid;

  if (!data) return (
    <div className="stack">
      <div className="page-title">
        <div>
          <span className="eyebrow">AI INTELLIGENCE</span>
          <h2>Decision Lab</h2>
        </div>
        {productItems.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select className="batch-target" value={activePid || ''} onChange={e => onSelectProduct(Number(e.target.value))}>
              {productItems.map((p: any) => (
                <option key={p.id} value={p.product_id}>{cleanProductName(p.name, 45)}</option>
              ))}
            </select>
            <button
              type="button"
              className="primary"
              onClick={() => activePid && onSelectProduct(activePid)}
              disabled={refreshing}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Sparkles size={14} className={refreshing ? 'animate-spin' : ''} />
              <span>{refreshing ? 'Analyzing...' : 'Run Lab Analysis'}</span>
            </button>
          </div>
        )}
      </div>
      <div className="panel"><Empty text={productItems.length > 0 ? "Select a product above and click 'Run Lab Analysis' to generate deep intelligence." : "Select an active product to inspect Decision Lab intelligence."} /></div>
    </div>
  );

  const score = data.shopagent_score || {};
  const regret = data.regret_shield || {};
  const simulator = data.buy_vs_wait || [];
  const skeptic = data.second_opinion || {};
  const whyNot = data.why_not_buy || [];
  const dealTruth = data.deal_truth || {};
  const ownership = data.ownership_cost || {};
  const reviews = data.reviews || {};
  const pros = reviews.pros || [];
  const cons = reviews.cons || [];
  const aiSuggestion = reviews.ai_suggestion || '';

  return (
    <div className="stack">
      <div className="page-title">
        <div>
          <span className="eyebrow">INTELLIGENCE LABORATORY</span>
          <h2>Decision Lab: {cleanProductName(data.product, 60)}</h2>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="secondary"
            onClick={() => onRefresh ? onRefresh(activePid) : (activePid && onSelectProduct(activePid))}
            title="Refresh Decision Lab Analysis"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 13, borderColor: '#6366f1', color: '#c7d2fe' }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh Lab</span>
          </button>
          {productItems.length > 1 && (
            <select className="batch-target" value={selectedPid || activePid || ''} onChange={e => onSelectProduct(Number(e.target.value))}>
              {productItems.map((p: any) => (
                <option key={p.id} value={p.product_id}>{cleanProductName(p.name, 45)}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Hero Primary Verdict Card */}
      {(() => {
        const dec = data.decision || {};
        const isBuy = dec.decision === 'BUY';
        const isDont = dec.decision === "DON'T BUY";
        const verdictType = isBuy ? 'buy' : isDont ? 'dont' : 'wait';
        const verdictTitle = dec.verdict || (isBuy ? 'BUY NOW' : isDont ? "DON'T BUY (OVERPRICED)" : 'WAIT FOR PRICE DROP');
        const confidence = dec.confidence || 85;
        const fairPrice = dec.fair_price || data.price_tracker?.average_price || data.current_price;
        const savingsVsAvg = dec.savings_vs_avg;

        return (
          <div className={`verdict-hero-card ${verdictType}`}>
            <div className="verdict-header-row">
              <div>
                <span className="eyebrow" style={{ color: isBuy ? '#34d399' : isDont ? '#f87171' : '#fbbf24', letterSpacing: '0.1em' }}>
                  PRIMARY ALGORITHMIC VERDICT
                </span>
                <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '6px 0 8px', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  {verdictTitle}
                  <span className={`verdict-badge-pill ${verdictType}`}>
                    {dec.decision} VERDICT
                  </span>
                </h1>
                <p style={{ fontSize: 14, color: '#cbd5e1', maxWidth: 850, lineHeight: 1.6, margin: 0 }}>
                  {dec.reason}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 16px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Confidence</span>
                  <b style={{ fontSize: 18, color: isBuy ? '#34d399' : isDont ? '#f87171' : '#fbbf24' }}>{confidence}%</b>
                </div>
                {fairPrice && (
                  <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 16px', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Fair Baseline</span>
                    <b style={{ fontSize: 18, color: '#e2e8f0' }}>₹{Number(fairPrice).toLocaleString()}</b>
                  </div>
                )}
                {savingsVsAvg !== undefined && savingsVsAvg > 0 && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: 12, padding: '8px 16px', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: 11, color: '#34d399', textTransform: 'uppercase', fontWeight: 600 }}>Savings vs Avg</span>
                    <b style={{ fontSize: 18, color: '#34d399' }}>₹{Number(savingsVsAvg).toLocaleString()}</b>
                  </div>
                )}
              </div>
            </div>

            {dec.action && (
              <div className="verdict-action-box">
                <div style={{ background: isBuy ? 'rgba(16,185,129,0.2)' : isDont ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)', borderRadius: 8, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isBuy ? <CheckCircle2 size={18} color="#34d399" /> : isDont ? <AlertOctagon size={18} color="#f87171" /> : <Clock3 size={18} color="#fbbf24" />}
                </div>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 12, color: isBuy ? '#34d399' : isDont ? '#f87171' : '#fbbf24', letterSpacing: '0.05em', display: 'block', marginBottom: 2 }}>RECOMMENDED ACTION</b>
                  <span style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>{dec.action}</span>
                </div>
              </div>
            )}

            {onBuy && (
              <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={isBuy ? 'primary' : 'secondary'}
                  onClick={() => onBuy(linkedItemId)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, borderRadius: 8 }}
                >
                  <Zap size={16} />
                  <span>{isBuy ? `Buy Now at ${data.best_store || 'Verified Store'} (₹${Number(data.current_price).toLocaleString()})` : `Checkout at ${data.best_store || 'Store'} Anyway (₹${Number(data.current_price).toLocaleString()})`}</span>
                </button>
              </div>
            )}
          </div>
        );
      })()}

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">RISK &amp; TRUST RADAR</span><h3>ShopAgent Score &amp; Regret Shield</h3></div>
            <span className="status green">{score.grade || 'GRADED'}</span>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 8 }}>
            <div className="stat-card">
              <div>
                <span>ShopAgent Score</span>
                <b style={{ color: '#a78bfa' }}>{score.total !== undefined && score.total !== null ? `${score.total}/100` : '—'}</b>
                <small>{score.grade || 'PENDING'}</small>
              </div>
              <Sparkles size={22} color="#a78bfa" />
            </div>
            <div className="stat-card">
              <div>
                <span>Regret Shield Risk</span>
                <b style={{ color: regret.risk === 'LOW' ? '#22c55e' : regret.risk === 'HIGH' ? '#ef4444' : '#f59e0b' }}>
                  {regret.risk || 'ANALYZING'}
                </b>
                <small>{regret.probability_pct !== undefined && regret.probability_pct !== null ? `${regret.probability_pct}% Remorse Risk` : 'Assessing risk'}</small>
              </div>
              <ShieldAlert size={22} color={regret.risk === 'LOW' ? '#22c55e' : '#f59e0b'} />
            </div>
          </div>
        </div>

        <div className="panel" style={{ borderColor: '#473b75' }}>
          <div className="panel-head">
            <div><span className="eyebrow">SECOND OPINION</span><h3>Skeptic Agent</h3></div>
            <span className="status purple">{skeptic.skeptic_verdict || 'Analysis'}</span>
          </div>
          <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>Independent evaluation challenging the primary recommendation:</p>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
            {(skeptic.arguments || []).map((arg: string, idx: number) => (
              <li key={idx} style={{ marginBottom: 6 }}>{arg}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* 90-Day Price History Graph & Trend Analysis */}
      <PriceHistoryChart tracker={data.price_tracker} currentPrice={data.current_price} />

      <div className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">PRICE TRAJECTORY SIMULATION</span><h3>Buy vs Wait Simulator</h3></div>
          <Clock3 size={18} color="#a78bfa" />
        </div>
        <div className="monitor-table" style={{ padding: 0 }}>
          <div className="monitor-head" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr 2fr' }}>
            <span>TIMELINE</span>
            <span>EXPECTED PRICE</span>
            <span>DROP CHANCE</span>
            <span>POTENTIAL SAVING</span>
            <span>STRATEGY</span>
          </div>
          {simulator.map((s: any) => (
            <div className="monitor-line" key={s.timeline} style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr 2fr' }}>
              <b style={{ color: '#fff' }}>{s.timeline}</b>
              <strong>₹{Number(s.expected_price).toLocaleString()}</strong>
              <span style={{ color: s.drop_probability > 50 ? '#22c55e' : '#94a3b8' }}>{s.drop_probability}%</span>
              <span style={{ color: '#22c55e' }}>{s.expected_savings ? `₹${s.expected_savings.toLocaleString()}` : '—'}</span>
              <span>{s.recommendation}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">PRICE MANIPULATION RADAR</span><h3>Deal Truth Engine</h3></div>
            <span className={`status ${dealTruth.status === 'NORMAL' ? 'green' : 'orange'}`}>{dealTruth.status}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="completed-row"><div><b>Observed Normal Price</b><small>30-day recorded baseline</small></div><strong>₹{Number(dealTruth.observed_normal_price || 0).toLocaleString()}</strong></div>
            <div className="completed-row"><div><b>All-Time Recorded Lowest</b><small>Best observed snapshot</small></div><strong>₹{Number(dealTruth.observed_lowest_price || 0).toLocaleString()}</strong></div>
            <div className="completed-row"><div><b>Real Discount vs Baseline</b><small>Verified real saving</small></div><strong style={{ color: '#22c55e' }}>{dealTruth.real_discount_pct}%</strong></div>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 14 }}>{dealTruth.finding}</p>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">OBJECTIVE FRICTION</span><h3>Why NOT Buy?</h3></div>
            <AlertTriangle size={18} color="#f59e0b" />
          </div>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
            {whyNot.map((r: string, idx: number) => (
              <li key={idx} style={{ marginBottom: 8 }}>{r}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">SOURCE PROVENANCE</span><h3>Review Truth & YouTube Intelligence</h3></div>
          <span className="status green">{reviews.overall_sentiment || 'POSITIVE'}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 16 }}>{reviews.summary}</p>
        <div className="listing-grid">
          {(reviews.articles || []).map((art: any, i: number) => (
            <div className="listing-card" key={i}>
              <div className="listing-head">
                <span className="store-label">{art.source}</span>
                <span className="status green">{art.sentiment}</span>
              </div>
              <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 12 }}>{art.finding}</p>
              <a className="retailer-link" href={art.url} target="_blank" rel="noreferrer">Open Review <ExternalLink size={13} /></a>
            </div>
          ))}
          {(() => {
            const seenYt = new Set();
            const uniqueYt = (reviews.youtube_reviews || []).filter((yt: any) => {
              const key = yt.video_id || yt.url || yt.title;
              if (!key || seenYt.has(key)) return false;
              seenYt.add(key);
              return true;
            });
            return uniqueYt.map((yt: any, i: number) => (
              <div className="listing-card" key={`yt-${yt.video_id || i}`}>
                <div className="listing-head">
                  <span className="store-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PlayCircle size={16} color="#ef4444" /> {yt.channel}
                  </span>
                  <span className="status purple">Video</span>
                </div>
                <b style={{ display: 'block', fontSize: 13, color: '#fff', margin: '10px 0 4px' }}>{yt.title}</b>
                <p style={{ fontSize: 12, color: '#94a3b8' }}>{yt.findings}</p>
                <a className="retailer-link" href={yt.url} target="_blank" rel="noreferrer">Watch on YouTube <ExternalLink size={13} /></a>
              </div>
            ));
          })()}
        </div>

        {/* Verified Customer Reviews (Amazon & Flipkart Buyers) */}
        {(reviews.customer_reviews || []).length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h4 style={{ fontSize: 14, color: '#f8fafc', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} color="#38bdf8" /> Verified Customer Reviews (Amazon &amp; Flipkart Buyers)
            </h4>
            <div className="listing-grid">
              {reviews.customer_reviews.map((cr: any, i: number) => (
                <div className="listing-card" key={`cr-${i}`} style={{ background: '#0b1329', borderColor: '#1e293b' }}>
                  <div className="listing-head">
                    <span className="store-label" style={{ color: '#38bdf8', fontWeight: 600 }}>{cr.store}</span>
                    <span className="status green" style={{ fontSize: 11 }}>★ {Number(cr.rating).toFixed(1)} / 5</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 8px' }}>
                    <b style={{ color: '#e2e8f0' }}>{cr.buyer_name}</b> · <span style={{ color: '#10b981' }}>{cr.badge}</span>
                  </div>
                  <b style={{ display: 'block', fontSize: 13, color: '#fff', margin: '4px 0' }}>{cr.title}</b>
                  <p style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, margin: '6px 0 10px' }}>{cr.review}</p>
                  {cr.pros && cr.pros.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ThumbsUp size={12} /> PROS:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {cr.pros.map((p: string, pIdx: number) => (
                          <span key={pIdx} className="review-pro-tag">
                            ✓ {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {cr.cons && cr.cons.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: '#f87171', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ThumbsDown size={12} /> CONS:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {cr.cons.map((c: string, cIdx: number) => (
                          <span key={cIdx} className="review-con-tag">
                            ✕ {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pros & Cons Analysis */}
      {(pros.length > 0 || cons.length > 0) && (
        <div className="panel" style={{ borderColor: '#6366f1' }}>
          <div className="panel-head">
            <div><span className="eyebrow" style={{ color: '#818cf8' }}>REVIEW ANALYSIS</span><h3>Pros &amp; Cons</h3></div>
            <span className="status purple">{pros.length + cons.length} Points Extracted</span>
          </div>
          <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <h4 style={{ color: '#22c55e', fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>✅ PROS</h4>
              {pros.length === 0 && <p style={{ fontSize: 12, color: '#64748b' }}>No pros extracted from current review snippets.</p>}
              {pros.map((p: any, i: number) => (
                <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{p.point}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 8 }}>
                    <span style={{ color: '#818cf8' }}>{p.category}</span>
                    <span>· {p.source}</span>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <h4 style={{ color: '#f59e0b', fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>❌ CONS</h4>
              {cons.length === 0 && <p style={{ fontSize: 12, color: '#64748b' }}>No cons extracted from current review snippets.</p>}
              {cons.map((c: any, i: number) => (
                <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{c.point}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 8 }}>
                    <span style={{ color: '#f59e0b' }}>{c.category}</span>
                    <span>· {c.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI-Powered Suggestion */}
      {aiSuggestion && (
        <div className="panel" style={{ borderColor: '#a78bfa' }}>
          <div className="panel-head">
            <div><span className="eyebrow" style={{ color: '#a78bfa' }}>AI REVIEW INTELLIGENCE</span><h3>AI Suggestion</h3></div>
            <Sparkles size={18} color="#a78bfa" />
          </div>
          <p style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.7, margin: 0 }}>{aiSuggestion}</p>
        </div>
      )}

      {/* Sustainability & Eco Guardian */}
      {data.sustainability && (
        <div className="panel" style={{ borderColor: '#10b981' }}>
          <div className="panel-head">
            <div>
              <span className="eyebrow" style={{ color: '#10b981' }}>ENVIRONMENTAL FOOTPRINT</span>
              <h3>Sustainability & Eco Guardian</h3>
            </div>
            <span className="status green" style={{ fontSize: 13, fontWeight: 700, padding: '4px 10px' }}>
              GRADE {data.sustainability?.eco_grade || 'PENDING'} ({data.sustainability?.eco_points ?? 0}/100)
            </span>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 14 }}>
            <div className="stat-card">
              <div>
                <span>Packaging Standard</span>
                <b style={{ fontSize: 13, color: '#34d399' }}>{data.sustainability.packaging}</b>
              </div>
              <Leaf size={20} color="#10b981" />
            </div>
            <div className="stat-card">
              <div>
                <span>Carbon Delivery Footprint</span>
                <b style={{ fontSize: 13, color: '#38bdf8' }}>{data.sustainability.carbon_footprint}</b>
              </div>
              <Zap size={20} color="#38bdf8" />
            </div>
            <div className="stat-card">
              <div>
                <span>Durability & Repairability</span>
                <b style={{ fontSize: 13, color: '#a78bfa' }}>{data.sustainability.repairability_score}/10 Index</b>
                <small>{data.sustainability.durability}</small>
              </div>
              <Scale size={20} color="#a78bfa" />
            </div>
          </div>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
            {(data.sustainability.highlights || []).map((h: string, idx: number) => (
              <li key={idx} style={{ marginBottom: 4 }}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Smart Brand Substitutes & Alternative Discovery */}
      {data.substitutes && data.substitutes.length > 0 && (
        <div className="panel" style={{ borderColor: '#6366f1' }}>
          <div className="panel-head">
            <div>
              <span className="eyebrow" style={{ color: '#818cf8' }}>SMART ALTERNATIVES & DISCOVERY</span>
              <h3>Verified Brand Substitutes</h3>
            </div>
            <button
              type="button"
              onClick={() => onRefresh ? onRefresh(activePid) : (activePid && onSelectProduct(activePid))}
              title="Refresh Brand Substitutes & Recommendations"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid #6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, color: '#a5b4fc', transition: 'all 0.2s' }}
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          <p style={{ fontSize: 13, color: '#cbd5e1', margin: '4px 0 14px' }}>
            AI-discovered alternatives with identical active specifications or greater price-to-performance value:
          </p>
          <div className="listing-grid">
            {data.substitutes.map((sub: any, idx: number) => (
              <div className="listing-card" key={idx} style={{ borderColor: sub.savings > 0 ? '#10b981' : undefined }}>
                <div className="listing-head">
                  <span className="store-label">{sub.brand}</span>
                  <span className="status purple">{sub.type}</span>
                </div>
                <b style={{ display: 'block', fontSize: 14, color: '#fff', margin: '8px 0 4px' }}>{sub.name}</b>
                {sub.specs && (
                  <div style={{ fontSize: 11, color: '#818cf8', margin: '4px 0 6px', lineHeight: 1.4 }}>
                    <b>Specs:</b> {sub.specs}
                  </div>
                )}
                <div className="listing-price">₹{Number(sub.price).toLocaleString()}</div>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 10px' }}>{sub.reason}</p>
                {sub.savings > 0 && (
                  <div style={{ color: '#22c55e', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                    💰 Save ₹{Number(sub.savings).toLocaleString()} vs current item
                  </div>
                )}
                <button
                  type="button"
                  className="primary"
                  onClick={() => onSwap && linkedItemId && onSwap(linkedItemId, sub.name)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <RefreshCw size={13} /> 1-Click Swap with this
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">LONG-TERM VALUE</span><h3>True Cost of Ownership Projections</h3></div>
          <Scale size={18} color="#a78bfa" />
        </div>
        <div className="stat-grid">
          {(ownership.projections || []).map((pr: any) => (
            <div className="stat-card" key={pr.years}>
              <div>
                <span>{pr.years} Year Cost</span>
                <b>₹{Number(pr.net_cost).toLocaleString()}</b>
                <small>Est. Resale: ₹{Number(pr.resale_estimate).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MasterCartPage({ data, strategy, setStrategy, todo, savedForLater = [], buyItem, onSaveForLater, onMoveToCart, onDeleteItem }: any) {
  const stores = data?.stores || {};
  const total = Number(data?.total || 0);
  const savings = Number(data?.savings || 0);

  const handleCheckoutStore = (storeName: string) => {
    const matched = todo.find((it: any) => it.decision?.best_store?.toLowerCase().includes(storeName.toLowerCase())) || todo[0];
    if (matched) {
      buyItem(matched.id);
    }
  };

  return (
    <div className="stack">
      <PageTitle eyebrow="MULTI-STORE OPTIMIZER" title="Master Cart" meta={`${todo.length} active in basket • ${savedForLater.length} saved for later`} />
      
      {/* Active Basket Panel */}
      <div className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">OPTIMIZATION STRATEGY</span><h3>Cross-Store Cart</h3></div>
          <div className="filterbar" style={{ margin: 0 }}>
            <button className={`filter ${strategy === 'CHEAPEST' ? 'active' : ''}`} onClick={() => setStrategy('CHEAPEST')}>Lowest Total</button>
            <button className={`filter ${strategy === 'FEWEST_STORES' ? 'active' : ''}`} onClick={() => setStrategy('FEWEST_STORES')}>Fewest Stores</button>
          </div>
        </div>
        <div className="dashboard-grid">
          <div>
            <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 14 }}>
              ShopAgent splits your shopping needs across verified retailers to ensure you get the absolute lowest combined total. Click <b>Buy Later</b> on previous items to postpone them so they don't block your current checkout.
            </p>
            {Object.keys(stores).length ? Object.entries(stores).map(([storeName, amount]: any) => (
              <div className="completed-row" key={storeName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#1e293b', borderRadius: 8, marginBottom: 8 }}>
                <div>
                  <b style={{ fontSize: 15, color: '#fff' }}>{storeName}</b>
                  <small style={{ display: 'block', color: '#94a3b8' }}>Verified retail partner basket</small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <strong style={{ fontSize: 16, color: '#38bdf8' }}>₹{Number(amount).toLocaleString()}</strong>
                  <button
                    className="primary"
                    style={{ padding: '6px 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={() => handleCheckoutStore(storeName)}
                  >
                    <span>Checkout ↗</span>
                  </button>
                </div>
              </div>
            )) : <Empty text="No items currently eligible for basket optimization." />}

            {/* Todo Items in Cart List */}
            {todo.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', margin: 0, fontWeight: 700 }}>
                    Active Basket Items ({todo.length})
                  </h4>
                  {todo.length > 1 && (
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      Click 'Buy Later' to defer non-current items
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {todo.map((it: any) => (
                    <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 13, gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <span style={{ color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.name}>
                          {cleanProductName(it.name, 45)}
                        </span>
                        {it.current_price ? <span style={{ color: '#38bdf8', fontSize: 12, fontWeight: 600 }}>₹{Number(it.current_price).toLocaleString()}</span> : null}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button
                          className="secondary"
                          style={{ padding: '4px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                          title="Move to Buy Later: removes from active basket total"
                          onClick={() => onSaveForLater && onSaveForLater(it.id)}
                        >
                          <PauseCircle size={13} />
                          <span>Buy Later</span>
                        </button>
                        <button
                          className="primary"
                          style={{ padding: '5px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => buyItem(it.id)}
                        >
                          <span>Buy Now ↗</span>
                        </button>
                        <button
                          onClick={() => onDeleteItem && onDeleteItem(it.id)}
                          title="Remove item"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <span>Combined Total</span>
              <b style={{ fontSize: 32, color: '#fff' }}>₹{total.toLocaleString()}</b>
              <small style={{ color: '#22c55e', fontSize: 13 }}>Saved ₹{savings.toLocaleString()} vs single store</small>
            </div>
            {todo.length > 0 ? (
              <button className="primary wide" onClick={() => buyItem(todo[0].id)}>
                Proceed to Checkout Handoff <Zap size={14} />
              </button>
            ) : (
              <button className="primary wide" disabled>
                Cart is Empty
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Saved for Later Section */}
      <div className="panel" style={{ marginTop: 8 }}>
        <div className="panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bookmark size={18} color="#f59e0b" />
            <div>
              <span className="eyebrow" style={{ color: '#f59e0b' }}>DEFERRED PRODUCTS</span>
              <h3 style={{ margin: 0 }}>Saved for Later ({savedForLater.length})</h3>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 14px' }}>
          Items moved to Buy Later are kept here safely. They are excluded from your Master Cart combined total so you can check out your current shopping list without interference.
        </p>

        {savedForLater.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedForLater.map((it: any) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, fontSize: 13, gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <b style={{ color: '#fff', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.name}>
                    {cleanProductName(it.name, 60)}
                  </b>
                  <div style={{ display: 'flex', gap: 12, marginTop: 2, fontSize: 12, color: '#94a3b8' }}>
                    {it.current_price ? <span>Price: <strong style={{ color: '#38bdf8' }}>₹{Number(it.current_price).toLocaleString()}</strong></span> : null}
                    {it.target_price ? <span>Target: ₹{Number(it.target_price).toLocaleString()}</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    className="primary"
                    style={{ padding: '6px 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0284c7', borderColor: '#0369a1' }}
                    onClick={() => onMoveToCart && onMoveToCart(it.id)}
                    title="Move back to active Master Cart basket"
                  >
                    <ShoppingCart size={13} />
                    <span>Move to Cart</span>
                  </button>
                  <button
                    className="secondary"
                    style={{ padding: '6px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={() => buyItem(it.id)}
                  >
                    <span>Buy Now ↗</span>
                  </button>
                  <button
                    onClick={() => onDeleteItem && onDeleteItem(it.id)}
                    title="Delete item permanently"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 6 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 13, background: 'rgba(15, 23, 42, 0.4)', borderRadius: 8 }}>
            No items in Buy Later. Click "Buy Later" on any active cart item to postpone it.
          </div>
        )}
      </div>
    </div>
  );
}

function BatchPage({ urls, setUrls, items, setItems, busy, result, process, monitor, setMonitor, target, setTarget, onScanInvoice }: any) {
  const [invoiceText, setInvoiceText] = useState('');
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const handleInvoiceScan = async () => {
    if (!invoiceText.trim()) return;
    setInvoiceBusy(true);
    try {
      await onScanInvoice(invoiceText);
      setInvoiceText('');
    } finally {
      setInvoiceBusy(false);
    }
  };

  return (
    <div className="stack">
      <PageTitle eyebrow="BULK & INVOICE INTELLIGENCE" title="Batch Intake" meta="Multiple URLs + shopping lists + digital tax invoices" />
      <div className="batch-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div className="panel batch-panel">
          <div className="panel-head"><div><span className="eyebrow">PRODUCT URLS</span><h3>Compare URLs at once</h3></div><Layers3 size={18} /></div>
          <p className="batch-help">Paste one product URL per line. ShopAgent verifies each page, extracts Product DNA, and links live stores.</p>
          <textarea className="batch-textarea" value={urls} onChange={e => setUrls(e.target.value)} placeholder={'https://store.example/product-a\nhttps://store.example/product-b'} />
          <div className="batch-options"><label><input type="checkbox" checked={monitor} onChange={e => setMonitor(e.target.checked)} /> Monitor verified URLs</label>{monitor && <input className="batch-target" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target price (₹)" />}</div>
        </div>
        <div className="panel batch-panel">
          <div className="panel-head"><div><span className="eyebrow">TO-BUY LIST</span><h3>Multiple items</h3></div><ListChecks size={18} /></div>
          <p className="batch-help">Add one shopping need per line. Each becomes an independent item that can be compared, monitored, or bought.</p>
          <textarea className="batch-textarea" value={items} onChange={e => setItems(e.target.value)} placeholder={'Sony WH-1000XM6\nLogitech MX Master 3S\n2 kg basmati rice'} />
        </div>
        <div className="panel batch-panel" style={{ borderColor: '#8b5cf6' }}>
          <div className="panel-head"><div><span className="eyebrow" style={{ color: '#a78bfa' }}>INVOICE INTELLIGENCE</span><h3>Scan Digital Receipt</h3></div><FileText size={18} color="#a78bfa" /></div>
          <p className="batch-help">Paste raw invoice text, receipt SMS, or email receipt to extract items, prices, GST, and warranties into your plan.</p>
          <textarea className="batch-textarea" value={invoiceText} onChange={e => setInvoiceText(e.target.value)} placeholder={'BLINKIT COMMERCE\nInvoice INV-882910\nTomatoes 1kg: ₹40\nAmul Butter 500g: ₹58\nTotal: ₹98'} />
          <button type="button" className="primary" onClick={handleInvoiceScan} disabled={invoiceBusy || !invoiceText.trim()} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            {invoiceBusy ? 'Scanning...' : 'Extract & Import Items'} <Sparkles size={14} />
          </button>
        </div>
      </div>
      <div className="batch-actions"><button className="primary" onClick={process} disabled={busy}>{busy ? 'Processing batch…' : 'Process everything'} <Zap size={14} /></button><span>Each URL is processed independently; failed sources are reported without creating fake prices.</span></div>
      {result && <div className="panel batch-result"><div className="panel-head"><div><span className="eyebrow">RESULT</span><h3>Batch processed</h3></div><span className="status green">{result.summary.urls_succeeded} URLS VERIFIED</span></div><div className="batch-summary"><div><b>{result.summary.todo_created}</b><small>To-Buy created</small></div><div><b>{result.summary.urls_succeeded}</b><small>URLs verified</small></div><div><b>{result.summary.urls_failed}</b><small>URLs failed</small></div></div><div className="batch-list">{(result.urls || []).map((r: any) => <div className="batch-row" key={r.url}><span className={r.ok ? 'dot-ok' : 'dot-fail'}></span><div><b>{r.name || r.url}</b><small>{r.ok ? `₹${Number(r.listing.true_total).toLocaleString()} • ${r.monitoring ? 'Monitoring enabled' : 'Buy Now'}` : r.error}</small></div><a href={r.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a></div>)}</div></div>}
    </div>
  );
}

function Monitoring({ rows, refresh, openDecisionLab, onCheck, onDelete }: any) {
  const [filter, setFilter] = useState('ALL');

  const filtered = rows.filter((r: any) => {
    if (filter === 'TARGET_REACHED') return r.status === 'TARGET_REACHED';
    if (filter === 'WATCHING') return r.status === 'WATCHING';
    return true;
  });

  return (
    <div className="stack">
      <PageTitle eyebrow="PRICE INTELLIGENCE" title="Monitoring" meta={<span className="live-pill"><span className="live-dot" /> automatic checks</span>} />
      <div className="monitor-toolbar">
        <div className="monitor-tabs">
          <button className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>All <span>{rows.length}</span></button>
          <button className={filter === 'WATCHING' ? 'active' : ''} onClick={() => setFilter('WATCHING')}>Watching</button>
          <button className={filter === 'TARGET_REACHED' ? 'active' : ''} onClick={() => setFilter('TARGET_REACHED')}>Target Reached</button>
        </div>
        <button className="primary" onClick={refresh}>Refresh all <Zap size={14} /></button>
      </div>
      {filtered.length ? (
        <div className="monitor-table panel">
          <div className="monitor-head"><span>PRODUCT</span><span>CURRENT PRICE</span><span>TARGET</span><span>STATUS</span><span>NEXT CHECK</span><span>ACTION</span></div>
          {filtered.map((m: any) => (
            <div className="monitor-line" key={m.id}>
              <div className="monitor-product">
                <div className="product-thumb">{(m.item?.name || 'MP').slice(0, 2).toUpperCase()}</div>
                <div><b title={m.item?.name || 'Monitored Product'}>{cleanProductName(m.item?.name || 'Monitored Product', 50)}</b><small>{m.item?.purchase_mode || 'MONITOR'} • {m.item?.quantity || 1} unit{(m.item?.quantity || 1) > 1 ? 's' : ''}</small></div>
              </div>
              <strong>{m.best?.true_total ? `₹${Number(m.best.true_total).toLocaleString()}` : 'Unavailable'}</strong>
              <span>{m.item?.target_price ? `₹${Number(m.item.target_price).toLocaleString()}` : '—'}</span>
              <span className={`status ${m.status === 'TARGET_REACHED' ? 'green' : 'purple'}`}>{m.status === 'TARGET_REACHED' ? 'TARGET REACHED' : 'MONITORING'}</span>
              <span className="next"><Clock3 size={13} />{m.next_check ? new Date(m.next_check).toLocaleString() : 'scheduled'}</span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, justifyContent: 'flex-end' }}>
                <button className="icon-action" title="Check Live Price" onClick={() => onCheck(m.id)}><Zap size={14} /></button>
                <button className="icon-action" title="Decision Lab" onClick={() => m.item?.product_id && openDecisionLab(m.item.product_id)}><Sparkles size={14} /></button>
                <button className="icon-action" title="Delete Monitor" onClick={() => m.item?.id && onDelete(m.item.id)} style={{ color: '#ef4444' }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty icon={Target} text="Nothing currently matching your monitor filter." />}
    </div>
  );
}

function Deals({ deals, openDecisionLab, buy }: any) {
  return (
    <div className="stack">
      <PageTitle eyebrow="AI OPPORTUNITIES" title="Deals" meta="Price intelligence" />
      <div className="deal-grid">
        {deals.length ? deals.map((d: any) => (
          <div className="deal-card" key={d.product_id}>
            <div className={`decision ${d.decision === 'BUY' ? 'buy' : d.decision === "DON'T BUY" ? 'dont' : 'wait'}`}>{d.decision}</div>
            <div className="deal-top"><span className="deal-icon"><TrendingDown size={18} /></span><span className="verified">VERIFIED DATA</span></div>
            <h3 title={d.product}>{cleanProductName(d.product, 55)}</h3>
            <strong>₹{Number(d.price).toLocaleString()}</strong>
            <div className="deal-stat"><span>{d.discount_percent}% below observed average</span></div>
            <p>{d.reason}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="secondary" style={{ flex: 1 }} onClick={() => openDecisionLab(d.product_id)}>Decision Lab <Sparkles size={13} /></button>
              <button className="primary" style={{ flex: 1 }} onClick={() => buy(d.item_id || d.product_id)}>Buy Now</button>
            </div>
          </div>
        )) : <Empty text="No deal signals available yet." />}
      </div>
    </div>
  );
}

function Orders({ orders, onViewReceipt }: any) {
  return (
    <div className="stack">
      <PageTitle eyebrow="PURCHASE HISTORY" title="Orders" meta={`${orders.length} orders`} />
      <div className="panel">
        <div className="table-head"><span>PRODUCT</span><span>STORE</span><span>PRICE</span><span>STATUS</span><span>ORDER NUMBER</span><span>RECEIPT</span></div>
        {orders.length ? orders.map((o: any) => (
          <div className="order-row" key={o.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr 1.5fr 1fr', alignItems: 'center' }}>
            <div className="monitor-product">
              <div className="product-thumb">{o.product_name.slice(0, 2).toUpperCase()}</div>
              <div>
                <b title={o.product_name}>{cleanProductName(o.product_name, 50)}</b>
                <small>{new Date(o.created_at).toLocaleString()}</small>
                {o.is_gift && (
                  <span className="status orange" style={{ fontSize: 10, padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                    <Gift size={10} /> Gift {o.gift_recipient ? `to ${o.gift_recipient}` : ''}
                  </span>
                )}
              </div>
            </div>
            <span>{o.store}</span>
            <strong>₹{Number(o.price).toLocaleString()}</strong>
            <span className="status green">{o.status}</span>
            <code>{o.order_number}</code>
            <button
              type="button"
              className="secondary"
              onClick={() => onViewReceipt && onViewReceipt(o.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12 }}
            >
              <FileText size={13} /> Tax Invoice
            </button>
          </div>
        )) : <Empty icon={Package} text="No confirmed orders yet." />}
      </div>
    </div>
  );
}

function ReceiptModal({ receipt, onClose }: any) {
  if (!receipt) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div className="panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #1e293b', paddingBottom: 16, marginBottom: 16 }}>
          <div>
            <span className="eyebrow" style={{ color: '#22c55e' }}>ORIGINAL STORE TAX INVOICE & RECEIPT</span>
            <h2 style={{ fontSize: 20, margin: '4px 0', color: '#fff' }}>Official Purchase Tax Receipt</h2>
            <small style={{ color: '#94a3b8' }}>Verified directly against {receipt.seller} records • Date: {receipt.date}</small>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {/* Store Identifiers: Order ID & Invoice ID for Returns and Warranties */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: 13, background: '#1e293b', padding: 14, borderRadius: 8 }}>
          <div>
            <span style={{ color: '#94a3b8', display: 'block', fontSize: 11 }}>ORIGINAL STORE ORDER ID (FOR RETURNS)</span>
            <b style={{ color: '#38bdf8', fontSize: 14, letterSpacing: '0.5px' }}>{receipt.retailer_order_id || receipt.order_number}</b>
          </div>
          <div>
            <span style={{ color: '#94a3b8', display: 'block', fontSize: 11 }}>TAX INVOICE NUMBER</span>
            <b style={{ color: '#a78bfa', fontSize: 14 }}>{receipt.invoice_number}</b>
          </div>
          <div>
            <span style={{ color: '#94a3b8', display: 'block', fontSize: 11 }}>SELLER / PLATFORM</span>
            <b style={{ color: '#fff' }}>{receipt.seller}</b>
          </div>
          <div>
            <span style={{ color: '#94a3b8', display: 'block', fontSize: 11 }}>WARRANTY COVERAGE</span>
            <b style={{ color: '#34d399' }}>{receipt.warranty}</b>
          </div>
          {receipt.is_gift && (
            <div style={{ gridColumn: 'span 2', borderTop: '1px dashed #475569', paddingTop: 8, marginTop: 4 }}>
              <span style={{ color: '#fed7aa', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                <Gift size={13} /> Gifting Order for {receipt.gift_recipient || 'Special Someone'}
              </span>
              {receipt.gift_message && <p style={{ fontSize: 12, color: '#fde68a', margin: '2px 0 0', fontStyle: 'italic' }}>"{receipt.gift_message}"</p>}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #334155', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', background: '#1e293b', padding: '8px 12px', fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
            <span>ITEM DESCRIPTION</span>
            <span>GST (5%)</span>
            <span style={{ textAlign: 'right' }}>AMOUNT</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', padding: '12px', fontSize: 13, color: '#fff', borderTop: '1px solid #334155', alignItems: 'center' }}>
            <span>{receipt.product_name}</span>
            <span style={{ color: '#94a3b8' }}>₹{Number(receipt.gst_tax || 0).toLocaleString()}</span>
            <strong style={{ textAlign: 'right' }}>₹{Number(receipt.price || 0).toLocaleString()}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#064e3b', borderRadius: 8, marginBottom: 16 }}>
          <span style={{ color: '#a7f3d0', fontSize: 13 }}>Verified Savings vs Offline/List Price:</span>
          <strong style={{ color: '#34d399', fontSize: 15 }}>₹{Number(receipt.savings || 0).toLocaleString()}</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1e293b', paddingTop: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Security ID: <code>{receipt.qr_verification_code}</code>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {receipt.store_return_url && (
              <a
                href={receipt.store_return_url}
                target="_blank"
                rel="noreferrer"
                className="secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, color: '#38bdf8', textDecoration: 'none' }}
              >
                <ExternalLink size={13} /> Manage Returns on {receipt.seller}
              </a>
            )}
            <button className="primary" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
              <FileText size={14} /> Print / Save PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutHandoffModal({ handoff, onClose }: any) {
  if (!handoff) return null;
  const store = handoff.store || 'Retail Partner';
  const isAmazon = store.toLowerCase().includes('amazon');
  const isFlipkart = store.toLowerCase().includes('flipkart');
  const isCroma = store.toLowerCase().includes('croma');
  const isReliance = store.toLowerCase().includes('reliance');

  const storeBadgeColor = isAmazon ? '#f59e0b' : isFlipkart ? '#3b82f6' : isCroma ? '#06b6d4' : isReliance ? '#ef4444' : '#10b981';

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div className="panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 16, padding: 28, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #1e293b', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              <Zap size={13} /> Retailer Checkout Handoff Active
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#fff' }}>Proceed to Final Payment</h2>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>ShopAgent verified lowest price and staged your purchase directly at the retailer.</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}><X size={20} /></button>
        </div>

        {/* Order Details Card */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Staged Product</span>
              <h4 style={{ fontSize: 15, color: '#fff', margin: '2px 0 0', lineHeight: 1.4 }}>{handoff.product}</h4>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Verified Total</span>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#34d399' }}>₹{Number(handoff.total || 0).toLocaleString()}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid #334155', paddingTop: 12, fontSize: 12 }}>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: 11 }}>RETAILER PLATFORM</span>
              <b style={{ color: storeBadgeColor, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ShoppingCart size={13} /> {store}
              </b>
            </div>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: 11 }}>INTERNAL ORDER REF</span>
              <b style={{ color: '#38bdf8', fontSize: 13, fontFamily: 'monospace' }}>{handoff.orderNumber}</b>
            </div>
            {handoff.savings && handoff.savings > 0 && (
              <div style={{ gridColumn: 'span 2', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 10px', borderRadius: 6, color: '#34d399', fontWeight: 600 }}>
                ✓ Verified savings locked in: ₹{Number(handoff.savings).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* 3-Step Guided Action */}
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <h4 style={{ fontSize: 13, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px', fontWeight: 700 }}>How Checkout Works:</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ background: '#3b82f6', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>1</span>
              <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.4 }}>
                <strong>Store Tab:</strong> Click the button below to jump directly to <b>{store}</b>.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>2</span>
              <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.4 }}>
                <strong>Cart & Delivery:</strong> The product is staged in your cart or search results. Choose your delivery address.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ background: '#10b981', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>3</span>
              <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.4 }}>
                <strong>Secure Payment:</strong> Select UPI, Credit/Debit Card, or Net Banking and authenticate with your personal 2FA/OTP.
              </p>
            </div>
          </div>
        </div>

        {/* Primary CTA Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {handoff.url ? (
            <a
              href={handoff.url}
              target="_blank"
              rel="noopener noreferrer"
              className="primary wide"
              style={{
                textAlign: 'center',
                padding: '14px 20px',
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 10,
                boxShadow: '0 4px 14px 0 rgba(99, 102, 241, 0.39)'
              }}
            >
              <span>Open {store} &amp; Complete Payment</span>
              <ExternalLink size={18} />
            </a>
          ) : (
            <button className="primary wide" onClick={onClose}>
              Order Staged • Awaiting Retailer Confirmation
            </button>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              Popups blocked? The button above opens store directly without popup blocker interference.
            </span>
            <button
              className="secondary"
              onClick={onClose}
              style={{ padding: '6px 14px', fontSize: 12, borderRadius: 6 }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Savings({ data, orders }: any) {
  const value = Number(data?.stats?.verified_savings || 0);
  return (
    <div className="stack">
      <PageTitle eyebrow="MONEY SAVED" title="Savings" meta="Verified only" />
      <div className="savings-hero">
        <div><span className="hero-badge"><CircleDollarSign size={13} /> VERIFIED SAVINGS</span><h2>₹{value.toLocaleString()}</h2><p>Only savings supported by recorded prices are counted. ShopAgent never invents a saving.</p></div>
        <div className="saving-visual"><CircleDollarSign size={64} /></div>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <div>
            <span>Orders Placed</span>
            <b>{orders.length}</b>
            <small>Recorded transactions</small>
          </div>
          <Package size={22} color="#a78bfa" />
        </div>
        <div className="stat-card">
          <div>
            <span>Avg. Savings per Order</span>
            <b>₹{orders.length ? Math.round(value / orders.length).toLocaleString() : 0}</b>
            <small>Real price delta</small>
          </div>
          <TrendingDown size={22} color="#22c55e" />
        </div>
      </div>
    </div>
  );
}

function ActivityPage({ rows }: any) {
  const [kindFilter, setKindFilter] = useState('ALL');

  const filtered = rows.filter((x: any) => {
    if (kindFilter === 'ALL') return true;
    return x.kind?.toLowerCase() === kindFilter.toLowerCase();
  });

  return (
    <div className="stack">
      <PageTitle eyebrow="TRANSPARENT AGENT" title="Agent Activity" meta="Audit trail" />
      <div className="filterbar">
        <button className={`filter ${kindFilter === 'ALL' ? 'active' : ''}`} onClick={() => setKindFilter('ALL')}>All Activity</button>
        <button className={`filter ${kindFilter === 'Orders' ? 'active' : ''}`} onClick={() => setKindFilter('Orders')}>Orders</button>
        <button className={`filter ${kindFilter === 'Products' ? 'active' : ''}`} onClick={() => setKindFilter('Products')}>Products</button>
        <button className={`filter ${kindFilter === 'Monitoring' ? 'active' : ''}`} onClick={() => setKindFilter('Monitoring')}>Monitoring</button>
      </div>
      <div className="panel activity-list">
        {filtered.length ? filtered.map((x: any) => (
          <div className="activity-item" key={x.id}>
            <span className="activity-icon"><Activity size={15} /></span>
            <div><b>{x.message}</b><small>{x.kind} • {new Date(x.created_at).toLocaleString()}</small></div>
          </div>
        )) : <Empty icon={Activity} text="No activity logs matching this filter." />}
      </div>
    </div>
  );
}

function Compare({ data, back, openDecisionLab, onSwap, onRefresh, refreshing }: any) {
  return (
    <div className="stack">
      <button className="back-btn" onClick={back}>← Back to To-Buy</button>
      {data ? (
        <>
          <PageTitle eyebrow="TRUE PRICE ENGINE" title={cleanProductName(data.product, 65)} meta={<span className={`decision ${data.decision?.decision === 'BUY' ? 'buy' : 'wait'}`}>{data.decision?.decision}</span>} />
          <div className="decision-banner">
            <div><b>{data.decision?.decision}</b><span>{data.decision?.reason}</span></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => onRefresh && onRefresh()}
                title="Refresh Comparison Prices"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh
              </button>
              <button className="primary" onClick={() => openDecisionLab(data.product_id)}>Open in Decision Lab <Sparkles size={13} /></button>
            </div>
          </div>

          {/* Autonomous Browser Agent Live Workstation Status */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
            borderRadius: 12,
            border: '1px solid #334155',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  AUTONOMOUS BROWSER AGENT · PLAYWRIGHT STEALTH ACTIVE
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#94a3b8', background: '#1e293b', padding: '3px 8px', borderRadius: 6, border: '1px solid #334155' }}>
                Chromium Engine v130 · Built-in Dual AI Loop
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 4 }}>
              <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 700 }}>🌐 LIVE DOM EXTRACTION</div>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, marginTop: 2 }}>Direct URL Hydration Verified</div>
              </div>
              <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(74, 222, 128, 0.2)' }}>
                <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 700 }}>💬 REVIEW INTELLIGENCE</div>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, marginTop: 2 }}>Verified Buyer Ratings &amp; Quotes</div>
              </div>
              <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(251, 146, 60, 0.2)' }}>
                <div style={{ fontSize: 10, color: '#fb923c', fontWeight: 700 }}>🏪 CROSS-STORE DISCOVERY</div>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, marginTop: 2 }}>7 Real Indian Retailers Synced</div>
              </div>
              <div style={{ background: 'rgba(2, 6, 23, 0.6)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                <div style={{ fontSize: 10, color: '#c084fc', fontWeight: 700 }}>💳 BANK &amp; CARD OFFERS</div>
                <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, marginTop: 2 }}>Instant Discounts &amp; Cashback</div>
              </div>
            </div>
          </div>

          {/* Eco Grade & Sustainability Quick Pill */}
          {data.sustainability && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 16px', background: '#064e3b', borderRadius: 8, border: '1px solid #059669', color: '#a7f3d0', fontSize: 13, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><Leaf size={16} /> Eco Grade {data.sustainability.eco_grade} ({data.sustainability.eco_points}/100)</span>
              <span>• Packaging: {data.sustainability.packaging}</span>
              <span>• Carbon Delivery: {data.sustainability.carbon_footprint}</span>
            </div>
          )}

          <div className="listing-grid">
            {(data.listings || []).map((l: Listing, i: number) => (
              <div className={`listing-card ${i === 0 ? 'best' : ''}`} key={l.listing_id || l.store}>
                <div className="listing-head">
                  <div><span className="store-label">{l.store}</span>{i === 0 && <span className="best-tag">BEST TOTAL</span>}</div>
                  <span className="match">{l.match_score || '—'}% match</span>
                </div>
                <div className="listing-price">₹{Number(l.true_total).toLocaleString()}</div>
                <div className="price-breakdown">
                  <div><span>Product</span><b>₹{Number(l.price).toLocaleString()}</b></div>
                  <div><span>Delivery</span><b>{l.delivery ? '₹' + l.delivery : 'FREE'}</b></div>
                  <div><span>Seller</span><b>{l.seller} · {l.seller_rating}</b></div>
                  <div><span>Warranty</span><b>{l.warranty || 'Not provided'}</b></div>
                  <div><span>Returns</span><b>{l.returns || 'Not provided'}</b></div>
                </div>

                {/* Bank & Credit Card Offers */}
                {l.card_offers && l.card_offers.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #334155' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <CreditCard size={13} /> BANK &amp; CARD OFFERS ({l.card_offers.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {l.card_offers.map((co: any, ci: number) => (
                        <div key={ci} style={{ background: '#0b1329', padding: '6px 8px', borderRadius: 6, border: '1px solid #1e293b', fontSize: 11 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <b style={{ color: '#f8fafc' }}>{co.bank}</b>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: co.type === 'CASHBACK' ? '#065f46' : (co.type === 'NO COST EMI' ? '#3730a3' : '#1e3a8a'), color: '#e2e8f0' }}>
                              {co.badge}
                            </span>
                          </div>
                          <div style={{ color: '#94a3b8', lineHeight: 1.3 }}>{co.offer}</div>
                          {co.effective_price < l.price && (
                            <div style={{ color: '#4ade80', fontWeight: 600, marginTop: 2, fontSize: 10 }}>
                              ⚡ Effective: ₹{Number(co.effective_price).toLocaleString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {l.url && <a className="retailer-link" href={l.url} target="_blank" rel="noreferrer">Open retailer <ExternalLink size={14} /></a>}
              </div>
            ))}
          </div>

          {/* Smart Brand Substitutes */}
          {data.substitutes && data.substitutes.length > 0 && (
            <div className="panel" style={{ borderColor: '#6366f1', marginTop: 12 }}>
              <div className="panel-head">
                <div>
                  <span className="eyebrow" style={{ color: '#818cf8' }}>SMART BRAND SUBSTITUTES</span>
                  <h3>Alternative Product Recommendations</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onRefresh && onRefresh()}
                  title="Refresh recommendations"
                  style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid #6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, color: '#a5b4fc' }}
                >
                  <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="listing-grid">
                {data.substitutes.map((sub: any, idx: number) => (
                  <div className="listing-card" key={idx}>
                    <div className="listing-head">
                      <span className="store-label">{sub.brand}</span>
                      <span className="status purple">{sub.type}</span>
                    </div>
                    <b style={{ display: 'block', fontSize: 13, color: '#fff', margin: '8px 0 4px' }}>{sub.name}</b>
                    {sub.specs && (
                      <div style={{ fontSize: 11, color: '#818cf8', margin: '4px 0 6px', lineHeight: 1.4 }}>
                        <b>Specs:</b> {sub.specs}
                      </div>
                    )}
                    <div className="listing-price">₹{Number(sub.price).toLocaleString()}</div>
                    {sub.savings > 0 && (
                      <div style={{ color: '#22c55e', fontSize: 11, fontWeight: 600, margin: '2px 0 6px' }}>
                        💰 Save ₹{Number(sub.savings).toLocaleString()} vs current
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: '6px 0 10px' }}>{sub.reason}</p>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => onSwap && data.product_id && onSwap(data.product_id, sub.name)}
                      style={{ width: '100%', padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <RefreshCw size={12} /> Swap with this alternative
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : <Empty text="Select a product to compare." />}
    </div>
  );
}

function SettingsPage({ dark, setDark, aiStatus, preferences, savePreferences, busy, signout }: any) {
  const [prefs, setPrefs] = useState(preferences || {});
  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showKey, setShowKey] = useState(false);
  const [liveStatus, setLiveStatus] = useState<any>(aiStatus || null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    if (preferences) setPrefs(preferences);
  }, [preferences]);

  useEffect(() => {
    if (aiStatus) setLiveStatus(aiStatus);
  }, [aiStatus]);

  const refreshAiStatus = async () => {
    setCheckingStatus(true);
    try {
      const s = await req('/api/ai/status');
      setLiveStatus(s);
    } catch {}
    finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    refreshAiStatus();
    const interval = setInterval(refreshAiStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const presets: Record<string, { base_url: string; model: string; label: string }> = {
    openai: { label: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    groq: { label: 'Groq (Fastest ~100ms)', base_url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    deepseek: { label: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    openrouter: { label: 'OpenRouter (100+ Models)', base_url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
    custom: { label: 'Custom / Self-Hosted', base_url: prefs.custom_ai_base_url || 'http://localhost:8000/v1', model: prefs.custom_ai_model || 'custom-model' }
  };

  const applyPreset = (key: string) => {
    const p = presets[key];
    if (p) {
      setPrefs({
        ...prefs,
        custom_ai_provider: key,
        custom_ai_base_url: p.base_url,
        custom_ai_model: p.model,
        custom_ai_enabled: true
      });
      setTestResult(null);
    }
  };

  const runTestAi = async () => {
    if (!prefs.custom_ai_api_key?.trim()) {
      setTestResult({ ok: false, error: 'Please enter an API key first' });
      return;
    }
    setTestingAi(true);
    setTestResult(null);
    try {
      const res = await req('/api/ai/test', {
        method: 'POST',
        body: JSON.stringify({
          base_url: prefs.custom_ai_base_url,
          api_key: prefs.custom_ai_api_key,
          model: prefs.custom_ai_model
        })
      });
      setTestResult(res);
      refreshAiStatus();
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message || 'Connection test failed' });
    } finally {
      setTestingAi(false);
    }
  };

  const resetToDefaultAi = async () => {
    const updated = {
      ...prefs,
      custom_ai_enabled: false
    };
    setPrefs(updated);
    setTestResult(null);
    await savePreferences(updated);
    refreshAiStatus();
  };

  return (
    <div className="stack">
      <PageTitle eyebrow="CONTROL CENTER" title="Settings" meta="Safety, Custom AI & Configuration" />
      <div className="settings-grid">

        {/* Bring Your Own AI (Custom AI & API Keys) */}
        <div className="panel" style={{ gridColumn: '1 / -1', borderColor: '#6366f1' }}>
          <div className="panel-head">
            <div>
              <span className="eyebrow" style={{ color: '#818cf8' }}>BRING YOUR OWN AI (BYO-AI)</span>
              <h3>Custom AI & API Key Provider</h3>
            </div>
            <Sparkles size={20} color="#818cf8" />
          </div>
          <p style={{ fontSize: 13, color: '#cbd5e1', margin: '4px 0 16px' }}>
            Plug in your own API key from Groq, DeepSeek, OpenAI, OpenRouter, or private self-hosted endpoints. You can switch back to the Built-In engine at any time.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <button
              type="button"
              className={`filter ${!prefs.custom_ai_enabled ? 'active' : ''}`}
              onClick={resetToDefaultAi}
              style={{ borderColor: !prefs.custom_ai_enabled ? '#10b981' : undefined, color: !prefs.custom_ai_enabled ? '#34d399' : undefined }}
            >
              ⚡ Built-In AI (Default)
            </button>
            {Object.entries(presets).map(([key, p]) => (
              <button
                key={key}
                type="button"
                className={`filter ${prefs.custom_ai_enabled && prefs.custom_ai_provider === key ? 'active' : ''}`}
                onClick={() => applyPreset(key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>API Base URL</label>
              <input
                style={{ width: '100%', padding: '9px 12px', borderRadius: 6, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }}
                value={prefs.custom_ai_base_url || ''}
                onChange={e => setPrefs({ ...prefs, custom_ai_base_url: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Model Name</label>
              <input
                style={{ width: '100%', padding: '9px 12px', borderRadius: 6, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }}
                value={prefs.custom_ai_model || ''}
                onChange={e => setPrefs({ ...prefs, custom_ai_model: e.target.value })}
                placeholder="gpt-4o-mini / llama-3.3-70b-versatile"
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 13, color: '#cbd5e1' }}>API Key</label>
                <button type="button" onClick={() => setShowKey(!showKey)} style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: 12, cursor: 'pointer' }}>
                  {showKey ? 'Hide key' : 'Show key'}
                </button>
              </div>
              <input
                type={showKey ? 'text' : 'password'}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 6, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }}
                value={prefs.custom_ai_api_key || ''}
                onChange={e => setPrefs({ ...prefs, custom_ai_api_key: e.target.value })}
                placeholder="sk-..."
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <SettingToggle
              title="Activate Custom AI"
              text="Use this custom model for search intent, comparison logic, and Decision Lab intelligence."
              value={prefs.custom_ai_enabled}
              onChange={(v: boolean) => setPrefs({ ...prefs, custom_ai_enabled: v })}
            />
          </div>

          {testResult && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 6, background: testResult.ok ? '#064e3b' : '#7f1d1d', color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{testResult.ok ? `⚡ ${testResult.message} (${testResult.model})` : `⚠️ ${testResult.error}`}</span>
              <span className={`status ${testResult.ok ? 'green' : 'orange'}`}>{testResult.status}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="secondary" type="button" onClick={runTestAi} disabled={testingAi}>
              {testingAi ? 'Testing connection…' : <>⚡ Test API Connection</>}
            </button>
            <button className="primary" type="button" onClick={async () => { await savePreferences(prefs); refreshAiStatus(); }} disabled={busy}>
              {busy ? 'Saving…' : 'Save & Activate Custom AI'}
            </button>
            {prefs.custom_ai_enabled && (
              <button
                className="secondary"
                type="button"
                onClick={resetToDefaultAi}
                style={{ borderColor: '#10b981', color: '#34d399' }}
              >
                ⚡ Reset to Built-In AI
              </button>
            )}
          </div>
        </div>

        {/* Live Engine Status with Real-Time Indicator */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">LIVE TELEMETRY</span>
              <h3>Active AI Engine Status</h3>
            </div>
            <button
              type="button"
              className="round"
              title="Check live status"
              onClick={refreshAiStatus}
              disabled={checkingStatus}
              style={{ padding: '4px 8px', width: 'auto', height: 'auto', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {checkingStatus ? 'Checking…' : '🔄 Refresh'}
            </button>
          </div>
          <div className="safety-box" style={{ borderColor: liveStatus?.is_online === false ? '#ef4444' : undefined }}>
            <Bot size={20} color={liveStatus?.is_online === false ? '#ef4444' : '#22c55e'} />
            <div>
              <b>{liveStatus?.active_name || 'Deterministic & Local AI'}</b>
              <span>{liveStatus?.details || 'Running built-in high-precision deterministic parser'}</span>
            </div>
            <span className={`status ${liveStatus?.is_online === false ? 'orange' : 'green'}`} style={liveStatus?.is_online === false ? { background: '#7f1d1d', color: '#fca5a5' } : {}}>
              {liveStatus?.badge || (liveStatus?.is_online === false ? 'OFFLINE' : 'ONLINE')}
            </span>
          </div>
        </div>

        {/* Delivery Location & Quick-Commerce Pincode */}
        <div className="panel" style={{ borderColor: '#10b981' }}>
          <div className="panel-head">
            <div>
              <span className="eyebrow" style={{ color: '#10b981' }}>HYPER-LOCAL SETTINGS</span>
              <h3>Delivery Location & Pincode</h3>
            </div>
            <Target size={20} color="#10b981" />
          </div>
          <p style={{ fontSize: 13, color: '#cbd5e1', margin: '4px 0 14px' }}>
            Enables instant price and stock discovery across Blinkit, Swiggy Instamart, Zepto, BigBasket, Amazon Fresh & local dark stores.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 13, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Delivery Pincode</label>
              <input
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }}
                value={prefs.delivery_pincode || ''}
                onChange={e => setPrefs({ ...prefs, delivery_pincode: e.target.value })}
                placeholder="Enter delivery pincode (e.g. 560001, 110001)"
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>City / Area</label>
              <input
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }}
                value={prefs.delivery_city || ''}
                onChange={e => setPrefs({ ...prefs, delivery_city: e.target.value })}
                placeholder="Enter city or area (e.g. Bengaluru, Mumbai, Delhi)"
              />
            </div>
          </div>
          <button className="primary" onClick={() => savePreferences(prefs)} disabled={busy} style={{ background: '#059669', borderColor: '#047857' }}>
            {busy ? 'Saving…' : 'Save Delivery Location'}
          </button>
        </div>

        {/* Appearance */}
        <div className="panel">
          <div className="panel-head"><div><span className="eyebrow">APPEARANCE</span><h3>Interface</h3></div></div>
          <SettingToggle title="Dark mode" text="Use the high-contrast unblurred command-center theme." value={dark} onChange={setDark} />
        </div>

        {/* Safety Limits */}
        <div className="panel">
          <div className="panel-head"><div><span className="eyebrow">PURCHASE SAFETY LIMITS</span><h3>Autonomous buying rules</h3></div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Global Order Limit (₹)</label>
              <input type="number" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }} value={prefs.global_max_order || ''} onChange={e => setPrefs({ ...prefs, global_max_order: Number(e.target.value) })} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Monthly Spend Cap (₹)</label>
              <input type="number" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }} value={prefs.monthly_max || ''} onChange={e => setPrefs({ ...prefs, monthly_max: Number(e.target.value) })} />
            </div>
            <SettingToggle title="Emergency Stop" text="Killswitch to immediately block all automated purchases." value={prefs.emergency_stop} onChange={(v: boolean) => setPrefs({ ...prefs, emergency_stop: v })} />
            <button className="primary" onClick={() => savePreferences(prefs)} disabled={busy}>{busy ? 'Saving…' : 'Save Safety Limits'}</button>
          </div>
        </div>

        {/* Telegram Notifications */}
        <div className="panel">
          <div className="panel-head"><div><span className="eyebrow">NOTIFICATIONS</span><h3>Telegram Push Alerts</h3></div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Telegram Bot Token</label>
              <input type="password" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }} value={prefs.telegram_bot_token || ''} onChange={e => setPrefs({ ...prefs, telegram_bot_token: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Telegram Chat ID</label>
              <input placeholder="987654321" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: '#1e1b4b', border: '1px solid #4338ca', color: '#fff' }} value={prefs.telegram_chat_id || ''} onChange={e => setPrefs({ ...prefs, telegram_chat_id: e.target.value })} />
            </div>
            <button className="secondary" onClick={() => savePreferences(prefs)} disabled={busy}>{busy ? 'Saving…' : 'Save Telegram Config'}</button>
          </div>
        </div>

        {/* Account Session & Sign Out */}
        <div className="panel" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
          <div className="panel-head">
            <div>
              <span className="eyebrow" style={{ color: '#ef4444' }}>ACCOUNT SESSION</span>
              <h3>Sign Out</h3>
            </div>
            <LogOut size={18} color="#ef4444" />
          </div>
          <p style={{ fontSize: 13, color: '#cbd5e1', margin: '4px 0 14px' }}>
            End your active shopping session and return to the login screen.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={signout}
            style={{ borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <LogOut size={16} /> Sign out from ShopAgent
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingToggle({ title, text, value, onChange }: any) {
  return (
    <div className="setting-row">
      <div><b>{title}</b><small>{text}</small></div>
      <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /></button>
    </div>
  );
}

function ProductRow({ item, compare, openDecisionLab, buy, monitor, onSaveForLater, onMoveToCart, onVote }: any) {
  const isSavedForLater = item.status === 'BUY_LATER' || item.status === 'SAVED_FOR_LATER';

  return (
    <div className="product-row">
      <div className="product-thumb large">{item.name.slice(0, 2).toUpperCase()}</div>
      <div className="product-main">
        <div className="product-title">
          <b title={item.name}>{cleanProductName(item.name, 60)}</b>
          {isSavedForLater ? (
            <span className="status orange" style={{ background: '#78350f', color: '#fde68a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <PauseCircle size={11} /> BUY LATER
            </span>
          ) : (
            <span className={`status ${item.mode === 'MONITOR' ? 'purple' : 'blue'}`}>{item.mode === 'MONITOR' ? 'MONITOR' : 'BUY NOW'}</span>
          )}
          {item.is_gift && (
            <span className="status orange" style={{ background: '#7c2d12', color: '#fed7aa', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Gift size={12} /> Gift {item.gift_recipient ? `for ${item.gift_recipient}` : ''}
            </span>
          )}
        </div>
        <div className="product-meta">
          <span>Current <b>{item.current_price ? `₹${item.current_price.toLocaleString()}` : 'No live price'}</b></span>
          {item.target_price && <span>Target <b>₹{item.target_price.toLocaleString()}</b></span>}
          {item.decision?.decision && <span className="decision-mini">{item.decision.decision}</span>}
          
          {/* Family Consensus & Voting */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <button
              type="button"
              onClick={() => onVote && onVote(item.id, 'Self', 'APPROVE')}
              title="Approve item (Family Vote)"
              style={{ background: '#064e3b', border: '1px solid #059669', color: '#34d399', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
            >
              <ThumbsUp size={11} /> {item.approvals_count || 0}
            </button>
            <button
              type="button"
              onClick={() => onVote && onVote(item.id, 'Self', 'REJECT')}
              title="Reject item (Family Vote)"
              style={{ background: '#7f1d1d', border: '1px solid #dc2626', color: '#fca5a5', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
            >
              <ThumbsDown size={11} /> {item.rejections_count || 0}
            </button>
          </div>
        </div>
      </div>
      <div className="row-actions">
        {isSavedForLater ? (
          onMoveToCart && (
            <button className="secondary" title="Move back to active cart" onClick={onMoveToCart} style={{ color: '#38bdf8', borderColor: '#0284c7' }}>
              <ShoppingCart size={13} /> Move to Cart
            </button>
          )
        ) : (
          onSaveForLater && (
            <button className="secondary" title="Save for Later: removes from active cart" onClick={onSaveForLater} style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
              <PauseCircle size={13} /> Buy Later
            </button>
          )
        )}
        {item.product_id && <button className="secondary" title="Decision Lab" onClick={openDecisionLab}><Sparkles size={13} /> Lab</button>}
        <button className="secondary" onClick={compare}>Compare</button>
        {item.mode !== 'MONITOR' && <button className="secondary" onClick={monitor}>Monitor</button>}
        <button className="primary" onClick={buy}>Buy now</button>
      </div>
    </div>
  );
}

function ActivityMini({ rows }: any) {
  return rows.length ? (
    <div className="activity-mini">
      {rows.slice(0, 6).map((x: any) => (
        <div className="activity-item" key={x.id}>
          <span className="activity-icon"><Activity size={14} /></span>
          <div><b>{x.message}</b><small>{new Date(x.created_at).toLocaleString()}</small></div>
        </div>
      ))}
    </div>
  ) : <Empty icon={Activity} text="No activity yet." />;
}

function PageTitle({ eyebrow, title, meta }: any) {
  return (
    <div className="page-title">
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {meta && <div className="page-meta">{meta}</div>}
    </div>
  );
}

function Empty({ icon: Icon, text, action, onClick }: any) {
  return (
    <div className="empty">
      {Icon && <span className="empty-icon"><Icon size={22} /></span>}
      <b>{text}</b>
      {action && <button className="secondary" onClick={onClick}>{action}</button>}
    </div>
  );
}
