import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Terminal, Server, LayoutDashboard, Play, FileText, History, Upload, Activity, Shield, RefreshCw, AlertTriangle, CheckCircle2, XCircle, ChevronRight, Settings2, Trash2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  return (
    <BrowserRouter>
      <SplunkCCM />
    </BrowserRouter>
  );
}

function SplunkCCM() {
  const [auth, setAuth] = useState<{username: string, role: string, token: string} | null>(null);
  const [toast, setToast] = useState('');
  const toastTimeout = useRef<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(''), 3000);
  };

  // FIX: Centralized Auth Fetch wrapper to handle token expiry gracefully
  const secureFetch = async (url: string, options: any = {}) => {
    if (!auth) return null;
    const res = await fetch(API + url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${auth.token}`, 'X-User-Name': auth.username, 'X-User-Role': auth.role }
    });
    if (res.status === 401) { setAuth(null); return null; }
    return res;
  };

  if (!auth) return <AuthScreen setAuth={setAuth} />;

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono overflow-hidden flex flex-col selection:bg-green-900 selection:text-white relative">
      {toast && <div className="absolute top-4 right-4 z-50 bg-green-500/20 border border-green-500 text-green-400 px-4 py-2 font-bold tracking-widest text-xs animate-in fade-in slide-in-from-top-4">{toast}</div>}

      <header className="h-14 border-b border-green-900 bg-[#050505] flex items-center justify-between px-6 shadow-lg shadow-green-900/10 z-20">
        <div className="flex items-center space-x-4">
          <Shield className="text-green-500" size={20} />
          <span className="tracking-[0.3em] text-green-400 font-bold">CCM ORCHESTRATION MATRIX</span>
        </div>
        <div className="flex items-center space-x-4 text-xs uppercase">
          <span className="text-green-500">USER: {auth.username}</span>
          <span className={`border px-2 py-1 ${auth.role === 'admin' ? 'border-red-900 bg-red-950/30 text-red-500' : 'border-green-900 bg-green-950/30'}`}>{auth.role}</span>
          <button onClick={() => setAuth(null)} className="border border-green-900 text-green-500 px-3 py-1 hover:bg-green-900/20 hover:text-green-300 transition-colors">LOGOUT</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r border-green-900 bg-[#020202] p-4 space-y-2 z-10 flex flex-col">
          <div className="text-[10px] text-green-800 tracking-widest uppercase mb-2 mt-2 px-2">Core Operations</div>
          <NavButton icon={<LayoutDashboard size={16} />} title="Dashboard" active={location.pathname === '/'} onClick={() => navigate('/')} />
          <NavButton icon={<Play size={16} />} title="Deploy Engine" active={location.pathname === '/deploy'} onClick={() => navigate('/deploy')} />
          <div className="text-[10px] text-green-800 tracking-widest uppercase mb-2 mt-6 px-2">System Logs</div>
          <NavButton icon={<FileText size={16} />} title="ConfigMaps" active={location.pathname === '/configs'} onClick={() => navigate('/configs')} />
          <NavButton icon={<History size={16} />} title="Execution History" active={location.pathname === '/history'} onClick={() => navigate('/history')} />
        </aside>

        <main className="flex-1 overflow-hidden bg-black relative">
          <Routes>
            <Route path="/" element={<Dashboard auth={auth} secureFetch={secureFetch} showToast={showToast} />} />
            <Route path="/deploy" element={<DeployPage auth={auth} secureFetch={secureFetch} />} />
            <Route path="/configs" element={<ConfigMaps auth={auth} secureFetch={secureFetch} showToast={showToast} />} />
            <Route path="/history" element={<ExecutionHistory auth={auth} secureFetch={secureFetch} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function NavButton({ icon, title, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center px-4 py-3 text-sm border transition-all ${active ? 'border-green-500 bg-green-950/30 text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'border-[#111] hover:border-green-900 hover:bg-[#0a0a0a] text-green-700'}`}>
      <span className="mr-3">{icon}</span> {title}
    </button>
  );
}

function AuthScreen({ setAuth }: any) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');

  const submit = async (e: any) => {
    e.preventDefault();
    setError('');
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(API + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Authentication failed'); return; }
      if (isLogin) setAuth(data);
      else { alert("System Access Granted. Please Initialize Login Sequence."); setIsLogin(true); }
    } catch (e) { setError('CRITICAL: Backend Matrix Unreachable.'); }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-mono selection:bg-green-900 selection:text-white">
      <form onSubmit={submit} className="w-[420px] border border-green-900 bg-[#050505] p-8 shadow-[0_0_40px_rgba(20,83,45,0.3)] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-green-500/50 shadow-[0_0_20px_rgba(34,197,94,1)] animate-pulse"></div>
        <div className="mb-8 flex items-center justify-between">
          <div><div className="text-green-500 tracking-[0.3em] text-xs font-bold">SECURE TERMINAL</div><div className="text-3xl text-green-300 font-black mt-2 tracking-tight">CCM_AUTH</div></div>
          <Activity size={32} className="text-green-700 animate-pulse" />
        </div>
        {error && <div className="mb-4 border border-red-900 bg-red-950/20 text-red-400 p-3 text-xs tracking-wider">{error}</div>}
        <div className="space-y-4">
          <div><label className="text-green-700 text-[10px] uppercase tracking-widest">Operator ID</label><input required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-[#020202] border border-green-900 px-4 py-3 outline-none focus:border-green-500 text-green-400 mt-1" /></div>
          <div><label className="text-green-700 text-[10px] uppercase tracking-widest">Access Cipher</label><input required type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#020202] border border-green-900 px-4 py-3 outline-none focus:border-green-500 text-green-400 mt-1" /></div>
        </div>
        <button className="mt-8 w-full border border-green-600 bg-green-900/20 py-3 text-green-400 font-bold tracking-widest hover:bg-green-600 hover:text-black transition-all">
          {isLogin ? 'INITIATE LOGIN' : 'REGISTER OPERATOR'}
        </button>
        <button type="button" onClick={() => setIsLogin(!isLogin)} className="mt-4 text-xs text-green-800 hover:text-green-500 w-full text-center">
          {isLogin ? 'Create Access Token' : 'Return to Login Sequence'}
        </button>
      </form>
    </div>
  );
}

function getCleanRoleName(inst: any, idx: number, totalNodes: number) {
  const role = (inst.role || '').toLowerCase();
  const rawName = (inst.name || '').toLowerCase();
  if (role === 'master' || role === 'cluster_manager' || rawName.includes('master') || rawName.includes('manager')) return 'cluster_manager';
  if (role === 'search_head' || rawName.includes('search_head')) return `search_head_${idx + 1}`;
  if (role === 'indexer' || rawName.includes('indexer') || rawName.includes('peer')) return `indexer_${idx + 1}`;
  if (role === 'deployer' || rawName.includes('deployer')) return 'deployer';
  if (totalNodes === 1 || rawName.includes('standalone')) return 'standalone_node';
  if (idx === 0) return 'cluster_manager';
  return `indexer_${idx}`;
}

function Dashboard({ auth, secureFetch, showToast }: any) {
  const [deployments, setDeployments] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewLogs, setViewLogs] = useState<string | null>(null);

  const load = async () => {
    const res = await secureFetch('/api/deployments');
    if(res) { const data = await res.json(); setDeployments(data.data ||[]); }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5000);
    return () => clearInterval(interval);
  },[]);

  const handleAction = async (action: string, depId: string, instId?: string) => {
    if(!confirm(`SYS_WARN: Execute ${action} override?`)) return;
    if (action === 'delete_dep') await secureFetch(`/api/deployments/${depId}`, { method: 'DELETE' });
    else await secureFetch(`/api/deployments/${depId}/instances/${instId}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({desired_state: action}) });
    load();
  };

  return (
    <div className="p-6 h-full overflow-hidden flex flex-col relative">
      <div className="flex justify-between items-center mb-6 border-b border-green-900 pb-4">
        <div><div className="text-green-600 tracking-[0.3em] text-xs font-bold">INFRASTRUCTURE MATRIX</div><div className="text-2xl text-green-300 font-bold mt-1">Active State Vector</div></div>
        <button onClick={load} className="flex items-center border border-green-900 px-4 py-2 text-green-500 hover:bg-green-950/30 hover:border-green-500 transition-colors text-xs font-bold tracking-wider"><RefreshCw size={14} className="mr-2" /> REFRESH_DATA</button>
      </div>

      <div className="flex-1 overflow-auto bg-[#020202] border border-green-900">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#050505] text-green-700 uppercase tracking-widest border-b border-green-900">
            <tr><th className="p-4 border-r border-green-900/30">Workload_ID</th><th className="p-4 border-r border-green-900/30">Class</th><th className="p-4 border-r border-green-900/30">Nodes</th><th className="p-4 border-r border-green-900/30">State</th><th className="p-4 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-green-900/50">
            {deployments.map((dep, i) => {
              const effectiveId = dep.local_id || dep.deployment_id;
              return (
              <React.Fragment key={`${effectiveId}-${i}`}>
                <tr className="hover:bg-[#0a0a0a] cursor-pointer" onClick={() => setExpanded(expanded === effectiveId ? null : effectiveId)}>
                  <td className="p-4 text-green-300 font-bold flex items-center border-r border-green-900/30">
                    <ChevronRight size={14} className={`mr-2 transition-transform ${expanded===effectiveId?'rotate-90':''}`}/>
                    {dep.name}
                    {dep.props && <span className="ml-4 text-[9px] tracking-widest text-emerald-400 border border-emerald-900 px-2 py-0.5 bg-emerald-900/20">CONFIG_ACTIVE</span>}
                  </td>
                  <td className="p-4 text-green-600 border-r border-green-900/30">{dep.resource_type?.[0] || 'Unknown'}</td>
                  <td className="p-4 text-green-600 border-r border-green-900/30">{dep.num_instances}</td>
                  <td className="p-4 border-r border-green-900/30"><StatusBadge status={dep.local_status || dep.req_state} /></td>
                  <td className="p-4 text-right space-x-2">
                    {dep.local_id && <button onClick={(e) => {e.stopPropagation(); setViewLogs(dep.local_id);}} className="text-blue-500 hover:bg-blue-900/30 px-2 py-1 border border-blue-900">LOGS</button>}
                    {auth.role==='admin' && <button onClick={(e) => {e.stopPropagation(); handleAction('delete_dep', effectiveId);}} className="text-red-500 hover:bg-red-900/30 px-2 py-1 border border-red-900">SIGKILL</button>}
                  </td>
                </tr>
                {expanded === effectiveId && (
                  <tr className="bg-[#050505] border-b border-green-900">
                    <td colSpan={5} className="p-6">
                      <div className="flex space-x-6">
                        <div className="flex-1 border border-green-900/50 p-4">
                          <div className="text-green-800 tracking-widest text-[10px] uppercase mb-3 font-bold border-b border-green-900/50 pb-2">Network Topology</div>
                          {dep.instances_data?.map((inst:any, j:number) => {
                             let borderCol = 'border-[#222]';
                             if(inst.role === 'cluster_manager') borderCol = 'border-cyan-500';
                             else if(inst.role === 'indexer') borderCol = 'border-emerald-500';
                             else if(inst.role === 'standalone') borderCol = 'border-yellow-500';

                             return (
                            <div key={j} className={`mb-4 border-l-4 ${borderCol} bg-[#020202] p-3 shadow-lg border-y border-r border-y-[#222] border-r-[#222]`}>
                              <div className="flex justify-between items-center mb-2">
                                <div>
                                  <div className="text-white font-bold uppercase tracking-widest">{inst.hostname || `NODE-${j}`}</div>
                                  <div className="text-blue-400 text-[10px] font-bold mt-1">{inst.ip_address || 'Pending_Alloc'}</div>
                                </div>
                                <div className="flex space-x-2 items-center">
                                  <StatusBadge status={inst.state} />
                                  {inst.state === 'running' && (
                                    <>
                                      <a href={`https://${inst.ip_address}:8000`} title="Splunk Web" target="_blank" rel="noreferrer" className="text-cyan-400 border border-cyan-900 px-2 py-1 text-xs hover:bg-cyan-900/30" onClick={(e) => e.stopPropagation()}>🌐 UI</a>
                                      <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`ssh -i ~/.ssh/mykey.pem splunker@${inst.ip_address}`); showToast('COPIED_TO_CLIPBOARD'); }} className="text-green-400 border border-green-900 px-2 py-1 hover:bg-green-900/30 font-bold">SSH</button>
                                    </>
                                  )}
                                  {auth.role==='admin' && (
                                    <span className="flex space-x-1 border-l border-green-900/50 pl-4 ml-2">
                                      <button onClick={(e)=>{e.stopPropagation(); handleAction('running', effectiveId, inst.instance_id)}} className="text-green-600 hover:text-green-300 px-2 py-1 border border-transparent hover:border-green-700">START</button>
                                      <button onClick={(e)=>{e.stopPropagation(); handleAction('stopped', effectiveId, inst.instance_id)}} className="text-red-600 hover:text-red-300 px-2 py-1 border border-transparent hover:border-red-700">STOP</button>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 border border-[#111] p-3 bg-black shadow-inner">
                                <div className="text-yellow-600 tracking-widest text-[10px] uppercase font-bold mb-2 border-b border-[#222] pb-1">NODE_METADATA</div>
                                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[10px] text-[#888] font-mono">
                                  <div className="text-[#555]">INSTANCE_ID:</div><div className="text-white">{inst.instance_id}</div>
                                  <div className="text-[#555]">ROLE:</div><div className="text-pink-400 uppercase font-bold">{getCleanRoleName(inst, j, dep.instances_data.length)}</div>
                                </div>
                              </div>
                            </div>
                          )})}
                        </div>
                        <div className="flex-1 border border-green-900/50 p-4 bg-[#020202]">
                           <div className="text-green-800 tracking-widest text-[10px] uppercase mb-3 font-bold border-b border-green-900/50 pb-2">Injected ConfigMaps</div>
                           <div className="grid grid-cols-2 gap-4">
                             <div><div className="text-blue-600 text-[10px] uppercase mb-1">props.conf</div><pre className="text-blue-400 overflow-auto h-24 bg-black p-2 border border-green-900/30 text-[10px]">{dep.props || 'NULL'}</pre></div>
                             <div><div className="text-emerald-600 text-[10px] uppercase mb-1">transforms.conf</div><pre className="text-emerald-400 overflow-auto h-24 bg-black p-2 border border-green-900/30 text-[10px]">{dep.transforms || 'NULL'}</pre></div>
                           </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )})}
          </tbody>
        </table>
        {deployments.length === 0 && <div className="p-10 text-center text-green-800 tracking-widest text-xs">NO_ACTIVE_WORKLOADS_DETECTED</div>}
      </div>

      {viewLogs && (
        <div className="absolute inset-6 z-50 bg-[#020202] border border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.1)] flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center bg-[#050505] p-3 border-b border-blue-900">
            <span className="text-blue-500 font-bold tracking-widest">HISTORICAL_LOGS // {viewLogs}</span>
            <button onClick={()=>setViewLogs(null)} className="text-red-500 border border-red-900 px-4 py-1 hover:bg-red-900/30 font-bold text-xs tracking-widest transition-colors">CLOSE</button>
          </div>
          <div className="flex-1 overflow-hidden relative"><LiveTerminal deploymentId={viewLogs} staticMode={true} auth={auth} /></div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: any) {
  const s = String(status || '').toLowerCase();
  if (s.includes('success') || s.includes('running')) return <div className="flex items-center text-emerald-400 text-[10px] font-bold tracking-widest uppercase"><CheckCircle2 size={14} className="mr-1" /> {status}</div>;
  if (s.includes('fail') || s.includes('error')) return <div className="flex items-center text-red-400 text-[10px] font-bold tracking-widest uppercase"><XCircle size={14} className="mr-1" /> {status}</div>;
  if (s.includes('partial')) return <div className="flex items-center text-yellow-500 text-[10px] font-bold tracking-widest uppercase"><AlertTriangle size={14} className="mr-1" /> {status}</div>;
  return <div className="flex items-center text-yellow-400 text-[10px] font-bold tracking-widest uppercase"><Activity size={14} className="mr-1" /> {status}</div>;
}

function DeployPage({ auth, secureFetch }: any) {
  const [meta, setMeta] = useState<any>({ keys: [], os: [], instance_types: [], disk: [] });
  const [deploymentId, setDeploymentId] = useState('');
  const [running, setRunning] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);

  useEffect(() => {
    secureFetch('/api/meta').then((r:any) => { if(r) r.json().then((d:any) => setMeta(d)); });
  }, []);

  const today = new Date();
  const minDateStr = today.toISOString().split('T')[0];
  const maxDate = new Date(); maxDate.setDate(today.getDate() + 30);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const [config, setConfig] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('ccm_matrix_cache');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return { name: '', os: 'ubuntu_22.04', instance_type: 't3a.medium', disk_storage: 50, timezone: 'Asia/Calcutta', ssh_key: '', splunk_version: '10.2.0', ttl: maxDateStr, mode: 'standalone', rf: 3, sf: 2, pass4SymmKey: 'changeme_secret', custom_app_name: 'ccm_configs', propsConf: '', transformsConf: '', pem_key_content: '', debug_mode: 'standard' };
  });

  useEffect(() => { localStorage.setItem('ccm_matrix_cache', JSON.stringify(config)); }, [config]);

  const uploadPem = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev: any) => setConfig({ ...config, pem_key_content: ev.target.result });
    reader.readAsText(file);
  };

  const isFormValid = config.name && config.ssh_key && config.pem_key_content && config.ttl && config.os;

  const deploy = async () => {
    if(running) return;
    setRunning(true);
    try {
      const res = await secureFetch('/api/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...config, debug_mode: config.debug_mode === 'verbose' || config.debug_mode === 'trace', trace_mode: config.debug_mode === 'trace'}) });
      if(res) {
        const data = await res.json();
        if(data.deployment_id) {
          setDeploymentId(data.deployment_id);
          setConfig((prev:any) => ({...prev, propsConf: '', transformsConf: ''}));
          localStorage.removeItem('ccm_matrix_cache');
        }
      }
    } catch(e) { alert("MATRIX_ERR: Backend connection failed."); } finally { setRunning(false); }
  };

  return (
    <div className="h-full overflow-auto p-6 flex gap-6">
      <div className="flex-1 border border-green-900 bg-[#050505] flex flex-col">
        <div className="p-4 border-b border-green-900 bg-[#020202] flex justify-between items-center"><span className="text-green-500 font-bold tracking-widest">DEPLOYMENT_ENGINE</span>{running && <span className="text-blue-500 text-xs font-bold animate-pulse">TRANSMITTING...</span>}</div>
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Workload_ID *</label><input required placeholder="SYS_NODE_01" value={config.name || ''} onChange={(e) => setConfig({ ...config, name: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-3 outline-none focus:border-green-500 text-white" /></div>
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Target_OS</label><select value={config.os || ''} onChange={(e) => setConfig({ ...config, os: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-3 outline-none text-white">{meta.os?.map((x: any) => <option key={x}>{x}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Hardware_Spec</label><select value={config.instance_type || ''} onChange={(e) => setConfig({ ...config, instance_type: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-3 outline-none text-white">{meta.instance_types?.map((x: any) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Splunk_Version</label><select value={config.splunk_version || ''} onChange={(e) => setConfig({ ...config, splunk_version: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-3 outline-none text-white"><option value="10.2.0">10.2.0</option><option value="9.4.0">9.4.0</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">SSH_Key_Pair *</label><select value={config.ssh_key || ''} onChange={(e) => setConfig({ ...config, ssh_key: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-3 outline-none text-white"><option value="">-- SELECT KEY --</option>{meta.keys?.map((x: any) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Expiry_TTL *</label><input type="date" min={minDateStr} max={maxDateStr} value={config.ttl || ''} onChange={(e) => setConfig({ ...config, ttl: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-3 outline-none text-white [color-scheme:dark]" /></div>
          </div>
          <div className="mt-6 border border-emerald-900/50 bg-emerald-900/10 p-4">
             <label className="block text-emerald-500 font-bold uppercase tracking-widest text-[10px] mb-2">Upload RSA Key (.pem) *</label>
             <label className="inline-flex items-center px-4 py-3 border border-emerald-500 text-emerald-400 hover:bg-emerald-900/30 cursor-pointer uppercase tracking-widest text-[10px] font-bold transition-colors">
               <Upload size={14} className="mr-2"/> LOAD_PEM_KEY
               <input type="file" accept=".pem" onChange={uploadPem} className="hidden" />
             </label>
             {config.pem_key_content && <div className="text-emerald-500 mt-2 text-[10px] font-bold tracking-widest">KEY_LOADED_IN_MEM_BUFFER</div>}
          </div>

          <div className="border-t border-green-900/50 pt-6">
            <div className="flex space-x-2 mb-6"><button onClick={() => setConfig({ ...config, mode: 'standalone' })} className={`flex-1 py-3 border font-bold tracking-widest text-[10px] ${config.mode === 'standalone' ? 'bg-[#111] border-green-500 text-green-400' : 'border-green-900/50 text-green-800'}`}>STANDALONE_NODE</button><button onClick={() => setConfig({ ...config, mode: 'cluster' })} className={`flex-1 py-3 border font-bold tracking-widest text-[10px] ${config.mode === 'cluster' ? 'bg-[#111] border-green-500 text-green-400' : 'border-green-900/50 text-green-800'}`}>DISTRIBUTED_CLUSTER</button></div>
            {config.mode === 'cluster' && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Replication_Factor</label><input type="number" min="1" max="6" value={config.rf || ''} onChange={(e) => setConfig({ ...config, rf: parseInt(e.target.value) })} className="w-full bg-black border border-green-900 px-4 py-3 text-white outline-none" /></div>
                <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Search_Factor</label><input type="number" min="1" max={config.rf} value={config.sf || ''} onChange={(e) => setConfig({ ...config, sf: parseInt(e.target.value) })} className="w-full bg-black border border-green-900 px-4 py-3 text-white outline-none" /></div>
              </div>
            )}

            <button onClick={() => setAdvOpen(!advOpen)} className="mt-4 flex items-center text-blue-500 text-xs font-bold tracking-widest"><Settings2 size={14} className="mr-2"/> ADVANCED_SETTINGS</button>
            {advOpen && (
              <div className="mt-4 grid grid-cols-2 gap-4 border border-blue-900/30 p-4 bg-blue-900/5">
                <div>
                   <label className="block text-blue-700 text-[10px] uppercase tracking-widest mb-1">Logging_Verbosity</label>
                   <select value={config.debug_mode} onChange={(e) => setConfig({ ...config, debug_mode: e.target.value })} className="w-full bg-black border border-blue-900/50 px-4 py-2 outline-none text-white text-xs">
                     <option value="minimal">MINIMAL LOGS</option>
                     <option value="standard">STANDARD LOGS</option>
                     <option value="verbose">VERBOSE SSH STREAM</option>
                     <option value="trace">FULL TRACE MODE</option>
                   </select>
                </div>
                {config.mode === 'cluster' && <div><label className="block text-blue-700 text-[10px] uppercase tracking-widest mb-1">Pass4SymmKey_Secret</label><input type="text" value={config.pass4SymmKey} onChange={(e) => setConfig({ ...config, pass4SymmKey: e.target.value })} className="w-full bg-black border border-blue-900/50 px-4 py-2 text-white outline-none text-xs" /></div>}
              </div>
            )}

            <div className="text-green-700 text-[10px] uppercase tracking-widest mb-2 font-bold mt-4">ConfigMaps_Injection [OPTIONAL]</div>
            <input placeholder="App Directory Name" value={config.custom_app_name} onChange={(e) => setConfig({ ...config, custom_app_name: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-3 outline-none mb-4 text-white" />
            <div className="grid grid-cols-2 gap-4 mt-6">
              <textarea placeholder="props.conf" value={config.propsConf} onChange={(e) => setConfig({ ...config, propsConf: e.target.value })} className="h-60 bg-black border border-green-900 p-4 text-[10px] text-blue-400 outline-none" />
              <textarea placeholder="transforms.conf" value={config.transformsConf} onChange={(e) => setConfig({ ...config, transformsConf: e.target.value })} className="h-60 bg-black border border-green-900 p-4 text-[10px] text-emerald-400 outline-none" />
            </div>
          </div>

          <button onClick={deploy} disabled={!isFormValid || running || deploymentId !== ''} className={`mt-6 w-full border px-6 py-4 font-bold tracking-widest text-xs transition-colors ${isFormValid && !running && !deploymentId ? 'border-green-500 text-green-400 hover:bg-green-500 hover:text-black' : 'border-green-900/50 text-green-800 cursor-not-allowed opacity-50'}`}>
            {running ? 'EXECUTING_SYSCALL...' : deploymentId ? 'DEPLOYMENT_ACTIVE' : 'EXECUTE_DEPLOYMENT'}
          </button>
        </div>
      </div>
      <div className="w-[500px] border border-green-900 bg-[#020202] flex flex-col relative overflow-hidden">
        <div className="p-4 border-b border-green-900 bg-[#050505] flex justify-between items-center"><span className="text-green-500 font-bold tracking-widest">LIVE_OUTPUT</span></div>
        <div className="flex-1 relative bg-black">{deploymentId ? <LiveTerminal deploymentId={deploymentId} auth={auth} /> : <div className="absolute inset-0 flex items-center justify-center text-green-800 text-xs tracking-widest font-bold">AWAITING_EXECUTION</div>}</div>
      </div>
    </div>
  );
}

function ConfigMaps({ auth, secureFetch, showToast }: any) {
  const [configs, setConfigs] = useState<any[]>([]);
  const [localConfigs, setLocalConfigs] = useState<Record<string, any>>({});
  const [pemKeys, setPemKeys] = useState<Record<string, string>>({});
  const [viewLogs, setViewLogs] = useState<string | null>(null);

  const load = () => {
    secureFetch('/api/local_deployments').then((r:any) => {
      if(r) r.json().then((d:any) => { setConfigs(d || []); const lc: any = {}; d.forEach((c:any) => { lc[c.id] = { props: c.props, transforms: c.transforms }; }); setLocalConfigs(lc); });
    });
  };
  useEffect(() => { load(); }, []);

  const saveConfig = async (depId: string) => {
    await secureFetch(`/api/deployments/${depId}/configs`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(localConfigs[depId]) });
    showToast('CONFIG_SAVED_LOCALLY');
  };

  const uploadPemForConfig = (e: any, depId: string) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev: any) => { setPemKeys(prev => ({...prev, [depId]: ev.target.result})); showToast('PEM_LOADED_IN_MEM'); };
    reader.readAsText(file);
  };

  const applyConfig = async (depId: string) => {
    if (!pemKeys[depId]) return alert("SECURITY: PEM Key required to execute remote ConfigMap push.");
    await secureFetch(`/api/deployments/${depId}/apply-config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pem_key_content: pemKeys[depId] }) });
    await new Promise(r => setTimeout(r, 1000));
    setViewLogs(depId);
  };

  return (
    <div className="p-6 h-full overflow-hidden flex flex-col relative">
      <div className="text-green-600 tracking-[0.3em] text-xs font-bold mb-1">CONFIG_MANAGER</div>
      <div className="text-2xl text-green-300 font-bold mb-6">ConfigMap Repository</div>
      <div className="space-y-6 overflow-auto flex-1 pb-20">
        {configs.length===0 && <div className="text-green-800 tracking-widest mt-10">NO_CONFIGURATIONS_TRACKED</div>}
        {configs.map((c) => (
          <div key={c.id} className="border border-green-900 bg-[#050505] p-5">
            <div className="flex justify-between items-center mb-4 border-b border-green-900/50 pb-2">
              <div><div className="text-white text-lg font-bold">{c.name}</div><div className="text-green-700 text-sm tracking-widest font-mono">APP: {c.app_name}</div></div>
              <div className="flex space-x-3 items-center">
                <label className="inline-flex items-center px-3 py-1.5 border border-emerald-500 text-emerald-400 hover:bg-emerald-900/30 cursor-pointer uppercase tracking-widest text-[10px] font-bold">
                  <Upload size={12} className="mr-2"/> LOAD_PEM
                  <input type="file" accept=".pem" onChange={(e) => uploadPemForConfig(e, c.id)} className="hidden" />
                </label>
                <button onClick={() => saveConfig(c.id)} className="px-3 py-1.5 border border-yellow-500 text-yellow-500 hover:bg-yellow-900/30 uppercase tracking-widest text-[10px] font-bold transition-colors">SAVE</button>
                <button onClick={() => applyConfig(c.id)} className="px-3 py-1.5 border border-blue-500 bg-blue-900/20 text-blue-500 hover:bg-blue-500 hover:text-black uppercase tracking-widest text-[10px] font-bold shadow-[0_0_10px_rgba(59,130,246,0.2)] transition-colors">APPLY_TO_CLUSTER</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><div className="mb-2 text-blue-400 font-bold uppercase tracking-widest text-[10px]">props.conf</div><textarea value={localConfigs[c.id]?.props ?? ''} onChange={(e) => setLocalConfigs({...localConfigs, [c.id]: {...localConfigs[c.id], props: e.target.value}})} className="w-full bg-black border border-green-900/50 p-4 h-72 text-blue-300 text-[10px] font-mono outline-none focus:border-blue-500 transition-colors" /></div>
              <div><div className="mb-2 text-emerald-400 font-bold uppercase tracking-widest text-[10px]">transforms.conf</div><textarea value={localConfigs[c.id]?.transforms ?? ''} onChange={(e) => setLocalConfigs({...localConfigs, [c.id]: {...localConfigs[c.id], transforms: e.target.value}})} className="w-full bg-black border border-green-900/50 p-4 h-72 text-emerald-300 text-[10px] font-mono outline-none focus:border-emerald-500 transition-colors" /></div>
            </div>
          </div>
        ))}
      </div>
      {viewLogs && (
        <div className="absolute inset-6 z-50 bg-[#020202] border border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.1)] flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center bg-[#050505] p-3 border-b border-blue-900">
            <span className="text-blue-500 font-bold tracking-widest">LIVE_CONFIG_PUSH // {viewLogs}</span>
            <button onClick={() => setViewLogs(null)} className="text-red-500 border border-red-900 px-4 py-1 hover:bg-red-900/30 font-bold text-xs tracking-widest transition-colors">CLOSE</button>
          </div>
          <div className="flex-1 overflow-hidden relative"><LiveTerminal deploymentId={viewLogs} auth={auth} /></div>
        </div>
      )}
    </div>
  );
}

function ExecutionHistory({ auth, secureFetch }: any) {
  const [history, setHistory] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  useEffect(() => { secureFetch('/api/local_deployments').then((r:any) => { if(r) r.json().then((d:any) => setHistory(d || [])); }); }, []);

  return (
    <div className="h-full p-6 flex flex-col">
      <div className="text-green-600 tracking-[0.3em] text-xs font-bold mb-1">SYSTEM_LOGS</div>
      <div className="text-2xl text-green-300 font-bold mb-6">Execution History</div>
      <div className="flex-1 flex gap-6 overflow-hidden">
        <div className="w-[350px] border border-green-900 bg-[#050505] overflow-auto flex flex-col">
          {history.length===0 && <div className="p-6 text-green-800 text-xs tracking-widest">DATABASE_EMPTY</div>}
          {history.map((h) => (
            <div key={h.id} onClick={() => setSelected(h.id)} className={`p-4 border-b border-green-900/50 cursor-pointer hover:bg-[#0a0a0a] ${selected === h.id ? 'bg-[#0f0f0f] border-l-2 border-l-green-500' : ''}`}>
              <div className="text-white font-bold">{h.name}</div>
              <div className="text-green-700 text-xs mt-1 font-mono tracking-wider">{h.id}</div>
              <div className="mt-2"><StatusBadge status={h.status} /></div>
            </div>
          ))}
        </div>
        <div className="flex-1 border border-green-900 bg-black relative overflow-hidden">
          {selected ? <LiveTerminal deploymentId={selected} staticMode={true} auth={auth} /> : <div className="h-full flex items-center justify-center text-green-700 font-bold tracking-widest text-xs">SELECT_JOB_TO_VIEW_LOGS</div>}
        </div>
      </div>
    </div>
  );
}

function LiveTerminal({ deploymentId, staticMode = false, auth }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<any>();

  useEffect(() => {
    if (!deploymentId) return;
    let mounted = true;
    setLogs([]);
    const wsUrl = API.replace('http', 'ws') + `/ws/logs/${deploymentId}?token=${auth.token}`;

    fetch(API + `/api/deployments/${deploymentId}/logs`, { headers: { 'Authorization': `Bearer ${auth.token}` } }).then((r) => r.json()).then((d) => { if (!mounted) return; if (Array.isArray(d)) setLogs(d); });

    if (staticMode) return;

    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if(!paused) setLogs((prev) => {
          if (!Array.isArray(prev)) return [data];
          if (prev.some((l) => l.ts === data.ts && l.msg === data.msg)) return prev;
          const updated = [...prev, data];
          return updated.slice(-1000);
        });
      } catch (err) {}
    };
    return () => { mounted = false; if (ws.readyState === 1 || ws.readyState === 0) ws.close(); };
  }, [deploymentId, staticMode, paused]);

  useEffect(() => { if (scrollRef.current && !paused) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [logs, paused]);

  const hasFatal = logs.some(l => l.level === 'error' || l.msg.includes('[FATAL]'));

  return (
    <div className="absolute inset-0 bg-black flex flex-col overflow-hidden">
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#00ff0022 1px, transparent 1px), linear-gradient(90deg, #00ff0022 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
      {!staticMode && (
        <div className="absolute top-2 right-4 z-10 flex space-x-2">
          <button onClick={() => setPaused(!paused)} className={`border px-3 py-1 text-[10px] font-bold tracking-widest ${paused ? 'border-yellow-500 text-yellow-500 bg-yellow-900/20' : 'border-green-900 text-green-600 hover:bg-green-900/30'}`}>{paused ? 'RESUME STREAM' : 'PAUSE'}</button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6 font-mono text-[11px] leading-relaxed relative z-0">
        {Array.isArray(logs) && logs.map((l: any, i: number) => {
          let tagColor = 'text-green-700';
          if(l.tag === 'SSH') tagColor = 'text-cyan-500';
          else if(l.tag === 'API') tagColor = 'text-purple-500';
          else if(l.tag === 'BUNDLE') tagColor = 'text-yellow-500';
          else if(l.tag === 'BTOOL') tagColor = 'text-emerald-500';
          else if(l.tag === 'SYS') tagColor = 'text-pink-500';

          return (
            <div key={i} className="mb-0.5 flex gap-3 hover:bg-[#111] px-1 py-0.5 rounded transition-colors">
              <span className="text-[#555] shrink-0 w-[55px]">[{l.ts || '--:--'}]</span>
              <span className={`font-bold shrink-0 w-[60px] ${tagColor}`}>[{l.tag || 'EXEC'}]</span>
              <span className={`font-bold shrink-0 w-[60px] ${l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : l.level === 'success' ? 'text-emerald-400' : l.level === 'debug' ? 'text-purple-400' : 'text-blue-400'}`}>[{(l.level || 'info').toUpperCase()}]</span>
              <span className={`${l.level === 'debug' ? 'text-[#888]' : l.level === 'error' ? 'text-red-400 font-bold' : 'text-white'} break-all whitespace-pre-wrap`}>{l.msg || ''}</span>
            </div>
          )
        })}
        {!staticMode && !hasFatal && !paused && <div className="mt-2 text-green-700 animate-pulse">_</div>}
        {(hasFatal || (staticMode && logs.some(l => l.level === 'error'))) && <div className="mt-4 text-red-500 font-bold animate-pulse tracking-widest">[SYSTEM_HALTED] _</div>}
      </div>
    </div>
  );
}