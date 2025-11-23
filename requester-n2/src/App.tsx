import { useState, useRef } from 'react';
import { 
  Play, 
  Settings, 
  Plus, 
  Trash2, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Save, 
  RotateCcw,
  Terminal,
  ArrowRight
} from 'lucide-react';

// --- DEFINIÇÕES DE DADOS E ESTADOS ---

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface Header {
  key: string;
  value: string;
}

interface Config {
  method: Method;
  url: string;
  headers: Header[];
  body: string;
  retryEnabled: boolean;
  maxRetries: number;
  loggingEnabled: boolean;
  timeout: number;
  delay: number;
}

type RuntimeState =
  | 'IDLE'
  | 'PREPARING'
  | 'FIRING'
  | 'WAITING'
  | 'SUCCESS'
  | 'FAILURE'
  | 'RETRYING'
  | 'FINISHED';

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'system';
}

const METHODS: Method[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const INITIAL_CONFIG: Config = {
  method: 'GET',
  url: '',
  headers: [],
  body: '',
  retryEnabled: false,
  maxRetries: 3,
  loggingEnabled: true,
  timeout: 30,
  delay: 0,
};

export default function App() {
  // --- STATE MANAGEMENT ---
  const [step, setStep] = useState<number>(1); // 1: Base, 2: Headers, 3: Config, 4: Runtime
  const [data, setData] = useState<Config>(INITIAL_CONFIG);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>('IDLE');
  const [simulationMode, setSimulationMode] = useState<boolean>(true); // Se true, não faz fetch real, apenas simula a FSM

  // Refs para controle do loop de execução
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRetryRef = useRef<number>(0);

  // --- HANDLERS DE INPUT ---

  const updateField = <K extends keyof Config>(field: K, value: Config[K]) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const addHeader = () => {
    setData(prev => ({
      ...prev,
      headers: [...prev.headers, { key: '', value: '' }],
    }));
  };

  const updateHeader = (index: number, field: keyof Header, value: string) => {
    const newHeaders = [...data.headers];
    newHeaders[index][field] = value;
    setData(prev => ({ ...prev, headers: newHeaders }));
  };

  const removeHeader = (index: number) => {
    setData(prev => ({
      ...prev,
      headers: prev.headers.filter((_, i) => i !== index),
    }));
  };

  // --- LOGGING SYSTEM ---

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);

    // Auto-scroll logic
    const logContainer = document.getElementById('log-container') as HTMLElement | null;
    if (logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  };

  // --- ENGINE / RUNTIME (A MÁQUINA DE ESTADOS) ---

  const startExecution = async (): Promise<void> => {
    setStep(4);
    setLogs([]);
    setRuntimeState('PREPARING');
    currentRetryRef.current = 0;
    
    addLog('--- INICIANDO SISTEMA ---', 'system');
    addLog('Carregando variáveis de ambiente...', 'system');
    addLog(`Alocando Job para: ${data.method} ${data.url}`, 'system');

    // Estado: PREPARANDO
    if (data.delay > 0) {
      addLog(`Aplicando Delay inicial de ${data.delay}s...`, 'warning');
      await new Promise(r => setTimeout(r, data.delay * 1000));
    }

    executeRequestCycle();
  };

  const executeRequestCycle = async (): Promise<void> => {
    setRuntimeState('FIRING');
    addLog(`Tentativa ${currentRetryRef.current + 1} de ${data.retryEnabled ? data.maxRetries + 1 : 1}`, 'info');
    
    // Estado: DISPARANDO
    addLog('Montando pacote HTTP...', 'info');
    
  const controller = new AbortController();
  abortControllerRef.current = controller;
  const timeoutId = setTimeout(() => controller.abort(), data.timeout * 1000);

    setRuntimeState('WAITING');
    addLog('Aguardando resposta do servidor...', 'warning');

    try {
      let responseStatus;
      let responseData;

      if (simulationMode) {
        // SIMULAÇÃO DA REQUISIÇÃO
        await new Promise<{ status: number; json: () => any }>((resolve, reject) => {
          setTimeout(() => {
            // Simula falha aleatória (50% de chance) para testar retry
            const randomSuccess = Math.random() > 0.5;
            if (randomSuccess) resolve({ status: 200, json: () => ({ success: true, mocked: true }) });
            else reject(new Error('Network Error (Simulated)'));
          }, 1500);
        });
        responseStatus = 200;
        responseData = { success: true, message: 'Dados simulados recebidos' };
      } else {
        // REQUISIÇÃO REAL
        const headersObj = data.headers.reduce<Record<string, string>>((acc, curr) => {
          if (curr.key) acc[curr.key] = curr.value;
          return acc;
        }, {});

        const options: RequestInit = {
          method: data.method,
          headers: headersObj,
          signal: controller.signal,
        };

        if (['POST', 'PUT', 'PATCH'].includes(data.method) && data.body) {
          options.body = data.body;
        }

  const res = await fetch(data.url, options);
        responseStatus = res.status;
        
        // Tenta parsear JSON, senão pega texto
        try {
          responseData = await res.json();
        } catch {
          responseData = await res.text();
        }

        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      }

  // Estado: PROCESSAR SUCESSO
      clearTimeout(timeoutId);
      handleSuccess(responseStatus, responseData);

    } catch (error: any) {
      clearTimeout(timeoutId);
      // Estado: ANALISAR FALHA
      handleFailure(error);
    }
  };

  const handleSuccess = (status: number, body: unknown): void => {
    setRuntimeState('SUCCESS');
    addLog(`Sucesso! Status: ${status}`, 'success');

    if (data.loggingEnabled) {
      addLog('Gravando resposta no storage...', 'system');
      addLog(`Payload salvo: ${JSON.stringify(body).substring(0, 50)}...`, 'system');
    }

    setRuntimeState('FINISHED');
    addLog('--- EXECUÇÃO FINALIZADA COM SUCESSO ---', 'success');
  };

  const handleFailure = async (error: unknown): Promise<void> => {
    const err = error as { name?: string; message?: string };
    const isTimeout = err.name === 'AbortError';
    const errorMsg = isTimeout ? `Timeout excedido (${data.timeout}s)` : err.message ?? String(error);

    addLog(`Falha na requisição: ${errorMsg}`, 'error');

    if (data.retryEnabled && currentRetryRef.current < data.maxRetries) {
      currentRetryRef.current += 1;
      setRuntimeState('RETRYING');
      addLog(`Política de Retry ativa. Aguardando ${data.delay}s para próxima tentativa...`, 'warning');

      await new Promise(r => setTimeout(r, data.delay * 1000));
      executeRequestCycle();
    } else {
      setRuntimeState('FAILURE');
      addLog('Número máximo de tentativas excedido ou retry desativado.', 'error');
      addLog('Erro Fatal registrado.', 'error');
      setRuntimeState('FINISHED');
      addLog('--- EXECUÇÃO FINALIZADA COM ERRO ---', 'error');
    }
  };

  const resetSystem = () => {
    setStep(1);
    setRuntimeState('IDLE');
    setLogs([]);
    currentRetryRef.current = 0;
  };

  // --- RENDER COMPONENTS ---

  const StepIndicator = () => (
    <div className="flex items-center justify-between mb-8 px-4">
      {[
        { n: 1, label: 'Definição' },
        { n: 2, label: 'Headers' },
        { n: 3, label: 'Config' },
        { n: 4, label: 'Execução' }
      ].map((s) => (
        <div key={s.n} className={`flex flex-col items-center relative z-10 ${step >= s.n ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2 transition-all duration-300 ${
            step === s.n ? 'bg-blue-600 text-white shadow-lg scale-110' : 
            step > s.n ? 'bg-green-500 text-white' : 'bg-gray-200'
          }`}>
            {step > s.n ? <CheckCircle2 size={16} /> : s.n}
          </div>
          <span className="text-xs font-medium uppercase tracking-wider">{s.label}</span>
        </div>
      ))}
      <div className="absolute top-8 left-0 w-full h-1 bg-gray-200 -z-0 transform -translate-y-1/2 mx-8 w-[calc(100%-4rem)]" />
      <div 
        className="absolute top-8 left-0 h-1 bg-blue-500 -z-0 transform -translate-y-1/2 mx-8 transition-all duration-500" 
        style={{ width: `calc(${(step - 1) / 3 * 100}% - 4rem)` }}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-200">
      <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center justify-center gap-3">
            <Activity className="text-blue-600" size={32} />
            Controlador de Requisições
          </h1>
          <p className="mt-2 text-slate-500">
            Automação e orquestração de chamadas HTTP baseada em FSM
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
          
          <div className="p-8">
            <StepIndicator />

            {/* STEP 1: DEFINIÇÃO BÁSICA */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-xl font-bold text-slate-800 border-b pb-2">Ciclo Base: Definição da Requisição</h2>
                
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Método</label>
                    <select 
                      value={data.method}
                      onChange={(e) => updateField('method', e.target.value as any)}
                      className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-slate-50 font-mono text-sm"
                    >
                      {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">URL Alvo</label>
                    <input 
                      type="url" 
                      placeholder="https://api.exemplo.com/v1/..."
                      value={data.url}
                      onChange={(e) => updateField('url', e.target.value)}
                      className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Body (JSON/Texto)</label>
                  <textarea 
                    rows={6}
                    disabled={data.method === 'GET' || data.method === 'DELETE'}
                    placeholder={data.method === 'GET' ? 'Body não disponível para GET' : '{"key": "value"}'}
                    value={data.body}
                    onChange={(e) => updateField('body', e.target.value)}
                    className="w-full rounded-lg border-slate-300 border p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono text-xs bg-slate-900 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )}

            {/* STEP 2: HEADERS */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex justify-between items-center border-b pb-2">
                  <h2 className="text-xl font-bold text-slate-800">Ciclo Cadastro: Headers</h2>
                  <button onClick={addHeader} className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
                    <Plus size={16} /> Adicionar Header
                  </button>
                </div>

                {data.headers.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <p className="text-slate-500">Nenhum header definido.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.headers.map((header, idx) => (
                      <div key={idx} className="flex gap-3 items-start">
                        <input 
                          placeholder="Key (ex: Authorization)"
                          value={header.key}
                          onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                          className="flex-1 rounded-lg border-slate-300 border p-2 text-sm font-mono"
                        />
                        <input 
                          placeholder="Value (ex: Bearer ...)"
                          value={header.value}
                          onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                          className="flex-1 rounded-lg border-slate-300 border p-2 text-sm font-mono"
                        />
                        <button 
                          onClick={() => removeHeader(idx)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: CONFIGURAÇÃO */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-xl font-bold text-slate-800 border-b pb-2">Ciclo Configurações</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Retry Policy */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="text-blue-600" size={20} />
                        <span className="font-semibold text-slate-700">Retry Policy</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={data.retryEnabled} 
                          onChange={(e) => updateField('retryEnabled', e.target.checked)}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    {data.retryEnabled && (
                      <div className="space-y-2 animate-in fade-in duration-200">
                        <label className="text-sm text-slate-600">Max Retries</label>
                        <input 
                          type="number" 
                          min="1" 
                          max="10" 
                          value={data.maxRetries}
                          onChange={(e) => updateField('maxRetries', parseInt(e.target.value))}
                          className="w-full border p-2 rounded bg-white"
                        />
                      </div>
                    )}
                  </div>

                  {/* Logging */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <Save className="text-purple-600" size={20} />
                        <span className="font-semibold text-slate-700">Gravar Logs</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={data.loggingEnabled} 
                          onChange={(e) => updateField('loggingEnabled', e.target.checked)}
                          className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                    <p className="text-xs text-slate-500">
                      Se ativo, salva payload de resposta no storage local.
                    </p>
                  </div>

                  {/* Timeout */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="text-orange-600" size={20} />
                      <span className="font-semibold text-slate-700">Timeout (s)</span>
                    </div>
                    <input 
                      type="number" 
                      min="1" 
                      value={data.timeout}
                      onChange={(e) => updateField('timeout', parseInt(e.target.value))}
                      className="w-full border p-2 rounded bg-white"
                    />
                  </div>

                  {/* Delay */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="text-slate-600" size={20} />
                      <span className="font-semibold text-slate-700">Delay (s)</span>
                    </div>
                    <input 
                      type="number" 
                      min="0" 
                      value={data.delay}
                      onChange={(e) => updateField('delay', parseInt(e.target.value))}
                      className="w-full border p-2 rounded bg-white"
                    />
                  </div>
                </div>

                <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="font-semibold text-yellow-800 text-sm">Modo de Simulação</h4>
                    <p className="text-xs text-yellow-700 mt-1">
                      Devido a restrições de CORS no navegador, requisições reais para APIs de terceiros podem falhar. 
                      Ative a simulação para testar a lógica da Máquina de Estados (Retries, Delays) sem erros de rede reais.
                    </p>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={simulationMode}
                        onChange={(e) => setSimulationMode(e.target.checked)}
                        className="rounded text-yellow-600 focus:ring-yellow-500"
                      />
                      <span className="text-sm font-medium text-yellow-900">Ativar Simulação de Resposta</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: RUNTIME / CONSOLE */}
            {step === 4 && (
              <div className="space-y-4 animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-center border-b pb-2">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Terminal size={24} /> Console de Execução
                  </h2>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    runtimeState === 'SUCCESS' || runtimeState === 'FINISHED' ? 'bg-green-100 text-green-700' :
                    runtimeState === 'FAILURE' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700 animate-pulse'
                  }`}>
                    STATUS: {runtimeState}
                  </div>
                </div>

                {/* Log View */}
                <div 
                  id="log-container"
                  className="bg-slate-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs shadow-inner"
                >
                  {logs.length === 0 && <span className="text-slate-600">Aguardando inicialização...</span>}
                  {logs.map((log, i) => (
                    <div key={i} className="mb-1.5 flex gap-3 animate-in slide-in-from-left-2 duration-100">
                      <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                      <span className={`${
                        log.type === 'error' ? 'text-red-400 font-bold' :
                        log.type === 'success' ? 'text-green-400 font-bold' :
                        log.type === 'warning' ? 'text-yellow-300' :
                        log.type === 'system' ? 'text-blue-300' :
                        'text-slate-200'
                      }`}>
                        {log.type === 'system' && '> '}
                        {log.message}
                      </span>
                    </div>
                  ))}
                  {/* Ancora de scroll */}
                  <div id="scroll-anchor"></div>
                </div>
              </div>
            )}

          </div>

          {/* Footer Navigation */}
          <div className="bg-slate-50 px-8 py-5 border-t border-slate-100 flex justify-between items-center">
            {step > 1 && step < 4 ? (
              <button 
                onClick={() => setStep(s => s - 1)}
                className="px-6 py-2.5 rounded-lg border border-slate-300 text-slate-600 font-medium hover:bg-white hover:shadow-sm transition-all"
              >
                Voltar
              </button>
            ) : <div />}

            {step < 3 && (
              <button 
                disabled={!data.url}
                onClick={() => setStep(s => s + 1)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Próximo <ArrowRight size={18} />
              </button>
            )}

            {step === 3 && (
              <button 
                onClick={startExecution}
                className="flex items-center gap-2 px-8 py-2.5 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 hover:shadow-lg hover:shadow-green-200 transform hover:-translate-y-0.5 transition-all"
              >
                <Play size={18} fill="currentColor" /> INICIALIZAR
              </button>
            )}

            {step === 4 && runtimeState === 'FINISHED' && (
              <button 
                onClick={resetSystem}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-white transition-all"
              >
                <RotateCcw size={18} /> Nova Execução
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}