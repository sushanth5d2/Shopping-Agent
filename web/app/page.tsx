'use client';

import { useEffect, useMemo, useState } from 'react';
import { localAIStatus, localShoppingIntent, BROWSER_MODELS, getSelectedBrowserModel, setSelectedBrowserModel } from '../lib/local-ai';
import {
  Activity, Bell, Bot, Check, ChevronDown, CircleDollarSign, Clock3, ExternalLink,
  LayoutDashboard, ListChecks, LogOut, Menu, Package, Search, Settings, Sparkles,
  Target, TrendingDown, X, Zap, Link2, Layers3
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type Item = {
  id:number; name:string; quantity:number; target_price:number|null; max_price:number|null;
  mode:string; purchase_mode:string; status:string; product_id:number|null;
  current_price:number|null; decision:any;
};

type Listing = { listing_id?:number; store:string; true_total:number; price:number; delivery:number; seller:string; seller_rating:number; warranty?:string; returns?:string; url?:string; };

async function req(path:string,opt:RequestInit={}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sa_access') : null;
  const r = await fetch(API + path, {
    ...opt,
    headers:{'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(opt.headers||{})}
  });
  if(!r.ok) throw new Error((await r.json().catch(()=>({}))).detail || 'Request failed');
  return r.json();
}

const nav = [
  ['Home',LayoutDashboard],['To-Buy',ListChecks],['Batch Intake',Layers3],['Monitoring',Target],['Deals',TrendingDown],
  ['Orders',Package],['Savings',CircleDollarSign],['Agent Activity',Activity],['Settings',Settings]
] as const;

export default function App(){
  const [authed,setAuthed]=useState(false);
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [tab,setTab]=useState('Home'); const [mobileOpen,setMobileOpen]=useState(false);
  const [data,setData]=useState<any>(null); const [items,setItems]=useState<Item[]>([]);
  const [deals,setDeals]=useState<any[]>([]); const [monitor,setMonitor]=useState<any[]>([]);
  const [orders,setOrders]=useState<any[]>([]); const [activity,setActivity]=useState<any[]>([]);
  const [input,setInput]=useState(''); const [productUrl,setProductUrl]=useState(''); const [urlBusy,setUrlBusy]=useState(false); const [urlResult,setUrlResult]=useState<any>(null); const [compare,setCompare]=useState<any>(null);
  const [batchUrls,setBatchUrls]=useState(''); const [batchItems,setBatchItems]=useState(''); const [batchBusy,setBatchBusy]=useState(false); const [batchResult,setBatchResult]=useState<any>(null); const [batchMonitor,setBatchMonitor]=useState(false); const [batchTarget,setBatchTarget]=useState('');
  const [toast,setToast]=useState(''); const [dark,setDark]=useState(false); const [busy,setBusy]=useState(false); const [aiStatus,setAiStatus]=useState<any>(null); const [localAIReady,setLocalAIReady]=useState(false); const [localAILoading,setLocalAILoading]=useState(false);

  const load=async()=>{
    try{
      const [d,i,m,o,a,de]=await Promise.all([
        req('/api/dashboard'),req('/api/items'),req('/api/monitoring'),req('/api/orders'),req('/api/activity'),req('/api/deals')
      ]);
      setData(d);setItems(i.items||[]);setMonitor(m.items||[]);setOrders(o||[]);setActivity(a||[]);setDeals(de.deals||[]);setAuthed(true); try{setAiStatus(await req('/api/ai/status'))}catch{}
    }catch{ setAuthed(false); }
  };
  useEffect(()=>{ if(localStorage.getItem('sa_access')) load(); localAIStatus().then(()=>setLocalAIReady(true)).catch(()=>setLocalAIReady(false)); },[]);
  useEffect(()=>{ if(!toast)return; const t=setTimeout(()=>setToast(''),3500); return()=>clearTimeout(t); },[toast]);

  const auth=async()=>{setBusy(true);try{const x=await req(`/api/auth/${mode==='login'?'login':'register'}`,{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('sa_access',x.access_token);localStorage.setItem('sa_refresh',x.refresh_token);await load();}catch(e:any){setToast(e.message)}finally{setBusy(false)}};
  const analyzeUrl=async(monitor=false)=>{if(!productUrl.trim())return;setUrlBusy(true);try{const x=await req('/api/products/url-analyze',{method:'POST',body:JSON.stringify({url:productUrl.trim(),monitor})});setUrlResult(x);setCompare(x.comparison);setTab('Compare');setProductUrl('');await load();setToast(monitor?'Product analyzed and monitoring started':'Product analyzed and compared');}catch(e:any){setToast(e.message)}finally{setUrlBusy(false)}};
  const processBatch=async()=>{
    const target=batchTarget.trim()?Number(batchTarget):undefined;
    const urls=batchUrls.split(/\n|,/) .map(x=>x.trim()).filter(Boolean).map(url=>({url,monitor:batchMonitor,target_price:Number.isFinite(target as number)?target:undefined}));
    const todo_items=batchItems.split(/\n/).map(x=>x.trim()).filter(Boolean);
    if(!urls.length&&!todo_items.length){setToast('Add at least one URL or To-Buy item');return;}
    setBatchBusy(true);
    try{const x=await req('/api/batch/process',{method:'POST',body:JSON.stringify({urls,todo_items})});setBatchResult(x);setBatchUrls('');setBatchItems('');setBatchTarget('');await load();setToast(`Processed ${x.summary.urls_succeeded} URLs and ${x.summary.todo_created} To-Buy items`);}catch(e:any){setToast(e.message)}finally{setBatchBusy(false)}
  };
  const run=async()=>{if(!input.trim())return;setBusy(true);try{let text=input.trim(); if(localAIReady){setLocalAILoading(true); try { const normalized=await localShoppingIntent(text); if(normalized) text=normalized; } catch(e) { /* deterministic server parser remains the safety fallback */ } finally { setLocalAILoading(false); }} await req('/api/intent',{method:'POST',body:JSON.stringify({text}));setInput('');await load();setToast(localAIReady?'Local AI processed your request':'Shopping plan updated');}catch(e:any){setToast(e.message)}finally{setBusy(false)}};
  const buy=async(id:number)=>{setBusy(true);try{const x=await req(`/api/items/${id}/checkout`,{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()}});setToast(x.message||'Checkout completed');await load();}catch(e:any){setToast(e.message)}finally{setBusy(false)}};
  const startMonitor=async(id:number)=>{try{await req(`/api/items/${id}/monitor`,{method:'POST'});await load();setToast('Monitoring started');}catch(e:any){setToast(e.message)}};
  const compareItem=async(i:Item)=>{if(!i.product_id){setToast('No matched product yet. Add a supported product URL or clearer product name.');return}try{setCompare(await req(`/api/products/${i.product_id}/compare`));setTab('Compare')}catch(e:any){setToast(e.message)}};
  const signout=()=>{localStorage.clear();setAuthed(false);setCompare(null);setTab('Home')};

  if(!authed) return <Auth mode={mode} setMode={setMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} auth={auth} busy={busy} toast={toast}/>;

  const todo=items.filter(x=>x.status==='TODO'); const completed=items.filter(x=>x.status==='COMPLETED');
  const title = tab==='Home' ? 'Good morning' : tab;
  const stats=[
    ['To-Buy',todo.length,ListChecks,'neutral'],
    ['Monitoring',data?.stats?.monitored||0,Target,'purple'],
    ['Verified savings',`₹${Number(data?.stats?.verified_savings||0).toLocaleString()}`,CircleDollarSign,'green'],
    ['Orders',orders.length,Package,'orange']
  ];

  return <div className={dark?'app dark':'app'}>
    <aside className={`sidebar ${mobileOpen?'open':''}`}>
      <div className="brand"><span className="brand-mark"><Sparkles size={17}/></span><div><b>ShopAgent</b><small>personal shopping AI</small></div></div>
      <div className="live-badge"><span className="live-dot"/> LIVE DATA MODE</div>
      <nav>{nav.map(([name,Icon])=><button key={name} className={tab===name?'selected':''} onClick={()=>{setTab(name);setMobileOpen(false)}}><Icon size={17}/><span>{name}</span>{name==='Monitoring'&&monitor.length>0?<em>{monitor.length}</em>:null}</button>)}</nav>
      <div className="sidebar-agent"><div className="agent-orb"><Bot size={28}/></div><b>AI Shopping Agent</b><span>Works for you, saves for you.</span><button onClick={()=>setTab('Agent Activity')}>View activity <ChevronDown size={14}/></button></div>
      <button className="signout" onClick={signout}><LogOut size={16}/> Sign out</button>
    </aside>

    <main className="main">
      <header className="topbar"><div className="top-inner"><button className="mobile-menu" onClick={()=>setMobileOpen(!mobileOpen)}>{mobileOpen?<X/>:<Menu/>}</button><div><span className="crumb">SHOPAGENT / {tab.toUpperCase()}</span><h1>{title}{tab==='Home'&&<span className="wave"> 👋</span>}</h1></div><div className="top-actions"><div className="global-search"><Search size={16}/><input placeholder="Search anything…"/><kbd>⌘K</kbd></div><button className="round"><Bell size={17}/><i/></button><button className="profile" onClick={()=>setTab('Settings')}><span>SA</span><div><b>Account</b><small>Premium</small></div><ChevronDown size={14}/></button></div></div></header>

      <div className="content">
        {tab==='Home'&&<Home input={input} setInput={setInput} run={run} busy={busy} stats={stats} todo={todo} activity={activity} compareItem={compareItem} buy={buy} startMonitor={startMonitor} setTab={setTab} productUrl={productUrl} setProductUrl={setProductUrl} analyzeUrl={analyzeUrl} urlBusy={urlBusy}/>} 
        {tab==='To-Buy'&&<TodoPage items={todo} completed={completed} compareItem={compareItem} buy={buy} startMonitor={startMonitor}/>} 
        {tab==='Batch Intake'&&<BatchPage urls={batchUrls} setUrls={setBatchUrls} items={batchItems} setItems={setBatchItems} busy={batchBusy} result={batchResult} process={processBatch} monitor={batchMonitor} setMonitor={setBatchMonitor} target={batchTarget} setTarget={setBatchTarget} />}
        {tab==='Monitoring'&&<Monitoring rows={monitor} refresh={load}/>} 
        {tab==='Deals'&&<Deals deals={deals}/>} 
        {tab==='Orders'&&<Orders orders={orders}/>} 
        {tab==='Savings'&&<Savings data={data}/>} 
        {tab==='Agent Activity'&&<ActivityPage rows={activity}/>} 
        {tab==='Compare'&&<Compare data={compare} back={()=>setTab('To-Buy')}/>} 
        {tab==='Settings'&&<SettingsPage dark={dark} setDark={setDark} aiStatus={aiStatus}/>} 
      </div>
    </main>
    {toast&&<div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}

function Auth({mode,setMode,email,setEmail,password,setPassword,auth,busy,toast}:any){return <div className="auth-page"><div className="auth-glow"/><div className="auth-card"><div className="brand auth-brand"><span className="brand-mark"><Sparkles size={17}/></span><div><b>ShopAgent</b><small>personal shopping AI</small></div></div><span className="eyebrow">PRIVATE SHOPPING COMMAND CENTER</span><h1>{mode==='login'?'Welcome back.':'Create your account.'}</h1><p>One place to search, compare, monitor and control your shopping.</p><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></label><button className="primary wide" onClick={auth} disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Create account'}</button><button className="switch" onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'Create a new account':'I already have an account'}</button>{toast&&<div className="auth-error">{toast}</div>}</div></div>}

function Home({input,setInput,run,busy,stats,todo,activity,compareItem,buy,startMonitor,setTab,productUrl,setProductUrl,analyzeUrl,urlBusy}:any){return <div className="stack">
  <section className="hero"><div className="hero-copy"><span className="hero-badge"><Sparkles size={13}/> AI SHOPPING COMMAND CENTER</span><h2>Don't shop.<br/><span>Tell ShopAgent.</span></h2><p>Describe what you need. ShopAgent finds matching products, compares verified listings, monitors prices when you ask, and keeps every purchase inside your rules.</p><div className="command"><Search size={19}/><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&run()} placeholder="Try: Monitor Sony WH-1000XM6 below ₹25,000…"/><div className="text-xs text-white/60 mb-2">{localAIReady ? '● Built-in Local AI · no API key' : 'Local AI unavailable · server fallback active'}{localAILoading ? ' · loading model…' : ''}</div><button onClick={run} disabled={busy}>{busy?'Running…':<>Run agent <Zap size={15}/></>}</button></div><div className="suggestions"><button onClick={()=>setInput('Find the cheapest 5kg basmati rice')}>Cheapest rice</button><button onClick={()=>setInput('Monitor Sony WH-1000XM6 below ₹25,000 and ask me before buying')}>Monitor headphones</button><button onClick={()=>setInput('Buy USB-C cable under ₹500')}>Buy cable</button></div><div className="url-intake"><div className="url-intake-head"><div><span className="eyebrow">PRODUCT URL INTELLIGENCE</span><b>Paste a product link</b><small>ShopAgent reads the source page, identifies the exact variant, finds live alternatives, and can start monitoring it.</small></div><span className="url-badge">LIVE WEB</span></div><div className="url-command"><span>↗</span><input value={productUrl} onChange={e=>setProductUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&analyzeUrl(false)} placeholder="https://store.com/product/..."/><button onClick={()=>analyzeUrl(false)} disabled={urlBusy}>{urlBusy?'Analyzing…':'Compare'}</button><button className="url-monitor" onClick={()=>analyzeUrl(true)} disabled={urlBusy}>Compare + Monitor</button></div></div></div><div className="hero-visual"><div className="visual-ring ring-a"/><div className="visual-ring ring-b"/><div className="visual-core"><Bot size={40}/><span>AI</span></div><div className="float-card fc-one"><Target size={15}/><div><b>Price target</b><span>Watching</span></div></div><div className="float-card fc-two"><TrendingDown size={15}/><div><b>Best price</b><span>Verified</span></div></div></div></section>
  <div className="stat-grid">{stats.map(([label,value,Icon,kind]:any)=><div className="stat-card" key={label}><div><span>{label}</span><b>{value}</b><small>{label==='Monitoring'?'Automatic checks':label==='Verified savings'?'From recorded prices':label==='Orders'?'Purchase history':'Active shopping plan'}</small></div><div className={`stat-icon ${kind}`}><Icon size={18}/></div></div>)}</div>
  <div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><span className="eyebrow">YOUR SHOPPING PLAN</span><h3>To-Buy</h3></div><button className="link-btn" onClick={()=>setTab('To-Buy')}>View all <ChevronDown size={14}/></button></div>{todo.length?todo.slice(0,5).map((i:Item)=><ProductRow key={i.id} item={i} compare={()=>compareItem(i)} buy={()=>buy(i.id)} monitor={()=>startMonitor(i.id)}/>):<Empty icon={ListChecks} text="Your To-Buy list is clear." action="Add something" onClick={()=>document.querySelector<HTMLInputElement>('.command input')?.focus()}/>}</section><section className="panel"><div className="panel-head"><div><span className="eyebrow">TRANSPARENT AGENT</span><h3>Live activity</h3></div><button className="link-btn" onClick={()=>setTab('Agent Activity')}>View all <ChevronDown size={14}/></button></div><ActivityMini rows={activity}/></section></div>
</div>}

function TodoPage({items,completed,compareItem,buy,startMonitor}:any){return <div className="stack"><PageTitle eyebrow="SMART SHOPPING LIST" title="To-Buy" meta={`${items.length} active`}/><div className="panel"><div className="filterbar"><button className="filter active">All <span>{items.length}</span></button><button className="filter">Buy Now</button><button className="filter">Monitor</button><button className="filter">Compare</button><button className="filter sort">Sort: Priority <ChevronDown size={14}/></button></div>{items.length?items.map((i:Item)=><ProductRow key={i.id} item={i} compare={()=>compareItem(i)} buy={()=>buy(i.id)} monitor={()=>startMonitor(i.id)}/>):<Empty icon={ListChecks} text="No active items."/>}</div><div className="panel"><div className="panel-head"><div><span className="eyebrow">PURCHASE HISTORY</span><h3>Completed</h3></div><span className="count-pill">{completed.length}</span></div>{completed.length?completed.map((i:Item)=><div className="completed-row" key={i.id}><span className="done"><Check size={14}/></span><div><b>{i.name}</b><small>Completed purchase</small></div><strong>{i.current_price?`₹${i.current_price.toLocaleString()}`:'—'}</strong></div>):<Empty text="No completed purchases yet."/>}</div></div>}

function BatchPage({urls,setUrls,items,setItems,busy,result,process,monitor,setMonitor,target,setTarget}:any){
  return <div className="stack">
    <PageTitle eyebrow="BULK SHOPPING" title="Batch Intake" meta="Multiple URLs + multiple To-Buy items"/>
    <div className="batch-grid">
      <div className="panel batch-panel">
        <div className="panel-head"><div><span className="eyebrow">PRODUCT URLS</span><h3>Compare many products at once</h3></div><Link2 size={18}/></div>
        <p className="batch-help">Paste one product URL per line. ShopAgent verifies each page, extracts Product DNA, records a live listing and keeps the original source URL.</p>
        <textarea className="batch-textarea" value={urls} onChange={e=>setUrls(e.target.value)} placeholder={'https://store.example/product-a\nhttps://store.example/product-b\nhttps://store.example/product-c'}/>
        <div className="batch-options"><label><input type="checkbox" checked={monitor} onChange={e=>setMonitor(e.target.checked)}/> Monitor every verified URL</label>{monitor&&<input className="batch-target" inputMode="decimal" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Target price (optional)"/>}</div>
      </div>
      <div className="panel batch-panel">
        <div className="panel-head"><div><span className="eyebrow">TO-BUY LIST</span><h3>Multiple shopping items</h3></div><ListChecks size={18}/></div>
        <p className="batch-help">Add one shopping need per line. Each becomes an independent To-Buy item and can later be compared, monitored or purchased separately.</p>
        <textarea className="batch-textarea" value={items} onChange={e=>setItems(e.target.value)} placeholder={'Sony WH-1000XM6\nLogitech MX Master 3S\nUSB-C 100W cable\n2 kg basmati rice'}/>
      </div>
    </div>
    <div className="batch-actions"><button className="primary" onClick={process} disabled={busy}>{busy?'Processing batch…':'Process everything'} <Zap size={14}/></button><span>Each URL is processed independently; failed sources are reported without creating fake prices.</span></div>
    {result&&<div className="panel batch-result"><div className="panel-head"><div><span className="eyebrow">RESULT</span><h3>Batch processed</h3></div><span className="status green">{result.summary.urls_succeeded} URLS VERIFIED</span></div><div className="batch-summary"><div><b>{result.summary.todo_created}</b><small>To-Buy created</small></div><div><b>{result.summary.urls_succeeded}</b><small>URLs verified</small></div><div><b>{result.summary.urls_failed}</b><small>URLs failed</small></div></div><div className="batch-list">{(result.urls||[]).map((r:any)=><div className="batch-row" key={r.url}><span className={r.ok?'dot-ok':'dot-fail'}></span><div><b>{r.name||r.url}</b><small>{r.ok?`₹${Number(r.listing.true_total).toLocaleString()} • ${r.monitoring?'Monitoring enabled':'Buy Now'}`:r.error}</small></div><a href={r.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/></a></div>)}</div></div>}
  </div>
}

function Monitoring({rows,refresh}:any){return <div className="stack"><PageTitle eyebrow="PRICE INTELLIGENCE" title="Monitoring" meta={<span className="live-pill"><span className="live-dot"/> automatic checks</span>}/><div className="monitor-toolbar"><div className="monitor-tabs"><button className="active">Monitoring <span>{rows.length}</span></button><button>Near Target</button><button>Target Reached</button><button>Paused</button></div><button className="primary" onClick={refresh}>Refresh prices <Zap size={14}/></button></div>{rows.length?<div className="monitor-table panel"><div className="monitor-head"><span>PRODUCT</span><span>CURRENT PRICE</span><span>TARGET</span><span>STATUS</span><span>NEXT CHECK</span><span>ACTION</span></div>{rows.map((m:any)=><div className="monitor-line" key={m.id}><div className="monitor-product"><div className="product-thumb">{m.item.name.slice(0,2).toUpperCase()}</div><div><b>{m.item.name}</b><small>{m.item.purchase_mode} • {m.item.quantity} unit{m.item.quantity>1?'s':''}</small></div></div><strong>{m.best?.true_total?`₹${m.best.true_total.toLocaleString()}`:'Unavailable'}</strong><span>{m.item.target_price?`₹${m.item.target_price.toLocaleString()}`:'—'}</span><span className={`status ${m.status==='TARGET_REACHED'?'green':'purple'}`}>{m.status==='TARGET_REACHED'?'TARGET REACHED':'MONITORING'}</span><span className="next"><Clock3 size={13}/>{m.next_check?new Date(m.next_check).toLocaleString():'scheduled'}</span><button className="icon-action" title="Refresh" onClick={refresh}><Activity size={15}/></button></div>)}</div>:<Empty icon={Target} text="Nothing is being monitored. Add a command such as “Monitor headphones below ₹25,000”."/>}</div>}

function Deals({deals}:any){return <div className="stack"><PageTitle eyebrow="AI OPPORTUNITIES" title="Deals" meta="Price intelligence"/><div className="deal-grid">{deals.length?deals.map((d:any)=><div className="deal-card" key={d.product_id}><div className={`decision ${d.decision==='BUY'?'buy':d.decision==="DON'T BUY"?'dont':'wait'}`}>{d.decision}</div><div className="deal-top"><span className="deal-icon"><TrendingDown size={18}/></span><span className="verified">VERIFIED DATA</span></div><h3>{d.product}</h3><strong>₹{Number(d.price).toLocaleString()}</strong><div className="deal-stat"><span>{d.discount_percent}% below observed average</span></div><p>{d.reason}</p><button className="secondary">View product <ExternalLink size={14}/></button></div>):<Empty text="No deal signals available yet."/>}</div></div>}

function Orders({orders}:any){return <div className="stack"><PageTitle eyebrow="PURCHASE HISTORY" title="Orders" meta={`${orders.length} orders`}/><div className="panel"><div className="table-head"><span>PRODUCT</span><span>STORE</span><span>PRICE</span><span>STATUS</span><span>ORDER</span></div>{orders.length?orders.map((o:any)=><div className="order-row" key={o.id}><div className="monitor-product"><div className="product-thumb">{o.product_name.slice(0,2).toUpperCase()}</div><div><b>{o.product_name}</b><small>{new Date(o.created_at).toLocaleString()}</small></div></div><span>{o.store}</span><strong>₹{Number(o.price).toLocaleString()}</strong><span className="status green">{o.status}</span><code>{o.order_number}</code></div>):<Empty icon={Package} text="No confirmed orders yet."/>}</div></div>}

function Savings({data}:any){const value=Number(data?.stats?.verified_savings||0);return <div className="stack"><PageTitle eyebrow="MONEY SAVED" title="Savings" meta="Verified only"/><div className="savings-hero"><div><span className="hero-badge"><CircleDollarSign size={13}/> VERIFIED SAVINGS</span><h2>₹{value.toLocaleString()}</h2><p>Only savings supported by recorded prices are counted. ShopAgent never invents a saving.</p></div><div className="saving-visual"><CircleDollarSign size={64}/></div></div><div className="panel"><div className="panel-head"><div><span className="eyebrow">HOW IT WORKS</span><h3>Trust the number</h3></div></div><div className="three-explain"><Explain icon={Search} title="Observe" text="Record actual listing prices and final totals."/><Explain icon={TrendingDown} title="Compare" text="Compare against the best eligible alternative."/><Explain icon={Check} title="Verify" text="Count savings only after the evidence is recorded."/></div></div></div>}

function ActivityPage({rows}:any){return <div className="stack"><PageTitle eyebrow="TRANSPARENT AGENT" title="Agent Activity" meta="Audit trail"/><div className="panel activity-list">{rows.length?rows.map((x:any)=><div className="activity-item" key={x.id}><span className="activity-icon"><Activity size={15}/></span><div><b>{x.message}</b><small>{x.kind} • {new Date(x.created_at).toLocaleString()}</small></div></div>):<Empty icon={Activity} text="Agent activity will appear here."/>}</div></div>}

function Compare({data,back}:any){return <div className="stack"><button className="back-btn" onClick={back}>← Back to To-Buy</button>{data?<><PageTitle eyebrow="TRUE PRICE ENGINE" title={data.product} meta={<span className={`decision ${data.decision?.decision==='BUY'?'buy':'wait'}`}>{data.decision?.decision}</span>}/><div className="decision-banner"><div><b>{data.decision?.decision}</b><span>{data.decision?.reason}</span></div><span className="banner-label">PRICE DECISION</span></div><div className="listing-grid">{(data.listings||[]).map((l:Listing,i:number)=><div className={`listing-card ${i===0?'best':''}`} key={l.listing_id||l.store}><div className="listing-head"><div><span className="store-label">{l.store}</span>{i===0&&<span className="best-tag">BEST TOTAL</span>}</div><span className="match">{l.match_score||'—'}% match</span></div><div className="listing-price">₹{Number(l.true_total).toLocaleString()}</div><div className="price-breakdown"><div><span>Product</span><b>₹{Number(l.price).toLocaleString()}</b></div><div><span>Delivery</span><b>{l.delivery?'₹'+l.delivery:'FREE'}</b></div><div><span>Seller</span><b>{l.seller} · {l.seller_rating}</b></div><div><span>Warranty</span><b>{l.warranty||'Not provided'}</b></div><div><span>Returns</span><b>{l.returns||'Not provided'}</b></div></div>{l.url&&<a className="retailer-link" href={l.url} target="_blank" rel="noreferrer">Open retailer <ExternalLink size={14}/></a>}</div>)}</div><div className="source-note"><b>Source provenance</b><span>Every price card links to its original product page. Unverified search snippets are never used as a price.</span></div></>:<Empty text="Select a product to compare."/>}</div>}

function SettingsPage({dark,setDark,aiStatus}:any){return <div className="stack"><PageTitle eyebrow="CONTROL CENTER" title="Settings" meta="Safety first"/><div className="settings-grid"><div className="panel"><div className="panel-head"><div><span className="eyebrow">AI ENGINE</span><h3>Local + API AI</h3></div></div><div className="safety-box"><Bot size={18}/><div><b>{aiStatus?.configured_provider==='ollama'?'Ollama local AI':'Hosted API AI'}</b><span>{aiStatus?.ollama?.available?`Ollama online • ${aiStatus.ollama.model}`:'Ollama not detected'} {aiStatus?.api?.configured?'• API key configured':''}</span></div><span className={`status ${aiStatus?.ollama?.available?'green':'purple'}`}>{aiStatus?.ollama?.available?'LOCAL READY':'CONFIGURE'}</span></div><div className="setting-row"><div><b>Free/local mode</b><small>Run supported open-weight models locally through Ollama with no paid AI API.</small></div><span className="status green">SUPPORTED</span></div><div className="setting-row"><div><b>Hosted API mode</b><small>Use an OpenAI-compatible provider when higher-capability cloud reasoning is preferred.</small></div><span className="status blue">OPTIONAL</span></div><div className="setting-row"><div><b>Built-in browser models</b><small>Free local inference; choose a supported model. The selected model is cached in this browser.</small><select className="model-select" defaultValue={getSelectedBrowserModel()} onChange={e=>{setSelectedBrowserModel(e.target.value);window.location.reload();}}>{BROWSER_MODELS.map(m=><option key={m.id} value={m.id}>{m.name} · {m.device}</option>)}</select></div><span className="status green">NO API</span></div><div className="setting-row"><div><b>Ollama models</b><small>{(aiStatus?.ollama?.models||[]).length ? (aiStatus.ollama.models as string[]).join(', ') : 'Install any compatible Ollama model locally; ShopAgent discovers installed models automatically.'}</small></div><span className="status green">LOCAL</span></div></div><div className="panel"><div className="panel-head"><div><span className="eyebrow">APPEARANCE</span><h3>Interface</h3></div></div><SettingToggle title="Dark mode" text="Use the premium dark command-center theme." value={dark} onChange={setDark}/></div><div className="panel"><div className="panel-head"><div><span className="eyebrow">PURCHASE SAFETY</span><h3>Autonomous buying</h3></div></div><div className="safety-box"><Zap size={18}/><div><b>Auto-checkout is controlled server-side</b><span>Maximum price, seller rating, spending limits, duplicate protection and approval rules are enforced before checkout.</span></div></div><div className="setting-row"><div><b>Emergency stop</b><small>Use the API/settings client to disable purchase authorization globally.</small></div><span className="status green">READY</span></div></div></div></div>}

function SettingToggle({title,text,value,onChange}:any){return <div className="setting-row"><div><b>{title}</b><small>{text}</small></div><button className={`toggle ${value?'on':''}`} onClick={()=>onChange(!value)}><span/></button></div>}
function Explain({icon:Icon,title,text}:any){return <div className="explain"><span><Icon size={17}/></span><div><b>{title}</b><p>{text}</p></div></div>}
function ProductRow({item,compare,buy,monitor}:any){return <div className="product-row"><div className="product-thumb large">{item.name.slice(0,2).toUpperCase()}</div><div className="product-main"><div className="product-title"><b>{item.name}</b><span className={`status ${item.mode==='MONITOR'?'purple':'blue'}`}>{item.mode==='MONITOR'?'MONITOR':'BUY NOW'}</span></div><div className="product-meta"><span>Current <b>{item.current_price?`₹${item.current_price.toLocaleString()}`:'No live price'}</b></span>{item.target_price&&<span>Target <b>₹{item.target_price.toLocaleString()}</b></span>}{item.decision?.decision&&<span className="decision-mini">{item.decision.decision}</span>}</div></div><div className="row-actions"><button className="secondary" onClick={compare}>Compare</button>{item.mode!=='MONITOR'&&<button className="secondary" onClick={monitor}>Monitor</button>}<button className="primary" onClick={buy}>Buy now</button></div></div>}
function ActivityMini({rows}:any){return rows.length?<div className="activity-mini">{rows.slice(0,6).map((x:any)=><div className="activity-item" key={x.id}><span className="activity-icon"><Activity size={14}/></span><div><b>{x.message}</b><small>{new Date(x.created_at).toLocaleString()}</small></div></div>)}</div>:<Empty icon={Activity} text="No activity yet."/>}
function PageTitle({eyebrow,title,meta}:any){return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{meta&&<div className="page-meta">{meta}</div>}</div>}
function Empty({icon:Icon,text,action,onClick}:any){return <div className="empty">{Icon&&<span className="empty-icon"><Icon size={20}/></span>}<b>{text}</b>{action&&<button className="secondary" onClick={onClick}>{action}</button>}</div>}
