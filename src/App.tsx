import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Server, LayoutDashboard, Play, FileText, Lock, User, LogOut, ChevronDown, ChevronRight, Activity, Trash2, Square, Upload } from 'lucide-react';

export default function SplunkCCM() {
  const [auth, setAuth] = useState<{username: string, role: string} | null>(null);
  const [activeRoute, setActiveRoute] = useState('dashboard');

  if (!auth) return <AuthScreen setAuth={setAuth} />;

  return (
    <div className="min-h-screen bg-[#000000] text-[#a0a0a0] font-mono text-[11px] flex flex-col selection:bg-blue-900 selection:text-white overflow-hidden">
      <header className="h-10 border-b border-[#222] flex items-center justify-between px-4 bg-[#0a0a0a]">
        <div className="flex items-center space-x-6">
          <span className="text-white font-bold tracking-widest uppercase">CCM // SYS-CTRL</span>
          <nav className="flex space-x-4">
            <button onClick={()=>setActiveRoute('dashboard')} className={`uppercase hover:text-white ${activeRoute==='dashboard'?'text-white border-b border-blue-500':'text-[#666]'}`}>Overview / ConfigMaps</button>
            <button onClick={()=>setActiveRoute('wizard')} className={`uppercase hover:text-white ${activeRoute==='wizard'?'text-white border-b border-blue-500':'text-[#666]'}`}>Deployment Orchestrator</button>
          </nav>
        </div>
        <div className="flex items-center space-x-4 uppercase tracking-widest text-[#666]">
          {auth.role === 'admin' && <span className="bg-red-900/50 text-red-500 px-2 border border-red-900">ROOT_ACCESS</span>}
          <span>USER:{auth.username}</span>
          <button onClick={() => setAuth(null)} className="hover:text-red-400 border border-[#222] px-2">LOGOUT</button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <div className="h-full w-full" style={{ display: activeRoute === 'dashboard' ? 'block' : 'none' }}>
          <Dashboard auth={auth} />
        </div>
        <div className="h-full w-full" style={{ display: activeRoute === 'wizard' ? 'block' : 'none' }}>
          <OrchestratorWizard auth={auth} />
        </div>
      </main>
    </div>
  );
}

function AuthScreen({ setAuth }: any) {
  const [isLogin, setIsLogin] = useState(true);
  const[username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const[error, setError] = useState('');

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setError('');
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(`http://localhost:8000${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (res.ok) {
        if (isLogin) setAuth(data);
        else { alert("Account Created! Please Sign In."); setIsLogin(true); }
      } else setError(data.detail || "Authentication Failed.");
    } catch(err) { setError("Network error connecting to backend."); }
  };

  return (
    <div className="min-h-screen bg-[#000] flex items-center justify-center font-mono text-[11px]">
      <div className="border border-[#333] bg-[#0a0a0a] p-6 w-[400px]">
        <div className="flex justify-between border-b border-[#333] pb-2 mb-6">
          <span className="text-white font-bold uppercase tracking-widest">SECURE_AUTH // CCM</span>
          <div className="flex space-x-2">
            <button type="button" onClick={()=>setIsLogin(true)} className={`${isLogin?'text-blue-500':'text-[#666] hover:text-white'}`}>SIGN_IN</button>
            <button type="button" onClick={()=>setIsLogin(false)} className={`${!isLogin?'text-blue-500':'text-[#666] hover:text-white'}`}>REGISTER</button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-red-500 border border-red-900 bg-red-900/20 p-2">{error}</div>}
          <div><label className="block text-[#666] uppercase mb-1">USER_ID [root=admin]</label><input required type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500"/></div>
          <div><label className="block text-[#666] uppercase mb-1">PASSWORD_HASH</label><input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="********" className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500"/></div>
          <button type="submit" className="w-full bg-[#111] hover:bg-[#222] text-white border border-[#333] py-2 uppercase tracking-widest mt-4">
            {isLogin ? 'EXECUTE_LOGIN' : 'CREATE_ACCOUNT'}
          </button>
        </form>
      </div>
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

function Dashboard({ auth }: any) {
  const[deployments, setDeployments] = useState<any[]>([]);
  const[expanded, setExpanded] = useState<string | null>(null);

  const fetchDeps = () => {
    fetch('http://localhost:8000/api/deployments', { headers: { 'X-User-Name': auth.username, 'X-User-Role': auth.role } })
    .then(res => res.json()).then(data => setDeployments(data?.data ||[]));
  };
  useEffect(() => { fetchDeps(); },[]);

  const handleAction = async (action: string, depId: string, instId?: string) => {
    if(!confirm(`EXECUTE SYSCALL: ${action}?`)) return;
    if (action === 'delete_dep') await fetch(`http://localhost:8000/api/deployments/${depId}`, { method: 'DELETE' });
    else await fetch(`http://localhost:8000/api/deployments/${depId}/instances/${instId}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({desired_state: action}) });
    fetchDeps();
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-4 text-[#666] uppercase tracking-widest border-b border-[#222] pb-2 flex justify-between">
        <span>INFRASTRUCTURE_STATE_TABLE</span>
        <button onClick={fetchDeps} className="hover:text-white">[ REFRESH_POLL ]</button>
      </div>
      <div className="flex-1 overflow-auto border border-[#222] bg-[#0a0a0a]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#111] text-[#666] uppercase">
            <tr><th className="p-2 border-b border-[#222]">Workload_ID</th><th className="p-2 border-b border-[#222]">Type</th><th className="p-2 border-b border-[#222]">Nodes</th><th className="p-2 border-b border-[#222]">TTL_Expiry</th><th className="p-2 border-b border-[#222]">State</th>{auth.role==='admin' && <th className="p-2 border-b border-[#222] text-right">Root_OPs</th>}</tr>
          </thead>
          <tbody>
            {deployments.map((dep, i) => (
              <React.Fragment key={i}>
                <tr className="hover:bg-[#111] cursor-pointer border-b border-[#222]" onClick={() => setExpanded(expanded === dep.deployment_id ? null : dep.deployment_id)}>
                  <td className="p-2 text-white font-bold">{expanded===dep.deployment_id? '[-]': '[+]'} {dep.name}</td>
                  <td className="p-2 text-blue-400">{dep.resource_type?.[0]}</td>
                  <td className="p-2">{dep.num_instances}</td>
                  <td className="p-2 text-[#666]">{dep.ttl ? new Date(dep.ttl).toLocaleDateString() : 'N/A'}</td>
                  <td className="p-2 text-green-500">{dep.req_state}</td>
                  {auth.role==='admin' && <td className="p-2 text-right"><button onClick={(e) => {e.stopPropagation(); handleAction('delete_dep', dep.deployment_id);}} className="text-red-500 hover:bg-red-900/30 px-2 border border-red-900">SIGKILL</button></td>}
                </tr>
                {expanded === dep.deployment_id && (
                  <tr className="bg-[#000] border-b border-[#222]">
                    <td colSpan={6} className="p-4">
                      <div className="flex space-x-4">
                        <div className="flex-1 border border-[#333] p-2">
                          <div className="text-[#666] uppercase mb-2">Network_Topology</div>
                          {dep.instances_data?.map((inst:any, j:number) => (
                            <div key={j} className="flex justify-between items-center mb-1 p-1 hover:bg-[#111]">
                              <div><span className="text-white">{getCleanRoleName(inst, j, dep.instances_data.length)}</span> <span className="text-[#666] ml-2">[{inst.ip_address || 'Pending'}]</span></div>
                              <div className="flex space-x-2 items-center">
                                <span className={inst.state==='running'?'text-green-500':'text-red-500'}>{inst.state}</span>
                                {auth.role==='admin' && (
                                  <span className="flex space-x-1 border-l border-[#333] pl-2">
                                    <button onClick={()=>handleAction('running', dep.deployment_id, inst.instance_id)} className="hover:text-white px-1">START</button>
                                    <button onClick={()=>handleAction('stopped', dep.deployment_id, inst.instance_id)} className="hover:text-white px-1">STOP</button>
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex-1 border border-[#333] p-2 bg-[#050505]">
                           <div className="text-[#666] uppercase mb-2">Injected_ConfigMaps</div>
                           <div className="grid grid-cols-2 gap-2">
                             <div><div className="text-blue-500 mb-1">props.conf</div><pre className="text-[#888] overflow-auto h-24">{dep.props || '(Empty)'}</pre></div>
                             <div><div className="text-green-500 mb-1">transforms.conf</div><pre className="text-[#888] overflow-auto h-24">{dep.transforms || '(Empty)'}</pre></div>
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
      </div>
    </div>
  );
}

function OrchestratorWizard({ auth }: any) {
  const [step, setStep] = useState(1);
  const [deployId, setDeployId] = useState('');

  const[meta, setMeta] = useState<any>({ keys: [], os: [], instance_types:[], disk:[] });
  useEffect(() => { fetch('http://localhost:8000/api/meta').then(r=>r.json()).then(d=>setMeta(d)); },[]);

  const today = new Date();
  const minDateStr = today.toISOString().split('T')[0];
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 30);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const[config, setConfig] = useState(() => {
    const saved = localStorage.getItem('ccm_wizard_cache');
    if (saved) return JSON.parse(saved);
    return {
      name: '', os: 'ubuntu_22.04', instance_type: 't3a.medium', disk_storage: '50', timezone: 'Asia/Calcutta', ssh_key: '', splunk_version: '10.2.0', ttl: maxDateStr,
      mode: 'standalone', rf: 3, sf: 2, pass4SymmKey: 'secret_hash_key',
      custom_app_name: 'ccm_custom_configs', propsConf: '', transformsConf: '', pem_key_content: ''
    };
  });

  useEffect(() => { localStorage.setItem('ccm_wizard_cache', JSON.stringify(config)); }, [config]);

  const isFormValid = config.name && config.ssh_key && config.pem_key_content && config.ttl && config.os;

  const handleFileUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setConfig({...config, pem_key_content: evt.target?.result as string});
    };
    reader.readAsText(file);
  };

  const handleDeploy = async () => {
    const res = await fetch('http://localhost:8000/api/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Name': auth.username }, body: JSON.stringify(config) });
    const data = await res.json();
    setDeployId(data.deployment_id);
    setStep(3);
  };

  const totalNodes = config.mode === 'cluster' ? config.rf + 1 : 1;
  const recommendedRam = config.mode === 'cluster' ? (config.rf > 3 ? '16GB/Node' : '8GB/Node') : '4GB';
  const recStorage = parseInt(config.disk_storage) * totalNodes;

  if (step === 3) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="mb-4 text-green-500 uppercase tracking-widest flex items-center border-b border-[#222] pb-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-ping mr-2"></div>
          ORCHESTRATION_ENGINE_RUNNING
        </div>
        <div className="flex-1 border border-[#222] bg-[#050505] relative overflow-hidden flex flex-col">
          <LiveTerminal deploymentId={deployId} />
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => { setDeployId(''); setStep(1); }} className="px-4 py-2 border border-[#333] text-[#666] hover:text-white uppercase tracking-widest">CLOSE_TERMINAL</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4 text-[#666] uppercase tracking-widest border-b border-[#222] pb-2 flex justify-between">
        <span>WORKLOAD_CONFIGURATION_MATRIX</span>
        <span>{step}/2</span>
      </div>

      <div className="flex-1 flex space-x-4">
        <div className="w-2/3 border border-[#222] bg-[#0a0a0a] p-4 flex flex-col overflow-y-auto">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[#666] uppercase mb-1">WORKLOAD_ID *</label><input required type="text" value={config.name} onChange={e=>setConfig({...config, name: e.target.value})} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500"/></div>
                <div><label className="block text-[#666] uppercase mb-1">TARGET_OS</label><select value={config.os} onChange={e=>setConfig({...config, os: e.target.value})} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500">{meta.os.map((o:string)=><option key={o} value={o}>{o}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[#666] uppercase mb-1">INSTANCE_FLAVOR</label><select value={config.instance_type} onChange={e=>setConfig({...config, instance_type: e.target.value})} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500">{meta.instance_types.map((t:string)=><option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="block text-[#666] uppercase mb-1">SPLUNK_VERSION</label><select value={config.splunk_version} onChange={e=>setConfig({...config, splunk_version: e.target.value})} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500"><option value="10.2.0">10.2.0-LTS</option><option value="9.4.0">9.4.0</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#666] uppercase mb-1">SSH_KEY_PAIR (AWS) *</label>
                  <select required value={config.ssh_key} onChange={e=>setConfig({...config, ssh_key: e.target.value})} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500"><option value="">-- SELECT KEY --</option>{meta.keys.map((k:string)=><option key={k} value={k}>{k}</option>)}</select>
                </div>
                <div><label className="block text-[#666] uppercase mb-1">EXPIRY_TTL *</label><input required type="date" min={minDateStr} max={maxDateStr} value={config.ttl} onChange={e=>setConfig({...config, ttl: e.target.value})} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none cursor-pointer focus:border-blue-500 [color-scheme:dark]"/></div>
              </div>

              {/* NEW PEM UPLOAD FIELD */}
              <div className="border border-blue-900/50 bg-blue-900/10 p-3 mt-4">
                <label className="block text-blue-400 font-bold uppercase mb-2 flex items-center"><Upload size={14} className="mr-2"/> UPLOAD PRIVATE KEY (.pem) *</label>
                <input type="file" accept=".pem" onChange={handleFileUpload} className="text-white"/>
                {config.pem_key_content && <div className="text-green-500 mt-2 text-[10px]">✅ Key loaded into secure memory buffer.</div>}
              </div>

              <div className="border-t border-[#222] pt-4 mt-4">
                <div className="text-[#666] uppercase mb-2">TOPOLOGY_SELECT</div>
                <div className="flex space-x-2 mb-4">
                  <button onClick={()=>setConfig({...config, mode: 'standalone'})} className={`flex-1 py-2 border ${config.mode==='standalone'?'bg-[#111] border-blue-500 text-white':'border-[#333] text-[#666]'}`}>STANDALONE_NODE</button>
                  <button onClick={()=>setConfig({...config, mode: 'cluster'})} className={`flex-1 py-2 border ${config.mode==='cluster'?'bg-[#111] border-blue-500 text-white':'border-[#333] text-[#666]'}`}>DISTRIBUTED_CLUSTER</button>
                </div>
                {config.mode === 'cluster' && (
                  <div className="bg-[#111] p-2 border border-[#333]">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[#666] uppercase mb-1">REPLICATION_FACTOR</label>
                        <select value={config.rf} onChange={e => { const newRf = parseInt(e.target.value); setConfig({...config, rf: newRf, sf: Math.min(config.sf, newRf)}); }} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500">
                          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} Copies</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[#666] uppercase mb-1">SEARCH_FACTOR</label>
                        <select value={config.sf} onChange={e=>setConfig({...config, sf: parseInt(e.target.value)})} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500">
                          {Array.from({length: config.rf}, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} Searchable Copies</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-auto flex justify-end"><button onClick={()=>setStep(2)} disabled={!isFormValid} className={`px-4 py-2 border uppercase tracking-widest ${isFormValid ? 'border-blue-500 text-white hover:bg-[#111]':'border-[#333] text-[#444] cursor-not-allowed'}`}>COMPILE_PAYLOAD -{">"}</button></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 flex flex-col h-full">
              <div className="text-[#666] uppercase mb-2 border-b border-[#222] pb-1">INJECT_CONFIGMAPS (OPTIONAL)</div>

              <div><label className="block text-[#666] uppercase mb-1">APP_DIRECTORY_NAME</label><input type="text" value={config.custom_app_name} onChange={e=>setConfig({...config, custom_app_name: e.target.value})} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500"/></div>

              {config.mode === 'cluster' && (
                <div><label className="block text-[#666] uppercase mb-1">PASS4SYMMKEY_SECRET</label><input type="text" value={config.pass4SymmKey} onChange={e=>setConfig({...config, pass4SymmKey: e.target.value})} className="w-full bg-[#000] border border-[#333] px-2 py-1 text-white outline-none focus:border-blue-500"/></div>
              )}

              <div className="flex-1 flex space-x-2">
                <div className="flex-1 flex flex-col"><label className="block text-[#666] uppercase mb-1">props.conf</label><textarea value={config.propsConf} onChange={e=>setConfig({...config, propsConf: e.target.value})} className="flex-1 bg-[#000] border border-[#333] p-2 text-blue-400 outline-none resize-none focus:border-blue-500"/></div>
                <div className="flex-1 flex flex-col"><label className="block text-[#666] uppercase mb-1">transforms.conf</label><textarea value={config.transformsConf} onChange={e=>setConfig({...config, transformsConf: e.target.value})} className="flex-1 bg-[#000] border border-[#333] p-2 text-green-400 outline-none resize-none focus:border-blue-500"/></div>
              </div>
              <div className="flex justify-between mt-4">
                <button onClick={()=>setStep(1)} className="px-4 py-2 border border-[#333] text-[#666] hover:text-white uppercase tracking-widest">{"<"}- ABORT</button>
                <button onClick={handleDeploy} className="px-4 py-2 border border-green-500 text-green-500 hover:bg-green-900/30 uppercase tracking-widest">EXECUTE_WORKFLOW</button>
              </div>
            </div>
          )}
        </div>

        <div className="w-1/3 border border-[#222] bg-[#050505] p-4 flex flex-col">
          <div className="text-[#666] uppercase mb-4 border-b border-[#222] pb-1">RECOMMENDATION_ENGINE</div>
          <div className="space-y-3 text-white flex-1">
            <div className="flex justify-between border-b border-[#222] pb-1"><span>TOTAL_NODES:</span> <span className="font-bold text-blue-400">{totalNodes}</span></div>
            <div className="flex justify-between border-b border-[#222] pb-1"><span>EST_STORAGE_REQ:</span> <span className="font-bold text-blue-400">{recStorage} GB</span></div>
            <div className="flex justify-between border-b border-[#222] pb-1"><span>REC_RAM_PER_NODE:</span> <span className="font-bold text-blue-400">{recommendedRam}</span></div>
            <div className="flex justify-between border-b border-[#222] pb-1"><span>SVA_ALGORITHM:</span> <span className="font-bold text-blue-400">{config.mode==='standalone'?'S1': config.rf > 3 ? 'ADVANCED_MANUAL' : 'C3_INBUILT'}</span></div>
          </div>

          <div className="mt-8 text-[#555] border-t border-[#222] pt-4 leading-relaxed">[SYS_RULES]<br/>
            - The PEM key is loaded in memory for the duration of the deployment via Paramiko framework. It is NEVER written to local disk.
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveTerminal({ deploymentId }: { deploymentId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!deploymentId) return;
    const ws = new WebSocket(`ws://localhost:8000/ws/logs/${deploymentId}`);
    ws.onmessage = (e) => setLogs(prev =>[...prev, JSON.parse(e.data)]);
    return () => ws.close();
  }, [deploymentId]);

  useEffect(() => { if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [logs]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 leading-relaxed">
      {logs.map((log, i) => (
        <div key={i} className="mb-0.5 flex hover:bg-[#111]">
          <span className="text-[#444] w-24 shrink-0">[{log.ts.split(' ')[1]}]</span>
          <span className={`font-bold w-20 shrink-0 ${log.level === 'info' ? 'text-blue-500' : log.level === 'warn' ? 'text-yellow-500' : log.level === 'debug' ? 'text-purple-500' : log.level === 'error' ? 'text-red-500' : 'text-green-500'}`}>[{log.level.toUpperCase()}]</span>
          <span className={`break-all ${log.level === 'debug' ? 'text-[#888]' : 'text-[#ddd]'}`}>{log.msg}</span>
        </div>
      ))}
      <div className="mt-4 text-[#444] animate-pulse">_</div>
    </div>
  );
}