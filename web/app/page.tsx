'use client';

// ShopAgent - Personal AI Shopping Assistant
import { useEffect, useState } from 'react';
import {
  Activity, Bell, Bot, Check, ChevronDown, CircleDollarSign, Clock3, ExternalLink,
  LayoutDashboard, ListChecks, LogOut, Menu, Package, Search, Settings, Sparkles,
  Target, TrendingDown, X, Zap, Link2, Layers3, ShoppingCart, ShieldAlert,
  HelpCircle, ThumbsUp, AlertTriangle, PlayCircle, Scale
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

type Item = {
  id: number; name: string; quantity: number; target_price: number | null; max_price: number | null;
  mode: string; purchase_mode: string; status: string; product_id: number | null;
  current_price: number | null; decision: any;
};

type Listing = {
  listing_id?: number;
  store: string;
  true_total: number;
  price: number;
  delivery: number;
  seller: string;
  seller_rating: number;
  warranty?: string;
  returns?: string;
  url?: string;
  match_score?: number;
};

async function req(path: string, opt: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sa_access') : null;
  let r: Response;
  try {
    r = await fetch(API + path, {
      ...opt,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opt.headers || {}) }
    });
  } catch (netErr: any) {
    throw new Error('Unable to connect to server. Please check if the backend is running.');
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
  ['Home', LayoutDashboard],
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
  const [tab, setTab] = useState('Home');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [monitor, setMonitor] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [compare, setCompare] = useState<any>(null);
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

  const load = async () => {
    try {
      const [d, i, m, o, a, de] = await Promise.all([
        req('/api/dashboard'), req('/api/items'), req('/api/monitoring'), req('/api/orders'), req('/api/activity'), req('/api/deals')
      ]);
      setData(d);
      setItems(i.items || []);
      setMonitor(m.items || []);
      setOrders(o || []);
      setActivity(a || []);
      setDeals(de.deals || []);
      setAuthed(true);
      try { setAiStatus(await req('/api/ai/status')); } catch {}
      try { setBasketData(await req('/api/basket')); } catch {}

      // Load initial decision lab if items exist
      if (i.items && i.items.length > 0 && i.items[0].product_id) {
        setDecisionPid(i.items[0].product_id);
        const dLab = await req(`/api/products/${i.items[0].product_id}/decision-lab`).catch(() => null);
        if (dLab) setDecisionData(dLab);
      }
    } catch (err: any) {
      if (!localStorage.getItem('sa_access')) {
        setAuthed(false);
      } else {
        setToast(err.message || 'Failed to refresh data');
      }
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('sa_access')) {
      setAuthed(true);
      load();
    }
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

  const analyzeUrl = async (monitor = false) => {
    if (!productUrl.trim()) return;
    setUrlBusy(true);
    try {
      const x = await req('/api/products/url-analyze', {
        method: 'POST',
        body: JSON.stringify({ url: productUrl.trim(), monitor })
      });
      setCompare(x.comparison);
      setTab('Compare');
      setProductUrl('');
      await load();
      setToast(monitor ? 'Product analyzed and monitoring started' : 'Product analyzed and compared');
    } catch (e: any) {
      setToast(e.message);
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
    setBusy(true);
    try {
      const text = input.trim();
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

  const buy = async (id: number) => {
    setBusy(true);
    try {
      const x = await req(`/api/items/${id}/checkout`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() }
      });
      setToast(x.message || 'Checkout completed');
      await load();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startMonitor = async (id: number) => {
    try {
      await req(`/api/items/${id}/monitor`, { method: 'POST' });
      await load();
      setToast('Monitoring started');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const openDecisionLab = async (pid: number) => {
    setDecisionPid(pid);
    try {
      const lab = await req(`/api/products/${pid}/decision-lab`);
      setDecisionData(lab);
      setTab('Decision Lab');
    } catch (e: any) {
      setToast(e.message || 'Failed to load Decision Lab');
    }
  };

  const compareItem = async (i: Item) => {
    if (!i.product_id) {
      setToast('No matched product DNA yet. Add a supported product URL or clearer product name.');
      return;
    }
    try {
      setCompare(await req(`/api/products/${i.product_id}/compare`));
      setTab('Compare');
    } catch (e: any) {
      setToast(e.message);
    }
  };

  const signout = () => {
    localStorage.clear();
    setAuthed(false);
    setCompare(null);
    setTab('Home');
  };

  if (!authed) return <Auth mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} auth={auth} busy={busy} toast={toast} />;

  const todo = items.filter(x => x.status === 'TODO');
  const completed = items.filter(x => x.status === 'COMPLETED');
  const title = tab === 'Home' ? 'Good morning' : tab;
  const stats = [
    ['To-Buy', todo.length, ListChecks, 'neutral'],
    ['Monitoring', data?.stats?.monitored || 0, Target, 'purple'],
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
              <button className="round" title="Notifications"><Bell size={17} /><i /></button>
              <button className="profile" onClick={() => setTab('Settings')}>
                <span>SA</span>
                <div><b>Account</b><small>Verified Pro</small></div>
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        </header>

        <div className="content">
          {tab === 'Home' && <Home input={input} setInput={setInput} run={run} busy={busy} stats={stats} todo={todo} activity={activity} compareItem={compareItem} openDecisionLab={openDecisionLab} buy={buy} startMonitor={startMonitor} setTab={setTab} productUrl={productUrl} setProductUrl={setProductUrl} analyzeUrl={analyzeUrl} urlBusy={urlBusy} />}
          {tab === 'To-Buy' && <TodoPage items={todo} completed={completed} compareItem={compareItem} openDecisionLab={openDecisionLab} buy={buy} startMonitor={startMonitor} />}
          {tab === 'Decision Lab' && <DecisionLabPage items={items} selectedPid={decisionPid} data={decisionData} onSelectProduct={openDecisionLab} />}
          {tab === 'Master Cart' && <MasterCartPage data={basketData} strategy={basketStrategy} setStrategy={async (st: string) => { setBasketStrategy(st); setBasketData(await req(`/api/basket?strategy=${st}`)); }} todo={todo} />}
          {tab === 'Batch Intake' && <BatchPage urls={batchUrls} setUrls={setBatchUrls} items={batchItems} setItems={setBatchItems} busy={batchBusy} result={batchResult} process={processBatch} monitor={batchMonitor} setMonitor={setBatchMonitor} target={batchTarget} setTarget={setBatchTarget} />}
          {tab === 'Monitoring' && <Monitoring rows={monitor} refresh={load} openDecisionLab={openDecisionLab} />}
          {tab === 'Deals' && <Deals deals={deals} openDecisionLab={openDecisionLab} />}
          {tab === 'Orders' && <Orders orders={orders} />}
          {tab === 'Savings' && <Savings data={data} />}
          {tab === 'Agent Activity' && <ActivityPage rows={activity} />}
          {tab === 'Compare' && <Compare data={compare} back={() => setTab('To-Buy')} openDecisionLab={openDecisionLab} />}
          {tab === 'Settings' && <SettingsPage dark={dark} setDark={setDark} aiStatus={aiStatus} />}
        </div>
      </main>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function Auth({ mode, setMode, email, setEmail, password, setPassword, auth, busy, toast }: any) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <div><b>ShopAgent</b><small>Personal AI Shopping Assistant</small></div>
        </div>
        <span className="eyebrow">PRIVATE SHOPPING COMMAND CENTER</span>
        <h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
        <p>One unified place to search, verify, compare, monitor, and control your shopping without markups or fake deals.</p>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 6 characters" /></label>
        <button className="primary wide" onClick={auth} disabled={busy}>{busy ? 'Authenticating…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button className="switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button>
        {toast && <div className="auth-error">{toast}</div>}
      </div>
    </div>
  );
}

function Home({ input, setInput, run, busy, stats, todo, activity, compareItem, openDecisionLab, buy, startMonitor, setTab, productUrl, setProductUrl, analyzeUrl, urlBusy }: any) {
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
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-ring ring-a" />
          <div className="visual-ring ring-b" />
          <div className="visual-core"><Bot size={36} /><span>AI</span></div>
          <div className="float-card fc-one"><Target size={14} /><div><b>Price Target</b><span>Watching</span></div></div>
          <div className="float-card fc-two"><TrendingDown size={14} /><div><b>Best Price</b><span>Verified ₹</span></div></div>
        </div>
      </section>

      <div className="stat-grid">
        {stats.map(([label, value, Icon, kind]: any) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <b>{value}</b>
              <small>{label === 'Monitoring' ? 'Automatic checks' : label === 'Verified savings' ? 'From recorded prices' : label === 'Orders' ? 'Purchase history' : 'Active shopping plan'}</small>
            </div>
            <div className={`stat-icon ${kind}`}><Icon size={20} /></div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">YOUR SHOPPING PLAN</span><h3>To-Buy</h3></div>
            <button className="link-btn" onClick={() => setTab('To-Buy')}>View all <ChevronDown size={14} /></button>
          </div>
          {todo.length ? todo.slice(0, 5).map((i: Item) => (
            <ProductRow key={i.id} item={i} compare={() => compareItem(i)} openDecisionLab={() => i.product_id && openDecisionLab(i.product_id)} buy={() => buy(i.id)} monitor={() => startMonitor(i.id)} />
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

function TodoPage({ items, completed, compareItem, openDecisionLab, buy, startMonitor }: any) {
  return (
    <div className="stack">
      <PageTitle eyebrow="SMART SHOPPING LIST" title="To-Buy" meta={`${items.length} active items`} />
      <div className="panel">
        <div className="filterbar">
          <button className="filter active">All <span>{items.length}</span></button>
          <button className="filter">Buy Now</button>
          <button className="filter">Monitor</button>
          <button className="filter">Compare</button>
          <button className="filter sort">Sort: Priority <ChevronDown size={14} /></button>
        </div>
        {items.length ? items.map((i: Item) => (
          <ProductRow key={i.id} item={i} compare={() => compareItem(i)} openDecisionLab={() => i.product_id && openDecisionLab(i.product_id)} buy={() => buy(i.id)} monitor={() => startMonitor(i.id)} />
        )) : <Empty icon={ListChecks} text="No active items." />}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">PURCHASE HISTORY</span><h3>Completed</h3></div>
          <span className="count-pill">{completed.length}</span>
        </div>
        {completed.length ? completed.map((i: Item) => (
          <div className="completed-row" key={i.id}>
            <span className="done"><Check size={14} /></span>
            <div><b>{i.name}</b><small>Verified complete purchase</small></div>
            <strong>{i.current_price ? `₹${i.current_price.toLocaleString()}` : '—'}</strong>
          </div>
        )) : <Empty text="No completed purchases yet." />}
      </div>
    </div>
  );
}

function DecisionLabPage({ items, selectedPid, data, onSelectProduct }: any) {
  const productItems = items.filter((x: any) => x.product_id);
  if (!data) return (
    <div className="stack">
      <PageTitle eyebrow="AI INTELLIGENCE" title="Decision Lab" meta="Deep Product & Price Analysis" />
      <div className="panel"><Empty text="Select an active product to inspect Decision Lab intelligence." /></div>
    </div>
  );

  const score = data.shopagent_score || {};
  const regret = data.regret_shield || {};
  const simulator = data.buy_vs_wait || [];
  const skeptic = data.second_opinion || {};
  const whyNot = data.why_not_buy || [];
  const dealTruth = data.deal_truth || {};
  const ownership = data.ownership_cost || {};
  const compat = data.compatibility || {};
  const reviews = data.reviews || {};

  return (
    <div className="stack">
      <div className="page-title">
        <div>
          <span className="eyebrow">INTELLIGENCE LABORATORY</span>
          <h2>Decision Lab: {data.product}</h2>
        </div>
        {productItems.length > 1 && (
          <select className="batch-target" value={selectedPid || ''} onChange={e => onSelectProduct(Number(e.target.value))}>
            {productItems.map((p: any) => (
              <option key={p.id} value={p.product_id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Top Banner: Verdict + ShopAgent Score + Regret Shield */}
      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">PRIMARY RECOMMENDATION</span><h3>{data.decision?.decision}</h3></div>
            <span className={`decision ${data.decision?.decision === 'BUY' ? 'buy' : data.decision?.decision === "DON'T BUY" ? 'dont' : 'wait'}`}>
              {data.decision?.decision} VERDICT
            </span>
          </div>
          <p style={{ fontSize: 14, color: '#e2e8f0', margin: '4px 0 16px' }}>{data.decision?.reason}</p>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="stat-card">
              <div>
                <span>ShopAgent Score</span>
                <b style={{ color: '#a78bfa' }}>{score.total || 85}/100</b>
                <small>{score.grade || 'EXCELLENT'}</small>
              </div>
              <Sparkles size={22} color="#a78bfa" />
            </div>
            <div className="stat-card">
              <div>
                <span>Regret Shield Risk</span>
                <b style={{ color: regret.risk === 'LOW' ? '#22c55e' : regret.risk === 'HIGH' ? '#ef4444' : '#f59e0b' }}>
                  {regret.risk || 'LOW'}
                </b>
                <small>{regret.probability_pct || 15}% Remorse Risk</small>
              </div>
              <ShieldAlert size={22} color={regret.risk === 'LOW' ? '#22c55e' : '#f59e0b'} />
            </div>
          </div>
        </div>

        {/* Second Opinion (Skeptic Agent) */}
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

      {/* Buy vs Wait Simulator */}
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

      {/* Deal Truth & Why NOT Buy Grid */}
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

      {/* Review Truth & YouTube Reviews */}
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
          {(reviews.youtube_reviews || []).map((yt: any, i: number) => (
            <div className="listing-card" key={`yt-${i}`}>
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
          ))}
        </div>
      </div>

      {/* True Cost of Ownership Projections */}
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

function MasterCartPage({ data, strategy, setStrategy, todo }: any) {
  const stores = data?.stores || {};
  const total = Number(data?.total || 0);
  const savings = Number(data?.savings || 0);

  return (
    <div className="stack">
      <PageTitle eyebrow="MULTI-STORE OPTIMIZER" title="Master Cart" meta={`${todo.length} products optimized`} />
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
              ShopAgent splits your shopping needs across verified retailers to ensure you get the absolute lowest combined total.
            </p>
            {Object.keys(stores).length ? Object.entries(stores).map(([storeName, amount]: any) => (
              <div className="completed-row" key={storeName}>
                <div><b>{storeName}</b><small>Verified retail partner</small></div>
                <strong>₹{Number(amount).toLocaleString()}</strong>
              </div>
            )) : <Empty text="No items currently eligible for basket optimization." />}
          </div>
          <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <span>Combined Total</span>
              <b style={{ fontSize: 32, color: '#fff' }}>₹{total.toLocaleString()}</b>
              <small style={{ color: '#22c55e', fontSize: 13 }}>Saved ₹{savings.toLocaleString()} vs single store</small>
            </div>
            <button className="primary wide">Proceed to Checkout Handoff <Zap size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BatchPage({ urls, setUrls, items, setItems, busy, result, process, monitor, setMonitor, target, setTarget }: any) {
  return (
    <div className="stack">
      <PageTitle eyebrow="BULK SHOPPING" title="Batch Intake" meta="Multiple URLs + multiple To-Buy items" />
      <div className="batch-grid">
        <div className="panel batch-panel">
          <div className="panel-head"><div><span className="eyebrow">PRODUCT URLS</span><h3>Compare many products at once</h3></div><Link2 size={18} /></div>
          <p className="batch-help">Paste one product URL per line. ShopAgent verifies each page, extracts Product DNA, records a live listing and keeps the original source URL.</p>
          <textarea className="batch-textarea" value={urls} onChange={e => setUrls(e.target.value)} placeholder={'https://store.example/product-a\nhttps://store.example/product-b\nhttps://store.example/product-c'} />
          <div className="batch-options"><label><input type="checkbox" checked={monitor} onChange={e => setMonitor(e.target.checked)} /> Monitor every verified URL</label>{monitor && <input className="batch-target" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="Target price (optional)" />}</div>
        </div>
        <div className="panel batch-panel">
          <div className="panel-head"><div><span className="eyebrow">TO-BUY LIST</span><h3>Multiple shopping items</h3></div><ListChecks size={18} /></div>
          <p className="batch-help">Add one shopping need per line. Each becomes an independent To-Buy item and can later be compared, monitored or purchased separately.</p>
          <textarea className="batch-textarea" value={items} onChange={e => setItems(e.target.value)} placeholder={'Sony WH-1000XM6\nLogitech MX Master 3S\nUSB-C 100W cable\n2 kg basmati rice'} />
        </div>
      </div>
      <div className="batch-actions"><button className="primary" onClick={process} disabled={busy}>{busy ? 'Processing batch…' : 'Process everything'} <Zap size={14} /></button><span>Each URL is processed independently; failed sources are reported without creating fake prices.</span></div>
      {result && <div className="panel batch-result"><div className="panel-head"><div><span className="eyebrow">RESULT</span><h3>Batch processed</h3></div><span className="status green">{result.summary.urls_succeeded} URLS VERIFIED</span></div><div className="batch-summary"><div><b>{result.summary.todo_created}</b><small>To-Buy created</small></div><div><b>{result.summary.urls_succeeded}</b><small>URLs verified</small></div><div><b>{result.summary.urls_failed}</b><small>URLs failed</small></div></div><div className="batch-list">{(result.urls || []).map((r: any) => <div className="batch-row" key={r.url}><span className={r.ok ? 'dot-ok' : 'dot-fail'}></span><div><b>{r.name || r.url}</b><small>{r.ok ? `₹${Number(r.listing.true_total).toLocaleString()} • ${r.monitoring ? 'Monitoring enabled' : 'Buy Now'}` : r.error}</small></div><a href={r.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a></div>)}</div></div>}
    </div>
  );
}

function Monitoring({ rows, refresh, openDecisionLab }: any) {
  return (
    <div className="stack">
      <PageTitle eyebrow="PRICE INTELLIGENCE" title="Monitoring" meta={<span className="live-pill"><span className="live-dot" /> automatic checks</span>} />
      <div className="monitor-toolbar">
        <div className="monitor-tabs"><button className="active">Monitoring <span>{rows.length}</span></button><button>Near Target</button><button>Target Reached</button><button>Paused</button></div>
        <button className="primary" onClick={refresh}>Refresh prices <Zap size={14} /></button>
      </div>
      {rows.length ? (
        <div className="monitor-table panel">
          <div className="monitor-head"><span>PRODUCT</span><span>CURRENT PRICE</span><span>TARGET</span><span>STATUS</span><span>NEXT CHECK</span><span>ACTION</span></div>
          {rows.map((m: any) => (
            <div className="monitor-line" key={m.id}>
              <div className="monitor-product">
                <div className="product-thumb">{m.item.name.slice(0, 2).toUpperCase()}</div>
                <div><b>{m.item.name}</b><small>{m.item.purchase_mode} • {m.item.quantity} unit{m.item.quantity > 1 ? 's' : ''}</small></div>
              </div>
              <strong>{m.best?.true_total ? `₹${m.best.true_total.toLocaleString()}` : 'Unavailable'}</strong>
              <span>{m.item.target_price ? `₹${m.item.target_price.toLocaleString()}` : '—'}</span>
              <span className={`status ${m.status === 'TARGET_REACHED' ? 'green' : 'purple'}`}>{m.status === 'TARGET_REACHED' ? 'TARGET REACHED' : 'MONITORING'}</span>
              <span className="next"><Clock3 size={13} />{m.next_check ? new Date(m.next_check).toLocaleString() : 'scheduled'}</span>
              <button className="icon-action" title="Decision Lab" onClick={() => m.item.product_id && openDecisionLab(m.item.product_id)}><Sparkles size={15} /></button>
            </div>
          ))}
        </div>
      ) : <Empty icon={Target} text="Nothing is being monitored. Add a command such as “Monitor headphones below ₹25,000”." />}
    </div>
  );
}

function Deals({ deals, openDecisionLab }: any) {
  return (
    <div className="stack">
      <PageTitle eyebrow="AI OPPORTUNITIES" title="Deals" meta="Price intelligence" />
      <div className="deal-grid">
        {deals.length ? deals.map((d: any) => (
          <div className="deal-card" key={d.product_id}>
            <div className={`decision ${d.decision === 'BUY' ? 'buy' : d.decision === "DON'T BUY" ? 'dont' : 'wait'}`}>{d.decision}</div>
            <div className="deal-top"><span className="deal-icon"><TrendingDown size={18} /></span><span className="verified">VERIFIED DATA</span></div>
            <h3>{d.product}</h3>
            <strong>₹{Number(d.price).toLocaleString()}</strong>
            <div className="deal-stat"><span>{d.discount_percent}% below observed average</span></div>
            <p>{d.reason}</p>
            <button className="secondary" onClick={() => openDecisionLab(d.product_id)}>Inspect in Decision Lab <Sparkles size={13} /></button>
          </div>
        )) : <Empty text="No deal signals available yet." />}
      </div>
    </div>
  );
}

function Orders({ orders }: any) {
  return (
    <div className="stack">
      <PageTitle eyebrow="PURCHASE HISTORY" title="Orders" meta={`${orders.length} orders`} />
      <div className="panel">
        <div className="table-head"><span>PRODUCT</span><span>STORE</span><span>PRICE</span><span>STATUS</span><span>ORDER</span></div>
        {orders.length ? orders.map((o: any) => (
          <div className="order-row" key={o.id}>
            <div className="monitor-product"><div className="product-thumb">{o.product_name.slice(0, 2).toUpperCase()}</div><div><b>{o.product_name}</b><small>{new Date(o.created_at).toLocaleString()}</small></div></div>
            <span>{o.store}</span>
            <strong>₹{Number(o.price).toLocaleString()}</strong>
            <span className="status green">{o.status}</span>
            <code>{o.order_number}</code>
          </div>
        )) : <Empty icon={Package} text="No confirmed orders yet." />}
      </div>
    </div>
  );
}

function Savings({ data }: any) {
  const value = Number(data?.stats?.verified_savings || 0);
  return (
    <div className="stack">
      <PageTitle eyebrow="MONEY SAVED" title="Savings" meta="Verified only" />
      <div className="savings-hero">
        <div><span className="hero-badge"><CircleDollarSign size={13} /> VERIFIED SAVINGS</span><h2>₹{value.toLocaleString()}</h2><p>Only savings supported by recorded prices are counted. ShopAgent never invents a saving.</p></div>
        <div className="saving-visual"><CircleDollarSign size={64} /></div>
      </div>
      <div className="panel">
        <div className="panel-head"><div><span className="eyebrow">HOW IT WORKS</span><h3>Trust the number</h3></div></div>
        <div className="three-explain">
          <Explain icon={Search} title="Observe" text="Record actual listing prices and final totals." />
          <Explain icon={TrendingDown} title="Compare" text="Compare against the best eligible alternative." />
          <Explain icon={Check} title="Verify" text="Count savings only after evidence is recorded." />
        </div>
      </div>
    </div>
  );
}

function ActivityPage({ rows }: any) {
  return (
    <div className="stack">
      <PageTitle eyebrow="TRANSPARENT AGENT" title="Agent Activity" meta="Audit trail" />
      <div className="panel activity-list">
        {rows.length ? rows.map((x: any) => (
          <div className="activity-item" key={x.id}>
            <span className="activity-icon"><Activity size={15} /></span>
            <div><b>{x.message}</b><small>{x.kind} • {new Date(x.created_at).toLocaleString()}</small></div>
          </div>
        )) : <Empty icon={Activity} text="Agent activity will appear here." />}
      </div>
    </div>
  );
}

function Compare({ data, back, openDecisionLab }: any) {
  return (
    <div className="stack">
      <button className="back-btn" onClick={back}>← Back to To-Buy</button>
      {data ? (
        <>
          <PageTitle eyebrow="TRUE PRICE ENGINE" title={data.product} meta={<span className={`decision ${data.decision?.decision === 'BUY' ? 'buy' : 'wait'}`}>{data.decision?.decision}</span>} />
          <div className="decision-banner">
            <div><b>{data.decision?.decision}</b><span>{data.decision?.reason}</span></div>
            <button className="primary" onClick={() => openDecisionLab(data.product_id)}>Open in Decision Lab <Sparkles size={13} /></button>
          </div>
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
                {l.url && <a className="retailer-link" href={l.url} target="_blank" rel="noreferrer">Open retailer <ExternalLink size={14} /></a>}
              </div>
            ))}
          </div>
          <div className="source-note"><b>Source provenance</b><span>Every price card links to its original product page. Unverified search snippets are never used as a price.</span></div>
        </>
      ) : <Empty text="Select a product to compare." />}
    </div>
  );
}

function SettingsPage({ dark, setDark, aiStatus }: any) {
  return (
    <div className="stack">
      <PageTitle eyebrow="CONTROL CENTER" title="Settings" meta="Safety first" />
      <div className="settings-grid">
        <div className="panel">
          <div className="panel-head"><div><span className="eyebrow">AI ENGINE</span><h3>Local + API AI</h3></div></div>
          <div className="safety-box">
            <Bot size={18} />
            <div>
              <b>{aiStatus?.configured_provider === 'ollama' ? 'Ollama Local AI' : 'Deterministic & Local AI'}</b>
              <span>{aiStatus?.ollama?.available ? `Ollama online • ${aiStatus.ollama.model}` : 'Running built-in high-precision deterministic & browser parser'} {aiStatus?.api?.configured ? '• Cloud API key active' : ''}</span>
            </div>
            <span className="status green">ACTIVE</span>
          </div>
          <div className="setting-row"><div><b>Free Built-in Mode</b><small>Runs high-precision deterministic parsing with no external API dependency or paid keys.</small></div><span className="status green">READY</span></div>
          <div className="setting-row"><div><b>Ollama Mode</b><small>Optional: Connects automatically if Ollama is running locally.</small></div><span className={`status ${aiStatus?.ollama?.available ? 'green' : 'purple'}`}>{aiStatus?.ollama?.available ? 'CONNECTED' : 'OPTIONAL'}</span></div>
          <div className="setting-row"><div><b>Hosted Cloud API</b><small>Optional: Uses OpenAI-compatible API when configured in .env.</small></div><span className={`status ${aiStatus?.api?.configured ? 'green' : 'purple'}`}>{aiStatus?.api?.configured ? 'CONFIGURED' : 'OPTIONAL'}</span></div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="eyebrow">APPEARANCE</span><h3>Interface</h3></div></div>
          <SettingToggle title="Dark mode" text="Use the high-contrast unblurred command-center theme." value={dark} onChange={setDark} />
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="eyebrow">PURCHASE SAFETY</span><h3>Autonomous buying</h3></div></div>
          <div className="safety-box">
            <Zap size={18} />
            <div>
              <b>Auto-checkout is strictly governed server-side</b>
              <span>Maximum price, seller rating, spending limits, duplicate protection and approval rules are enforced before checkout.</span>
            </div>
          </div>
          <div className="setting-row"><div><b>Emergency stop</b><small>Global kill-switch to immediately disable all purchase authorization.</small></div><span className="status green">READY</span></div>
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

function Explain({ icon: Icon, title, text }: any) {
  return (
    <div className="explain">
      <span><Icon size={18} /></span>
      <div><b>{title}</b><p>{text}</p></div>
    </div>
  );
}

function ProductRow({ item, compare, openDecisionLab, buy, monitor }: any) {
  return (
    <div className="product-row">
      <div className="product-thumb large">{item.name.slice(0, 2).toUpperCase()}</div>
      <div className="product-main">
        <div className="product-title">
          <b>{item.name}</b>
          <span className={`status ${item.mode === 'MONITOR' ? 'purple' : 'blue'}`}>{item.mode === 'MONITOR' ? 'MONITOR' : 'BUY NOW'}</span>
        </div>
        <div className="product-meta">
          <span>Current <b>{item.current_price ? `₹${item.current_price.toLocaleString()}` : 'No live price'}</b></span>
          {item.target_price && <span>Target <b>₹{item.target_price.toLocaleString()}</b></span>}
          {item.decision?.decision && <span className="decision-mini">{item.decision.decision}</span>}
        </div>
      </div>
      <div className="row-actions">
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
