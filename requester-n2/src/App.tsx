/* src/App.tsx */
import { useState, useRef } from 'react';
import { 
  Play, Settings, Plus, Trash2, Activity, CheckCircle2, 
  AlertCircle, Clock, Save, RotateCcw, Terminal, ArrowRight
} from 'lucide-react';

// --- DEFINIÇÕES E TIPOS (Mantidos iguais) ---
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
interface Header { key: string; value: string; }
interface Config {
  method: Method; url: string; headers: Header[]; body: string;
  retryEnabled: boolean; maxRetries: number; loggingEnabled: boolean;
  timeout: number; delay: number;
}
type RuntimeState = 'IDLE' | 'PREPARING' | 'FIRING' | 'WAITING' | 'SUCCESS' | 'FAILURE' | 'RETRYING' | 'FINISHED';
interface LogEntry { timestamp: string; message: string; type: 'info' | 'success' | 'error' | 'warning' | 'system'; }

const METHODS: Method[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const INITIAL_CONFIG: Config = {
  method: 'GET', url: '', headers: [], body: '',
  retryEnabled: false, maxRetries: 3, loggingEnabled: true, timeout: 30, delay: 0,
};

export default function App() {
  // --- STATE (Mantido igual) ---
  const [step, setStep] = useState<number>(1);
  const [data, setData] = useState<Config>(INITIAL_CONFIG);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>('IDLE');
  const [simulationMode, setSimulationMode] = useState<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRetryRef = useRef<number>(0);

  // --- HANDLERS (Mantidos iguais) ---
  const updateField = <K extends keyof Config>(field: K, value: Config[K]) => {
    setData(prev => ({ ...prev, [field]: value }));
  };
  const addHeader = () => {
    setData(prev => ({ ...prev, headers: [...prev.headers, { key: '', value: '' }] }));
  };
  const updateHeader = (index: number, field: keyof Header, value: string) => {
    const newHeaders = [...data.headers];
    newHeaders[index][field] = value;
    setData(prev => ({ ...prev, headers: newHeaders }));
  };
  const removeHeader = (index: number) => {
    setData(prev => ({ ...prev, headers: prev.headers.filter((_, i) => i !== index) }));
  };

  // --- LOGIC (Mantida igual) ---
  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
    const logContainer = document.getElementById('log-container');
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
  };

  const startExecution = async () => {
    setStep(4);
    setLogs([]);
    setRuntimeState('PREPARING');
    currentRetryRef.current = 0;
    addLog('--- INICIANDO SISTEMA ---', 'system');
    addLog(`Alocando Job para: ${data.method} ${data.url}`, 'system');
    if (data.delay > 0) {
      addLog(`Aplicando Delay inicial de ${data.delay}s...`, 'warning');
      await new Promise(r => setTimeout(r, data.delay * 1000));
    }
    executeRequestCycle();
  };

  const executeRequestCycle = async () => {
    setRuntimeState('FIRING');
    addLog(`Tentativa ${currentRetryRef.current + 1} de ${data.retryEnabled ? data.maxRetries + 1 : 1}`, 'info');
    addLog('Montando pacote HTTP...', 'info');
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), data.timeout * 1000);
    setRuntimeState('WAITING');
    addLog('Aguardando resposta do servidor...', 'warning');

    try {
      let responseStatus, responseData;
      if (simulationMode) {
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            const randomSuccess = Math.random() > 0.5;
            if (randomSuccess) resolve({ status: 200 });
            else reject(new Error('Network Error (Simulated)'));
          }, 1500);
        });
        responseStatus = 200;
        responseData = { success: true, message: 'Dados simulados recebidos' };
      } else {
        const headersObj = data.headers.reduce<Record<string, string>>((acc, curr) => {
          if (curr.key) acc[curr.key] = curr.value;
          return acc;
        }, {});
        const options: RequestInit = { method: data.method, headers: headersObj, signal: controller.signal };
        if (['POST', 'PUT', 'PATCH'].includes(data.method) && data.body) options.body = data.body;
        
        const res = await fetch(data.url, options);
        responseStatus = res.status;
        try { responseData = await res.json(); } catch { responseData = await res.text(); }
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      }
      clearTimeout(timeoutId);
      handleSuccess(responseStatus, responseData);
    } catch (error: any) {
      clearTimeout(timeoutId);
      handleFailure(error);
    }
  };

  const handleSuccess = (status: number, body: unknown) => {
    setRuntimeState('SUCCESS');
    addLog(`Sucesso! Status: ${status}`, 'success');
    if (data.loggingEnabled) {
      addLog('Gravando resposta no storage...', 'system');
      addLog(`Payload salvo: ${JSON.stringify(body).substring(0, 50)}...`, 'system');
    }
    setRuntimeState('FINISHED');
    addLog('--- EXECUÇÃO FINALIZADA COM SUCESSO ---', 'success');
  };

  const handleFailure = async (error: unknown) => {
    const err = error as { name?: string; message?: string };
    const isTimeout = err.name === 'AbortError';
    const errorMsg = isTimeout ? `Timeout excedido (${data.timeout}s)` : err.message ?? String(error);
    addLog(`Falha na requisição: ${errorMsg}`, 'error');

    if (data.retryEnabled && currentRetryRef.current < data.maxRetries) {
      currentRetryRef.current += 1;
      setRuntimeState('RETRYING');
      addLog(`Política de Retry ativa. Aguardando ${data.delay}s...`, 'warning');
      await new Promise(r => setTimeout(r, data.delay * 1000));
      executeRequestCycle();
    } else {
      setRuntimeState('FAILURE');
      addLog('Erro Fatal registrado.', 'error');
      setRuntimeState('FINISHED');
      addLog('--- EXECUÇÃO FINALIZADA COM ERRO ---', 'error');
    }
  };

  const resetSystem = () => {
    setStep(1); setRuntimeState('IDLE'); setLogs([]); currentRetryRef.current = 0;
  };

  // --- RENDERIZADORES ---

  const StepIndicator = () => (
    <div className="steps-container">
      <div className="progress-line">
        <div className="progress-line-fill" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>
      </div>
      {[
        { n: 1, label: 'Definição' }, { n: 2, label: 'Headers' },
        { n: 3, label: 'Config' }, { n: 4, label: 'Execução' }
      ].map((s) => (
        <div key={s.n} className={`step-item ${step === s.n ? 'active' : ''} ${step > s.n ? 'completed' : ''}`}>
          <div className="step-circle">
            {step > s.n ? <CheckCircle2 size={18} /> : s.n}
          </div>
          <span className="step-label">{s.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="app-wrapper">
      <header className="header">
        <h1><Activity size={32} color="#2563eb" /> Controlador de Requisições</h1>
        <p>Automação e orquestração de chamadas HTTP baseada em FSM</p>
      </header>

      <div className="card">
        <div className="card-content">
          <StepIndicator />

          {/* STEP 1: DEFINIÇÃO */}
          {step === 1 && (
            <div>
              <h2 className="section-title">Ciclo Base: Definição da Requisição</h2>
              <div className="form-row">
                <div className="form-group col-1">
                  <label>Método</label>
                  <select value={data.method} onChange={(e) => updateField('method', e.target.value as any)}>
                    {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group col-3">
                  <label>URL Alvo</label>
                  <input type="url" placeholder="https://api.exemplo.com/v1/..." value={data.url} onChange={(e) => updateField('url', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Body (JSON/Texto)</label>
                <textarea 
                  rows={6} 
                  disabled={data.method === 'GET' || data.method === 'DELETE'}
                  placeholder={data.method === 'GET' ? 'Body não disponível para GET' : '{"key": "value"}'}
                  value={data.body} onChange={(e) => updateField('body', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 2: HEADERS */}
          {step === 2 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 className="section-title" style={{ marginBottom: 0, border: 'none' }}>Ciclo Cadastro: Headers</h2>
                <button onClick={addHeader} className="btn btn-secondary text-sm">
                  <Plus size={16} /> Adicionar
                </button>
              </div>
              
              {data.headers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                  <p style={{ color: '#94a3b8' }}>Nenhum header definido.</p>
                </div>
              ) : (
                <div>
                  {data.headers.map((header, idx) => (
                    <div key={idx} className="header-row">
                      <input placeholder="Key" value={header.key} onChange={(e) => updateHeader(idx, 'key', e.target.value)} />
                      <input placeholder="Value" value={header.value} onChange={(e) => updateHeader(idx, 'value', e.target.value)} />
                      <button onClick={() => removeHeader(idx)} className="btn-icon">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: CONFIG */}
          {step === 3 && (
            <div>
              <h2 className="section-title">Ciclo Configurações</h2>
              <div className="form-row" style={{ flexWrap: 'wrap' }}>
                {/* Retry */}
                <div className="form-group col-1">
                  <label>
                    <input type="checkbox" checked={data.retryEnabled} onChange={(e) => updateField('retryEnabled', e.target.checked)} style={{ width: 'auto', marginRight: '8px' }} />
                    Ativar Retry
                  </label>
                  {data.retryEnabled && (
                    <input type="number" placeholder="Max Retries" value={data.maxRetries} onChange={(e) => updateField('maxRetries', parseInt(e.target.value))} style={{ marginTop: '0.5rem' }} />
                  )}
                </div>
                {/* Timeout */}
                <div className="form-group col-1">
                  <label><Clock size={14} style={{ display: 'inline' }}/> Timeout (s)</label>
                  <input type="number" value={data.timeout} onChange={(e) => updateField('timeout', parseInt(e.target.value))} />
                </div>
                {/* Delay */}
                <div className="form-group col-1">
                  <label><Settings size={14} style={{ display: 'inline' }}/> Delay (s)</label>
                  <input type="number" value={data.delay} onChange={(e) => updateField('delay', parseInt(e.target.value))} />
                </div>
              </div>

              <div className="simulation-box">
                <div className="simulation-title">
                  <AlertCircle size={18} /> Modo de Simulação
                </div>
                <p className="simulation-text">
                  Evita erros de CORS ao simular a resposta do servidor localmente.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={simulationMode} onChange={(e) => setSimulationMode(e.target.checked)} style={{ width: 'auto' }} />
                  Ativar Simulação de Resposta
                </label>
              </div>
            </div>
          )}

          {/* STEP 4: EXECUÇÃO */}
          {step === 4 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 className="section-title" style={{ marginBottom: 0, border: 'none' }}><Terminal size={20} style={{ verticalAlign: 'middle' }}/> Console</h2>
                <span className={`status-badge ${
                  runtimeState === 'SUCCESS' ? 'status-success' : 
                  runtimeState === 'FAILURE' ? 'status-error' : 
                  runtimeState === 'IDLE' ? 'status-idle' : 'status-running'
                }`}>
                  {runtimeState}
                </span>
              </div>
              
              <div id="log-container" className="console-wrapper">
                {logs.length === 0 && <span style={{ opacity: 0.5 }}>Sistema pronto. Inicializando...</span>}
                {logs.map((log, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-time">[{log.timestamp}]</span>
                    <span className={`log-msg ${log.type}`}>
                      {log.type === 'system' && '> '}
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="actions-footer">
          {step > 1 && step < 4 ? (
            <button onClick={() => setStep(s => s - 1)} className="btn btn-secondary">Voltar</button>
          ) : <div></div>}

          {step < 3 && (
            <button disabled={!data.url} onClick={() => setStep(s => s + 1)} className="btn btn-primary">
              Próximo <ArrowRight size={18} />
            </button>
          )}

          {step === 3 && (
            <button onClick={startExecution} className="btn btn-success">
              <Play size={18} /> INICIALIZAR
            </button>
          )}

          {step === 4 && runtimeState === 'FINISHED' && (
            <button onClick={resetSystem} className="btn btn-secondary">
              <RotateCcw size={18} /> Nova Execução
            </button>
          )}
        </div>
      </div>
    </div>
  );
}