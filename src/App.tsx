import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal, Server, LayoutDashboard, Play, FileText, History, Bug,
  Upload, Activity, Shield, Cpu, Network, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, ChevronRight, ChevronDown, Trash2, Square
} from 'lucide-react';

const API = 'http://localhost:8000';

export default function SplunkCCM() {
  const [auth, setAuth] = useState<any>(null);
  const [route, setRoute] = useState('dashboard');

  if (!auth) {
    return <AuthScreen setAuth={setAuth} />;
  }

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono overflow-hidden flex flex-col selection:bg-green-900 selection:text-white">
      <header className="h-14 border-b border-green-900 bg-[#050505] flex items-center justify-between px-6 shadow-lg shadow-green-900/10 z-20">
        <div className="flex items-center space-x-4">
          <Shield className="text-green-500" size={20} />
          <span className="tracking-[0.3em] text-green-400 font-bold">
            CCM ORCHESTRATION MATRIX
          </span>
        </div>

        <div className="flex items-center space-x-4 text-xs uppercase">
          <span className="text-green-500">USER: {auth.username}</span>
          <span className={`border px-2 py-1 ${auth.role === 'admin' ? 'border-red-900 bg-red-950/30 text-red-500' : 'border-green-900 bg-green-950/30'}`}>
            {auth.role}
          </span>
          <button onClick={() => setAuth(null)} className="border border-green-900 text-green-500 px-3 py-1 hover:bg-green-900/20 hover:text-green-300 transition-colors">
            LOGOUT
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r border-green-900 bg-[#020202] p-4 space-y-2 z-10 flex flex-col">
          <div className="text-[10px] text-green-800 tracking-widest uppercase mb-2 mt-2 px-2">Core Operations</div>
          <NavButton icon={<LayoutDashboard size={16} />} title="Dashboard" active={route === 'dashboard'} onClick={() => setRoute('dashboard')} />
          <NavButton icon={<Play size={16} />} title="Deploy Engine" active={route === 'deploy'} onClick={() => setRoute('deploy')} />

          <div className="text-[10px] text-green-800 tracking-widest uppercase mb-2 mt-6 px-2">System Logs</div>
          <NavButton icon={<FileText size={16} />} title="ConfigMaps" active={route === 'configs'} onClick={() => setRoute('configs')} />
          <NavButton icon={<History size={16} />} title="Execution History" active={route === 'history'} onClick={() => setRoute('history')} />
        </aside>

        <main className="flex-1 overflow-hidden bg-black relative">
          {/* Using display:none keeps components mounted so WebSockets don't die on tab switch */}
          <div className="h-full w-full absolute inset-0" style={{ display: route === 'dashboard' ? 'block' : 'none' }}><Dashboard auth={auth} /></div>
          <div className="h-full w-full absolute inset-0" style={{ display: route === 'deploy' ? 'block' : 'none' }}><DeployPage auth={auth} /></div>
          <div className="h-full w-full absolute inset-0" style={{ display: route === 'configs' ? 'block' : 'none' }}><ConfigMaps /></div>
          <div className="h-full w-full absolute inset-0" style={{ display: route === 'history' ? 'block' : 'none' }}><ExecutionHistory /></div>
        </main>
      </div>
    </div>
  );
}

function NavButton({ icon, title, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center px-4 py-3 text-sm border transition-all ${
        active ? 'border-green-500 bg-green-950/30 text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'border-[#111] hover:border-green-900 hover:bg-[#0a0a0a] text-green-700'
      }`}>
      <span className="mr-3">{icon}</span> {title}
    </button>
  );
}

// --- AUTH SCREEN ---
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
      const res = await fetch(API + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Authentication failed');
        return;
      }

      if (isLogin) setAuth(data);
      else {
        alert("System Access Granted. Please Initialize Login Sequence.");
        setIsLogin(true);
      }
    } catch (e) {
      setError('CRITICAL: Backend Matrix Unreachable.');
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-mono selection:bg-green-900 selection:text-white">
      <form onSubmit={submit} className="w-[420px] border border-green-900 bg-[#050505] p-8 shadow-[0_0_40px_rgba(20,83,45,0.3)] relative overflow-hidden">
        {/* Decorative hacker scanline */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-green-500/50 shadow-[0_0_20px_rgba(34,197,94,1)] animate-pulse"></div>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-green-500 tracking-[0.3em] text-xs font-bold">SECURE TERMINAL</div>
            <div className="text-3xl text-green-300 font-black mt-2 tracking-tight">CCM_AUTH</div>
          </div>
          <Activity size={32} className="text-green-700 animate-pulse" />
        </div>

        {error && <div className="mb-4 border border-red-900 bg-red-950/20 text-red-400 p-3 text-xs tracking-wider">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="text-green-700 text-[10px] uppercase tracking-widest">Operator ID</label>
            <input required placeholder="root_admin" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-[#020202] border border-green-900 px-4 py-3 outline-none focus:border-green-500 text-green-400 mt-1" />
          </div>
          <div>
            <label className="text-green-700 text-[10px] uppercase tracking-widest">Access Cipher</label>
            <input required type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#020202] border border-green-900 px-4 py-3 outline-none focus:border-green-500 text-green-400 mt-1" />
          </div>
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

// --- DASHBOARD ---
function Dashboard({ auth }: any) {
  const [deployments, setDeployments] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewLogs, setViewLogs] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(API + '/api/deployments', { headers: { 'X-User-Name': auth.username, 'X-User-Role': auth.role } });
    const data = await res.json();
    setDeployments(data.data ||[]);
  };

  useEffect(() => { load(); },[]);

  const handleAction = async (action: string, depId: string, instId?: string) => {
    if(!confirm(`SYS_WARN: Execute ${action} override?`)) return;
    if (action === 'delete_dep') await fetch(API + `/api/deployments/${depId}`, { method: 'DELETE' });
    else await fetch(API + `/api/deployments/${depId}/instances/${instId}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({desired_state: action}) });
    load();
  };

  return (
    <div className="p-6 h-full overflow-hidden flex flex-col relative">
      <div className="flex justify-between items-center mb-6 border-b border-green-900 pb-4">
        <div>
          <div className="text-green-600 tracking-[0.3em] text-xs font-bold">INFRASTRUCTURE MATRIX</div>
          <div className="text-2xl text-green-300 font-bold mt-1">Active State Vector</div>
        </div>
        <button onClick={load} className="flex items-center border border-green-900 px-4 py-2 text-green-500 hover:bg-green-950/30 hover:border-green-500 transition-colors text-xs font-bold tracking-wider">
          <RefreshCw size={14} className="mr-2" /> REFRESH_DATA
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-[#020202] border border-green-900">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#050505] text-green-700 uppercase tracking-widest border-b border-green-900">
            <tr><th className="p-4 border-r border-green-900/30">Workload_ID</th><th className="p-4 border-r border-green-900/30">Class</th><th className="p-4 border-r border-green-900/30">Nodes</th><th className="p-4 border-r border-green-900/30">State</th><th className="p-4 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-green-900/50">
            {deployments.map((dep, i) => (
              <React.Fragment key={i}>
                <tr className="hover:bg-[#0a0a0a] cursor-pointer" onClick={() => setExpanded(expanded === dep.deployment_id ? null : dep.deployment_id)}>
                  <td className="p-4 text-green-300 font-bold flex items-center border-r border-green-900/30"><ChevronRight size={14} className={`mr-2 transition-transform ${expanded===dep.deployment_id?'rotate-90':''}`}/> {dep.name}</td>
                  <td className="p-4 text-green-600 border-r border-green-900/30">{dep.resource_type?.[0] || 'Unknown'}</td>
                  <td className="p-4 text-green-600 border-r border-green-900/30">{dep.num_instances}</td>
                  <td className="p-4 border-r border-green-900/30"><StatusBadge status={dep.local_status || dep.req_state} /></td>
                  <td className="p-4 text-right space-x-2">
                    {dep.local_id && <button onClick={(e) => {e.stopPropagation(); setViewLogs(dep.local_id);}} className="text-blue-500 hover:bg-blue-900/30 px-2 py-1 border border-blue-900">LOGS</button>}
                    {auth.role==='admin' && <button onClick={(e) => {e.stopPropagation(); handleAction('delete_dep', dep.deployment_id);}} className="text-red-500 hover:bg-red-900/30 px-2 py-1 border border-red-900">SIGKILL</button>}
                  </td>
                </tr>
                {expanded === dep.deployment_id && (
                  <tr className="bg-[#050505] border-b border-green-900">
                    <td colSpan={5} className="p-6">
                      <div className="flex space-x-6">
                        <div className="flex-1 border border-green-900/50 p-4">
                          <div className="text-green-800 tracking-widest text-[10px] uppercase mb-3 font-bold border-b border-green-900/50 pb-2">Network Topology</div>
                          {(dep.topology || []).map((node:any, j:number) => (
                            <div
  key={j}
  className="mb-3 border border-[#222] bg-[#050505] p-3"
>
  <div className="flex justify-between items-center mb-2">
    <div>
      <div className="text-white font-bold uppercase">
        {node.role}
      </div>

      <div className="text-blue-400 text-[10px]">
        {node.ip}
      </div>
    </div>

    <div className="text-green-500 font-bold">
      ONLINE
    </div>
  </div>

  <div className="mt-2">
    <div className="text-[#666] text-[10px] mb-1">
      SSH COMMAND
    </div>

    <div className="bg-black border border-[#333] p-2 text-green-400 break-all">
      {node.ssh}
    </div>

    <button
      onClick={() => navigator.clipboard.writeText(node.ssh)}
      className="mt-2 px-2 py-1 border border-blue-900 text-blue-400 hover:bg-blue-900/20"
    >
      COPY_SSH
    </button>
  </div>
</div>
                          ))}
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
            ))}
          </tbody>
        </table>
        {deployments.length === 0 && <div className="p-10 text-center text-green-800 tracking-widest text-xs">NO_ACTIVE_WORKLOADS_DETECTED</div>}
      </div>

      {viewLogs && (
        <div className="absolute inset-6 z-50 bg-[#020202] border border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.1)] flex flex-col">
          <div className="flex justify-between items-center bg-[#050505] p-3 border-b border-green-900">
            <span className="text-blue-500 font-bold tracking-widest">HISTORICAL_LOGS // {viewLogs}</span>
            <button onClick={()=>setViewLogs(null)} className="text-red-500 border border-red-900 px-4 py-1 hover:bg-red-900/30 font-bold text-xs tracking-widest">CLOSE</button>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <LiveTerminal deploymentId={viewLogs} staticMode={true} />
          </div>
        </div>
      )}
    </div>
  );
}

// --- ORCHESTRATOR WIZARD ---
function DeployPage({ auth }: any) {
  const [meta, setMeta] = useState<any>({ keys: [], os:[], instance_types: [], disk: [] });
  const [deploymentId, setDeploymentId] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => { fetch(API + '/api/meta').then((r) => r.json()).then((d) => setMeta(d)); },[]);

  const today = new Date();
  const minDateStr = today.toISOString().split('T')[0];
  const maxDate = new Date(); maxDate.setDate(today.getDate() + 30);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('ccm_matrix_cache');
    if (saved) return JSON.parse(saved);
    return {
      name: '', os: 'ubuntu_22.04', instance_type: 't3a.medium', disk_storage: '50', timezone: 'Asia/Calcutta', ssh_key: '', splunk_version: '10.2.0', ttl: maxDateStr,
      mode: 'standalone', rf: 3, sf: 2, pass4SymmKey: 'secret_hash_key',
      custom_app_name: 'ccm_custom_configs', propsConf: '', transformsConf: '', pem_key_content: ''
    };
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
      // FIX: Removed the console.log from inside the fetch options object
      const res = await fetch(API + '/api/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Name': auth.username },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      setDeploymentId(data.deployment_id);
    } catch(e) {
      alert("MATRIX_ERR: Backend connection failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6 flex gap-6">
      {/* LEFT PANEL: CONFIG FORM */}
      <div className="flex-1 border border-green-900 bg-[#020202] flex flex-col">
        <div className="p-4 border-b border-green-900 bg-[#050505] flex justify-between items-center">
          <span className="text-green-500 font-bold tracking-widest">DEPLOYMENT_ENGINE</span>
          {running && <span className="text-blue-500 text-xs font-bold animate-pulse">TRANSMITTING...</span>}
        </div>

        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Workload_ID *</label><input required placeholder="SYS_NODE_01" value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none focus:border-green-500" /></div>
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Target_OS</label><select value={config.os} onChange={(e) => setConfig({ ...config, os: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none"><option value="ubuntu_22.04">ubuntu_22.04 [Stable]</option></select></div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Hardware_Spec</label><select value={config.instance_type} onChange={(e) => setConfig({ ...config, instance_type: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none">{meta.instance_types.map((x: any) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Splunk_Version</label><select value={config.splunk_version} onChange={(e) => setConfig({ ...config, splunk_version: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none"><option value="10.2.0">10.2.0</option><option value="9.4.0">9.4.0</option></select></div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">SSH_Key_Pair *</label><select value={config.ssh_key} onChange={(e) => setConfig({ ...config, ssh_key: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none"><option value="">-- SELECT KEY --</option>{meta.keys.map((x: any) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Expiry_TTL *</label><input type="date" min={minDateStr} max={maxDateStr} value={config.ttl} onChange={(e) => setConfig({ ...config, ttl: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none [color-scheme:dark]" /></div>
          </div>

          <div className="border border-blue-900/50 bg-blue-900/10 p-4">
             <label className="block text-blue-500 font-bold uppercase tracking-widest text-[10px] mb-2">Upload RSA Key (.pem) *</label>
             <input type="file" accept=".pem" onChange={uploadPem} className="text-xs text-green-700" />
             {config.pem_key_content && <div className="text-emerald-500 mt-2 text-[10px] font-bold">KEY_LOADED_IN_MEM_BUFFER</div>}
          </div>

          <div className="border-t border-green-900/50 pt-6">
            <div className="text-green-700 text-[10px] uppercase tracking-widest mb-2 font-bold">Topology_Matrix</div>
            <div className="flex space-x-2 mb-6">
              <button onClick={() => setConfig({ ...config, mode: 'standalone' })} className={`flex-1 py-3 border font-bold tracking-widest text-[10px] ${config.mode === 'standalone' ? 'bg-[#111] border-green-500 text-green-400' : 'border-green-900/50 text-green-800'}`}>STANDALONE_NODE</button>
              <button onClick={() => setConfig({ ...config, mode: 'cluster' })} className={`flex-1 py-3 border font-bold tracking-widest text-[10px] ${config.mode === 'cluster' ? 'bg-[#111] border-green-500 text-green-400' : 'border-green-900/50 text-green-800'}`}>DISTRIBUTED_CLUSTER</button>
            </div>

            {config.mode === 'cluster' && (
              <div className="grid grid-cols-2 gap-6 bg-[#050505] p-4 border border-green-900/50 mb-6">
                <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Replication_Factor</label><input type="number" min="1" max="6" value={config.rf} onChange={(e) => setConfig({ ...config, rf: parseInt(e.target.value) })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none" /></div>
                <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Search_Factor</label><input type="number" min="1" max={config.rf} value={config.sf} onChange={(e) => setConfig({ ...config, sf: parseInt(e.target.value) })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none" /></div>
                <div className="col-span-2"><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">Pass4SymmKey_Secret</label><input type="text" value={config.pass4SymmKey} onChange={(e) => setConfig({ ...config, pass4SymmKey: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none" /></div>
              </div>
            )}

            <div className="text-green-700 text-[10px] uppercase tracking-widest mb-2 font-bold mt-4">ConfigMaps_Injection [OPTIONAL]</div>
            <div><label className="block text-green-700 text-[10px] uppercase tracking-widest mb-1">App_Directory</label><input type="text" value={config.custom_app_name} onChange={(e) => setConfig({ ...config, custom_app_name: e.target.value })} className="w-full bg-black border border-green-900 px-4 py-2 text-green-400 outline-none mb-4" /></div>

            <div className="grid grid-cols-2 gap-6">
              <textarea placeholder="props.conf" value={config.propsConf} onChange={(e) => setConfig({ ...config, propsConf: e.target.value })} className="h-40 bg-black border border-green-900 p-4 text-[10px] text-blue-400 outline-none" />
              <textarea placeholder="transforms.conf" value={config.transformsConf} onChange={(e) => setConfig({ ...config, transformsConf: e.target.value })} className="h-40 bg-black border border-green-900 p-4 text-[10px] text-emerald-400 outline-none" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-green-900 bg-[#050505] flex justify-end">
          <button
  onClick={deploy}
  disabled={!isFormValid || running || deploymentId}
  className={`border px-8 py-3 tracking-widest font-bold text-xs transition-colors ${
    isFormValid && !running && !deploymentId
      ? 'border-green-500 text-green-400 hover:bg-green-500 hover:text-black'
      : 'border-green-900/50 text-green-800 cursor-not-allowed opacity-50'
  }`}
>
  {running
    ? 'EXECUTING_SYSCALL...'
    : deploymentId
    ? 'DEPLOYMENT_ACTIVE'
    : 'EXECUTE_DEPLOYMENT'}
</button>
        </div>
      </div>

      {/* RIGHT PANEL: TERMINAL */}
      <div className="w-[450px] border border-green-900 bg-[#020202] flex flex-col">
        <div className="p-4 border-b border-green-900 bg-[#050505] flex justify-between items-center">
          <span className="text-green-500 font-bold tracking-widest">LIVE_OUTPUT</span>
          {running && <span className="text-emerald-500 text-[10px] font-bold animate-pulse">STREAMING</span>}
        </div>
        <div className="flex-1 relative">
          {deploymentId ? <LiveTerminal deploymentId={deploymentId} /> : <div className="absolute inset-0 flex items-center justify-center text-green-800 text-xs tracking-widest font-bold">AWAITING_EXECUTION</div>}
        </div>
      </div>
    </div>
  );
}

function ConfigMaps() {
  const [configs, setConfigs] = useState<any[]>([]);
  useEffect(() => { fetch(API + '/api/local_deployments').then((r) => r.json()).then((d) => setConfigs(d || [])); },[]);

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="text-green-600 tracking-[0.3em] text-xs font-bold mb-1">CONFIG_MANAGER</div>
      <div className="text-2xl text-green-300 font-bold mb-6">ConfigMap Repository</div>
      <div className="space-y-6">
        {configs.length===0 && <div className="text-green-800 tracking-widest mt-10">NO_CONFIGURATIONS_TRACKED</div>}
        {configs.map((c) => (
          <div key={c.id} className="border border-green-900 bg-[#020202] p-5">
            <div className="flex justify-between mb-4 border-b border-green-900/50 pb-2">
              <div className="text-green-400 text-sm font-bold tracking-widest">{c.name}</div>
              <div className="text-blue-500 text-[10px] tracking-widest">APP: {c.app_name}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><div className="mb-1 text-blue-600 text-[10px] font-bold uppercase tracking-widest">props.conf</div><pre className="bg-black border border-green-900/50 p-3 overflow-auto h-40 text-blue-400 text-[10px]">{c.props || 'NULL'}</pre></div>
              <div><div className="mb-1 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">transforms.conf</div><pre className="bg-black border border-green-900/50 p-3 overflow-auto h-40 text-emerald-400 text-[10px]">{c.transforms || 'NULL'}</pre></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutionHistory() {
  const [history, setHistory] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  useEffect(() => { fetch(API + '/api/local_deployments').then((r) => r.json()).then((d) => setHistory(d || [])); },[]);

  return (
    <div className="h-full p-6 flex flex-col">
      <div className="text-green-600 tracking-[0.3em] text-xs font-bold mb-1">SYSTEM_LOGS</div>
      <div className="text-2xl text-green-300 font-bold mb-6">Execution History</div>
      <div className="flex-1 flex gap-6 overflow-hidden">
        <div className="w-[350px] border border-green-900 bg-[#020202] overflow-auto">
          {history.length===0 && <div className="p-6 text-green-800 text-xs tracking-widest">DATABASE_EMPTY</div>}
          {history.map((h) => (
            <div key={h.id} onClick={() => setSelected(h.id)} className={`p-4 border-b border-green-900/50 cursor-pointer hover:bg-[#0a0a0a] ${selected === h.id ? 'bg-[#050505] border-l-2 border-l-green-500' : ''}`}>
              <div className="text-green-300 font-bold text-xs">{h.name}</div>
              <div className="text-green-700 text-[10px] mt-1 font-mono tracking-wider">{h.id}</div>
              <div className="mt-2"><StatusBadge status={h.status} /></div>
            </div>
          ))}
        </div>
        <div className="flex-1 border border-green-900 bg-[#020202] relative overflow-hidden">
          {selected ? <LiveTerminal deploymentId={selected} staticMode={true} /> : <div className="absolute inset-0 flex items-center justify-center text-green-800 text-xs tracking-widest font-bold">SELECT_JOB_TO_VIEW_LOGS</div>}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: any) {
  const s = String(status || '').toLowerCase();
  if (s.includes('success') || s.includes('running')) return <div className="flex items-center text-emerald-500 text-[10px] font-bold tracking-widest uppercase"><CheckCircle2 size={12} className="mr-1" /> {status}</div>;
  if (s.includes('fail') || s.includes('error')) return <div className="flex items-center text-red-500 text-[10px] font-bold tracking-widest uppercase"><XCircle size={12} className="mr-1" /> {status}</div>;
  return <div className="flex items-center text-yellow-500 text-[10px] font-bold tracking-widest uppercase"><AlertTriangle size={12} className="mr-1" /> {status}</div>;
}

function LiveTerminal({ deploymentId, staticMode = false }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const scrollRef = useRef<any>();

  useEffect(() => {
    if (!deploymentId) return;
    setLogs([]);
    fetch(API + `/api/deployments/${deploymentId}/logs`).then((r) => r.json()).then((d) => { if (Array.isArray(d)) setLogs(d); });

    if(staticMode) return;

    const ws = new WebSocket(`ws://localhost:8000/ws/logs/${deploymentId}`);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setLogs((prev) => {
          if (prev.some((l) => l.ts === data.ts && l.msg === data.msg)) return prev;
          return [...prev, data];
        });
      } catch (err) {}
    };
    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [deploymentId, staticMode]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [logs]);

  const hasFatal = logs.some(l => l.level === 'error' || l.msg.includes('[FATAL]'));
  const isDone = logs.length > 0 && logs[logs.length-1].msg.includes('COMPLETED');

  return (
    <div ref={scrollRef} className="absolute inset-0 overflow-auto p-4 font-mono text-[10px] bg-[#000] leading-relaxed">
      {logs.map((l: any, i: number) => (
        <div key={i} className="mb-0.5 flex gap-2 hover:bg-[#111]">
          <span className="text-green-800 shrink-0 w-20">[{l.ts ? l.ts.split(' ')[0] : '--:--:--'}]</span>
          <span className={`font-bold shrink-0 w-16 ${l.level === 'error' ? 'text-red-500' : l.level === 'warn' ? 'text-yellow-500' : l.level === 'success' ? 'text-emerald-500' : l.level === 'debug' ? 'text-purple-500' : 'text-blue-500'}`}>[{(l.level || 'info').toUpperCase()}]</span>
          <span className={`${l.level === 'debug' ? 'text-[#666]' : l.level==='error'?'text-red-400 font-bold':'text-green-400'} break-all`}>{l.msg || ''}</span>
        </div>
      ))}
      {!staticMode && !hasFatal && !isDone && <div className="mt-2 text-green-700 animate-pulse">_</div>}
      {(hasFatal || (staticMode && logs.some(l => l.level === 'error'))) && <div className="mt-4 text-red-500 font-bold animate-pulse tracking-widest">[SYSTEM_HALTED] _</div>}
    </div>
  );
}