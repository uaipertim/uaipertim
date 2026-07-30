import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, databaseId } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { useApp } from '../context/AppContext';
import { AutomaticCatalogGenerator } from './AutomaticCatalogGenerator';
import { catalogMigrationService, MigrationAnalysis, DryRunResult } from '../services/catalogMigrationService';
import { catalogValidationService, ValidationReport } from '../services/catalogValidationService';
import { 
  Play, 
  Settings, 
  CheckCircle, 
  AlertTriangle, 
  TrendingUp, 
  Database, 
  Terminal, 
  HelpCircle, 
  RefreshCw, 
  ArrowRight, 
  Layers, 
  Check, 
  Flame, 
  ShieldAlert,
  MapPin,
  Building2,
  Package
} from 'lucide-react';

export const CatalogMigrationPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const { showToast } = useApp();

  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [subTab, setSubTab] = useState<'migration' | 'generator'>('migration');

  // Status variables
  const [analysis, setAnalysis] = useState<MigrationAnalysis | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  
  // Custom Phase 3 migration states requested by the specifications
  const [isWriting, setIsWriting] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationProgress, setMigrationProgress] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [isConfirmedInUI, setIsConfirmedInUI] = useState(false);

  // Maintain existing compatibility states
  const [migrationExecuting, setMigrationExecuting] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);
  
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isActiveSource, setIsActiveSource] = useState(false);

  // Load saved dry run result from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('uaipertim_catalog_migration_dry_run_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        setDryRun(parsed);
      }
    } catch (e) {
      console.warn("Could not load dry run from sessionStorage:", e);
    }
  }, []);

  // Real-time source status from Firestore config
  useEffect(() => {
    if (!db) return;
    const checkSource = async () => {
      try {
        const snap = await getDoc(doc(db, 'appConfig', 'public'));
        if (snap.exists() && snap.data().catalogDataSource === 'firestore') {
          setIsActiveSource(true);
        } else {
          setIsActiveSource(false);
        }
      } catch (e) {
        console.warn("Could not read appConfig/public status:", e);
      }
    };
    checkSource();
  }, [migrationComplete]);

  // Phase 1: Analyze local data
  const handleAnalyze = () => {
    try {
      const report = catalogMigrationService.analyzeLocalData();
      setAnalysis(report);
      showToast('Análise de dados locais concluída com sucesso!', 'success');
    } catch (e: any) {
      showToast(`Erro na análise: ${e.message}`, 'error');
    }
  };

  // Phase 2: Dry Run simulation
  const handleSimulate = async () => {
    try {
      const result = await catalogMigrationService.runDryRun();
      setDryRun(result);

      // Save dry run result to sessionStorage under exclusive key
      try {
        const summary = {
          valid: result.valid,
          counts: result.counts,
          alreadyExists: result.alreadyExists,
          fatalErrors: result.fatalErrors,
          simulatedAt: new Date().toISOString(),
        };
        sessionStorage.setItem('uaipertim_catalog_migration_dry_run_v1', JSON.stringify(summary));
      } catch (e) {
        console.warn("Could not save dry run to sessionStorage:", e);
      }

      if (result.valid) {
        showToast('Simulação (Dry Run) aprovada com sucesso!', 'success');
      } else {
        showToast('Simulação detectou erros graves. Verifique o console.', 'error');
      }
    } catch (e: any) {
      showToast(`Erro na simulação: ${e.message}`, 'error');
    }
  };

  // Phase 3: Execute migration batch writes (with UI progress, rebuild, and auth checks)
  const handleWriteCatalogToFirestore = async () => {
    if (isWriting) return;

    setIsWriting(true);
    setMigrationExecuting(true);
    setMigrationError(null);
    setMigrationProgress("Preparando migração...");
    setMigrationResult(null);

    try {
      if (!currentUser) {
        throw new Error("unauthenticated");
      }

      if (
        userProfile?.role !== "admin" ||
        userProfile?.active !== true
      ) {
        throw new Error("ADMIN_REQUIRED");
      }

      // Rebuild catalog migration plan directly on click to avoid stale Phase 2 state
      const plan = catalogMigrationService.buildCatalogMigrationPlan();

      if (!plan.valid || plan.errors.length > 0) {
        throw new Error("INVALID_MIGRATION_PLAN");
      }

      const result = await catalogMigrationService.executeCatalogMigration(
        plan,
        currentUser.uid,
        currentUser.email,
        (progressMessage) => {
          setMigrationProgress(progressMessage);
        }
      );

      if (result.success) {
        setMigrationResult(result);
        setMigrationComplete(true);
        showToast('Dados gravados no Firestore com sucesso!', 'success');
        setActiveStep(4);
        handleValidate();
      } else {
        throw new Error(result.errors.join(', '));
      }
    } catch (error: any) {
      console.error("Migration error:", error);
      let friendlyMessage = error.message || 'Erro desconhecido';

      if (error.code === 'permission-denied' || friendlyMessage.includes('permission-denied') || friendlyMessage.includes('Permission denied')) {
        friendlyMessage = "permission-denied";
      } else if (friendlyMessage === 'unauthenticated' || friendlyMessage.includes('auth/')) {
        friendlyMessage = "unauthenticated";
      } else if (friendlyMessage.includes('unavailable') || friendlyMessage.includes('network-request-failed')) {
        friendlyMessage = "unavailable";
      }

      setMigrationError(friendlyMessage);
      showToast(`Erro na migração: ${friendlyMessage}`, 'error');
    } finally {
      setIsWriting(false);
      setMigrationExecuting(false);
    }
  };

  // Keep handleExecuteMigration for legacy compatibility if called anywhere else
  const handleExecuteMigration = handleWriteCatalogToFirestore;

  // Phase 4: Validate migration
  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const report = await catalogValidationService.runValidation();
      setValidationReport(report);
      if (report.isValid) {
        showToast('Validação concluída: 100% dos testes passaram!', 'success');
      } else {
        showToast('A validação falhou em alguns testes. Corrija antes de ativar.', 'error');
      }
    } catch (e: any) {
      showToast(`Erro durante validação: ${e.message}`, 'error');
    } finally {
      setIsValidating(false);
    }
  };

  // Activation: Switch catalogSource to 'firestore' in Firestore
  const handleActivateFirestore = async () => {
    if (!validationReport?.isValid) {
      showToast('Erro: Não é possível ativar antes de passar em 100% dos testes de validação.', 'error');
      return;
    }

    try {
      await setDoc(doc(db!, 'appConfig', 'public'), {
        catalogDataSource: 'firestore',
        updatedAt: serverTimestamp(),
        activatedBy: userProfile?.email || 'admin'
      }, { merge: true });
      setIsActiveSource(true);
      showToast('Firestore ativado com sucesso como fonte oficial do catálogo!', 'success');
    } catch (e: any) {
      showToast(`Erro ao salvar configuração de ativação: ${e.message}`, 'error');
    }
  };

  // Deactivation: Switch back to local source
  const handleDeactivateFirestore = async () => {
    if (!window.confirm("Atenção! Isso retornará o catálogo para ler dados locais demonstrativos. Deseja prosseguir?")) {
      return;
    }

    try {
      await setDoc(doc(db!, 'appConfig', 'public'), {
        catalogDataSource: 'local',
        updatedAt: serverTimestamp(),
        deactivatedBy: userProfile?.email || 'admin'
      }, { merge: true });
      setIsActiveSource(false);
      showToast('Retornado para o modo de catálogo local com sucesso.', 'info');
    } catch (e: any) {
      showToast(`Erro ao desativar: ${e.message}`, 'error');
    }
  };

  return (
    <div id="catalog-migration-page" className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-[#201A17] text-white p-8 rounded-3xl relative overflow-hidden shadow-xl border border-[#2D2420]">
        <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-10 flex items-center justify-center pointer-events-none">
          <Database className="w-56 h-56" />
        </div>
        <div className="space-y-3 max-w-2xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FFBE5C]/15 border border-[#FFBE5C]/30 rounded-full text-xs font-bold text-[#FFBE5C]">
            <Layers className="w-3.5 h-3.5" />
            <span>Módulo Administrativo</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight font-sans">
            Migração e Sincronização do Catálogo
          </h1>
          <p className="text-sm text-[#EADFD8] leading-relaxed">
            Configure, analise, simule e migre as tabelas de cidades, estabelecimentos e catálogos para o banco de dados oficial Cloud Firestore de forma idempotente e segura.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <span className="text-xs font-mono text-[#756B66]">Fonte ativa atualmente:</span>
            {isActiveSource ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-xs font-bold text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Cloud Firestore (Produção)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#756B66]/15 border border-[#756B66]/30 rounded-full text-xs font-bold text-[#EADFD8]">
                <span className="w-2 h-2 rounded-full bg-[#756B66]"></span>
                Dados Locais (Mock/Demonstração)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sub-Tabs Switcher */}
      <div className="flex border-b border-[#EADFD8] gap-4">
        <button
          onClick={() => setSubTab('migration')}
          className={`pb-3 text-sm font-black transition-all border-b-2 px-1 ${
            subTab === 'migration'
              ? 'border-[#E94F2F] text-[#E94F2F]'
              : 'border-transparent text-[#756B66] hover:text-[#201A17]'
          }`}
        >
          Migração e Sincronização Geral
        </button>
        <button
          onClick={() => setSubTab('generator')}
          className={`pb-3 text-sm font-black transition-all border-b-2 px-1 ${
            subTab === 'generator'
              ? 'border-[#E94F2F] text-[#E94F2F]'
              : 'border-transparent text-[#756B66] hover:text-[#201A17]'
          }`}
        >
          Gerador Automático de Catálogo
        </button>
      </div>

      {subTab === 'generator' ? (
        <AutomaticCatalogGenerator isActiveSource={isActiveSource} />
      ) : (
        <>
          {/* Migration Steps Navigation */}
          <div className="grid grid-cols-4 gap-3 bg-white p-3 rounded-2xl border border-[#EADFD8] shadow-xs">
        {[
          { step: 1, label: '1. Analisar Dados', desc: 'Estrutura local', icon: HelpCircle },
          { step: 2, label: '2. Simular (Dry Run)', desc: 'Validar relações', icon: RefreshCw },
          { step: 3, label: '3. Executar Lotes', desc: 'Idempotente', icon: Play },
          { step: 4, label: '4. Validar & Ativar', desc: '10 regras de segurança', icon: CheckCircle },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeStep === item.step;
          const isDone = activeStep > item.step || (item.step === 3 && migrationComplete) || (item.step === 4 && isActiveSource);
          return (
            <button
              key={item.step}
              onClick={() => setActiveStep(item.step as any)}
              className={`flex flex-col text-left p-4 rounded-xl transition-all ${
                isActive 
                  ? 'bg-[#201A17] text-white shadow-md'
                  : 'hover:bg-[#F7F4EF] text-[#756B66]'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className={`text-[11px] font-black uppercase tracking-wider ${isActive ? 'text-[#FFBE5C]' : 'text-[#756B66]'}`}>
                  {item.label}
                </span>
                {isDone ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#FFBE5C]' : 'text-[#756B66]/60'}`} />
                )}
              </div>
              <span className={`text-xs ${isActive ? 'text-[#EADFD8]' : 'text-[#201A17]'} font-bold`}>
                {item.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Panel Content */}
      <div className="bg-white rounded-2xl border border-[#EADFD8] shadow-xs overflow-hidden">
        
        {/* Step 1: Analyze */}
        {activeStep === 1 && (
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-[#201A17] font-sans">Análise Estática de Dados Locais</h3>
                <p className="text-xs text-[#756B66]">
                  Varre todos os dados locais em <code className="bg-[#F7F4EF] px-1 py-0.5 rounded font-mono text-xs">initialData.ts</code> para garantir a integridade dos relacionamentos, identificar chaves duplicadas ou dados obrigatórios faltantes.
                </p>
              </div>
              <button
                onClick={handleAnalyze}
                className="px-5 py-2.5 bg-[#201A17] text-white hover:bg-[#2D2420] text-xs font-black rounded-xl transition-all flex items-center gap-2 shrink-0 shadow-sm"
              >
                <RefreshCw className="w-4 h-4 animate-spin-slow" />
                <span>Analisar Dados Locais</span>
              </button>
            </div>

            {analysis ? (
              <div className="space-y-6">
                {/* Stats Dashboard */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-[#F7F4EF] rounded-xl border border-[#EADFD8] space-y-1 flex items-center gap-3">
                    <div className="p-2.5 bg-orange-100 text-[#E94F2F] rounded-lg">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Cidades Atendidas</div>
                      <div className="text-xl font-black text-[#201A17] font-mono">{analysis.citiesCount}</div>
                    </div>
                  </div>
                  <div className="p-4 bg-[#F7F4EF] rounded-xl border border-[#EADFD8] space-y-1 flex items-center gap-3">
                    <div className="p-2.5 bg-amber-100 text-[#FFBE5C] rounded-lg">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Estabelecimentos Oficiais</div>
                      <div className="text-xl font-black text-[#201A17] font-mono">{analysis.establishmentsCount}</div>
                    </div>
                  </div>
                  <div className="p-4 bg-[#F7F4EF] rounded-xl border border-[#EADFD8] space-y-1 flex items-center gap-3">
                    <div className="p-2.5 bg-red-100 text-red-500 rounded-lg">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Total de Produtos</div>
                      <div className="text-xl font-black text-[#201A17] font-mono">{analysis.productsCount}</div>
                    </div>
                  </div>
                </div>

                {/* Subsections */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-[#EADFD8] space-y-3">
                    <h4 className="text-xs font-black text-[#201A17] uppercase tracking-wider">Produtos por Estabelecimento</h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {Object.entries(analysis.productsByEstablishment).map(([estId, count]) => (
                        <div key={estId} className="flex justify-between items-center text-xs border-b border-[#F7F4EF] pb-1.5 last:border-0 last:pb-0">
                          <span className="font-bold text-[#756B66]">{estId}</span>
                          <span className="font-mono font-black text-[#201A17] bg-[#F7F4EF] px-2 py-0.5 rounded-md">{count} pratos</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-[#EADFD8] space-y-3">
                    <h4 className="text-xs font-black text-[#201A17] uppercase tracking-wider">Relatório de Integridade Relacional</h4>
                    <div className="space-y-2 text-xs">
                      {/* Duplicate ID Check */}
                      <div className="flex items-center justify-between">
                        <span className="text-[#756B66] font-bold">IDs Duplicados</span>
                        {analysis.duplicateIds.length === 0 ? (
                          <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">Nenhum</span>
                        ) : (
                          <span className="text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded">{analysis.duplicateIds.length} encontrados</span>
                        )}
                      </div>

                      {/* Missing City ID Check */}
                      <div className="flex items-center justify-between">
                        <span className="text-[#756B66] font-bold">Estabelecimentos sem cidade válida</span>
                        {analysis.missingCityIds.length === 0 ? (
                          <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">Nenhuma</span>
                        ) : (
                          <span className="text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded">{analysis.missingCityIds.length}</span>
                        )}
                      </div>

                      {/* Missing Required Fields */}
                      <div className="flex items-center justify-between">
                        <span className="text-[#756B66] font-bold">Campos vazios/ausentes</span>
                        {analysis.missingRequiredFields.length === 0 ? (
                          <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">0 campos</span>
                        ) : (
                          <span className="text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded">{analysis.missingRequiredFields.length} avisos</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Analysis Warnings Log */}
                {(analysis.missingRequiredFields.length > 0 || analysis.duplicateIds.length > 0) && (
                  <div className="bg-[#201A17] text-amber-400 p-4 rounded-xl border border-[#FFBE5C]/20 font-mono text-xs space-y-2">
                    <div className="flex items-center gap-1.5 text-white font-bold">
                      <Terminal className="w-4 h-4 text-[#FFBE5C]" />
                      <span>Console de Alertas do Analisador</span>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto text-[11px] leading-relaxed">
                      {analysis.duplicateIds.map((msg, i) => (
                        <div key={i} className="text-red-400">❌ [CRITICAL_ID] {msg}</div>
                      ))}
                      {analysis.missingRequiredFields.map((msg, i) => (
                        <div key={i}>⚠️ [WARN_SCHEMA] {msg}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2 border-t border-[#F7F4EF]">
                  <button
                    onClick={() => setActiveStep(2)}
                    className="px-4 py-2 bg-[#201A17] text-[#FFBE5C] hover:bg-[#2D2420] text-xs font-bold rounded-lg transition-all flex items-center gap-1"
                  >
                    <span>Ir para Fase 2</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-[#EADFD8] py-12 rounded-xl text-center text-xs text-[#756B66] space-y-2">
                <Database className="w-8 h-8 mx-auto text-[#756B66]/40" />
                <p>Nenhuma análise foi rodada ainda para os dados locais.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Dry Run simulation */}
        {activeStep === 2 && (
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-[#201A17] font-sans">Simulação de Migração (Dry Run)</h3>
                <p className="text-xs text-[#756B66]">
                  Gera todos os documentos formatados sob as especificações exigidas de banco de dados, sem realizar nenhuma gravação real no Firestore. Valida tipos, preços e estruturas relacionais.
                </p>
              </div>
              <button
                onClick={handleSimulate}
                className="px-5 py-2.5 bg-[#201A17] text-white hover:bg-[#2D2420] text-xs font-black rounded-xl transition-all flex items-center gap-2 shrink-0 shadow-sm"
              >
                <RefreshCw className="w-4 h-4 animate-spin-slow" />
                <span>Simular Migração (Dry Run)</span>
              </button>
            </div>

            {dryRun ? (
              <div className="space-y-6">
                {/* Result summary banner */}
                <div className={`p-4 rounded-xl border flex items-center gap-3.5 ${
                  dryRun.valid 
                    ? 'bg-emerald-50 border-emerald-500/20 text-emerald-800' 
                    : 'bg-red-50 border-red-500/20 text-red-800'
                }`}>
                  {dryRun.valid ? (
                    <CheckCircle className="w-8 h-8 text-emerald-600 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-8 h-8 text-red-600 shrink-0" />
                  )}
                  <div>
                    <h4 className="text-sm font-black font-sans uppercase">
                      {dryRun.valid ? 'Simulação Aprovada para Migração!' : 'Simulação Falhou! Erros Graves Encontrados'}
                    </h4>
                    <p className="text-xs leading-relaxed opacity-90 mt-0.5">
                      {dryRun.valid 
                        ? 'Todas as estruturas de dados de cidades, lojas e produtos estão 100% em conformidade com as especificações exigidas de produção.' 
                        : 'Foram detectadas inconsistências cruciais. É necessário revisar os alertas no terminal.'}
                    </p>
                  </div>
                </div>

                {/* Simulated Docs Info */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-[#F7F4EF] p-4 rounded-xl border border-[#EADFD8]">
                    <div className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Cidades a Gravar</div>
                    <div className="text-xl font-black text-[#201A17] font-mono mt-1">{dryRun.counts.cities}</div>
                    <span className="text-[10px] text-[#756B66]">Chave: id slug</span>
                  </div>
                  <div className="bg-[#F7F4EF] p-4 rounded-xl border border-[#EADFD8]">
                    <div className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Estabelecimentos a Gravar</div>
                    <div className="text-xl font-black text-[#201A17] font-mono mt-1">{dryRun.counts.establishments}</div>
                    <span className="text-[10px] text-[#756B66]">Endereço estruturado</span>
                  </div>
                  <div className="bg-[#F7F4EF] p-4 rounded-xl border border-[#EADFD8]">
                    <div className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Produtos a Gravar</div>
                    <div className="text-xl font-black text-[#201A17] font-mono mt-1">{dryRun.counts.products}</div>
                    <span className="text-[10px] text-[#756B66]">Opcionais mapeados</span>
                  </div>
                  <div className="bg-[#F7F4EF] p-4 rounded-xl border border-[#EADFD8]">
                    <div className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Documento de Controle</div>
                    <div className="text-sm font-bold text-[#201A17] mt-2">catalogMigrationV1</div>
                    <span className="text-[10px] text-[#756B66]">Histórico de auditoria</span>
                  </div>
                </div>

                {/* Simulation Logs */}
                <div className="bg-[#201A17] text-amber-400 p-4 rounded-xl border border-[#FFBE5C]/20 font-mono text-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-white font-bold">
                    <Terminal className="w-4 h-4 text-[#FFBE5C]" />
                    <span>Registro do Compilador Dry Run</span>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto text-[11px] leading-relaxed text-[#EADFD8]">
                    <div className="text-emerald-400">⚡ [START] Iniciando geração e teste estático dos esquemas no schema compiler...</div>
                    <div>ℹ️ [INFO] Cidades pré-mapeadas comDisplayName e sortOrder.</div>
                    <div>ℹ️ [INFO] Lojas normalizadas com endereços estruturados e mapas de pagamento completos.</div>
                    <div>ℹ️ [INFO] Produtos com tamanhos, crusts e extras normalizados de arrays de strings para arrays de objetos relacionais de catálogo.</div>
                    {dryRun.fatalErrors.length === 0 ? (
                      <div className="text-emerald-400">✔️ [SUCCESS] Nenhum erro fatal de tipo ou dependência encontrado.</div>
                    ) : (
                      dryRun.fatalErrors.map((err, i) => (
                        <div key={i} className="text-red-400 font-bold">❌ [FATAL] {err}</div>
                      ))
                    )}
                    <div className="text-emerald-400">🏁 [FINISHED] Dry Run concluído. Banco de dados de destino permanece intocado.</div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-[#F7F4EF]">
                  <button
                    onClick={() => setActiveStep(3)}
                    disabled={!dryRun.valid}
                    className="px-4 py-2 bg-[#201A17] text-[#FFBE5C] hover:bg-[#2D2420] disabled:opacity-50 text-xs font-bold rounded-lg transition-all flex items-center gap-1"
                  >
                    <span>Seguir para Fase 3 (Gravar)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-[#EADFD8] py-12 rounded-xl text-center text-xs text-[#756B66] space-y-2">
                <Database className="w-8 h-8 mx-auto text-[#756B66]/40" />
                <p>Execute a simulação Dry Run para gerar e validar as tabelas de destino.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Execute migration */}
        {activeStep === 3 && (
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-[#201A17] font-sans">Fase 3: Gravação das Tabelas no Firestore</h3>
              <p className="text-xs text-[#756B66] leading-relaxed">
                Este processo grava os documentos processados diretamente nas coleções <code className="bg-[#F7F4EF] px-1 py-0.5 rounded font-mono text-xs">cities</code>, <code className="bg-[#F7F4EF] px-1 py-0.5 rounded font-mono text-xs">establishments</code> e <code className="bg-[#F7F4EF] px-1 py-0.5 rounded font-mono text-xs">products</code> do Cloud Firestore usando transações em lote (<code className="font-mono">writeBatch</code>) para assegurar atomicidade e velocidade, além de registrar um relatório detalhado na trilha de auditoria em <code className="bg-[#F7F4EF] px-1 py-0.5 rounded font-mono text-xs">appConfig/catalogMigrationV1</code>.
              </p>
              
              <div className="text-center text-xs font-mono text-[#756B66] bg-[#F7F4EF] px-3 py-1.5 rounded-lg border border-[#EADFD8] max-w-fit mx-auto mt-2 select-all">
                Banco de dados de destino: <span className="font-black text-[#201A17]">{databaseId || 'Nenhum'}</span>
              </div>
            </div>

            <div className="p-5 bg-amber-50 rounded-xl border border-amber-500/20 flex gap-4 text-amber-800">
              <AlertTriangle className="w-12 h-12 text-amber-600 shrink-0" />
              <div className="space-y-1.5 text-xs">
                <h4 className="font-black uppercase tracking-wider font-sans">Avisos Críticos de Escrita</h4>
                <ul className="list-disc pl-4 space-y-1 opacity-90 leading-relaxed">
                  <li><strong>Garantia de Idempotência:</strong> A migração usa escritas com mesclagem (<code className="font-mono">merge: true</code>). Chaves duplicadas atualizarão os dados existentes sem criar duplicidade física.</li>
                  <li><strong>Sem Impacto Imediato:</strong> Gravar estes dados no Firestore não afetará os clientes ativos imediatamente, pois a chave geral de ativação (<code className="font-mono">catalogDataSource</code>) permanecerá em modo local até que você passe por todos os testes na Fase 4.</li>
                </ul>
              </div>
            </div>

            {migrationError && (
              <div className="p-4 bg-red-50 border border-red-500/20 rounded-xl space-y-2 text-red-800">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider font-sans">Falha na Gravação da Migração</h4>
                </div>
                <p className="text-xs">
                  {migrationError === 'permission-denied' 
                    ? 'A gravação foi bloqueada pelas regras de segurança do Firestore.'
                    : migrationError === 'unauthenticated' || migrationError === 'AUTH_REQUIRED'
                    ? 'É necessário entrar novamente como administrador.'
                    : migrationError === 'ADMIN_REQUIRED'
                    ? 'Somente um administrador ativo pode executar esta migração.'
                    : migrationError === 'INVALID_MIGRATION_PLAN'
                    ? 'A simulação encontrou dados inválidos. Volte à Fase 2 e revise os erros.'
                    : migrationError === 'unavailable'
                    ? 'Não foi possível conectar ao Firestore. Verifique sua conexão e tente novamente.'
                    : migrationError}
                </p>
                <details className="mt-2 text-[10px] font-mono text-red-700 bg-white/50 p-2 rounded border border-red-100">
                  <summary className="cursor-pointer font-bold mb-1 select-none">Ver Detalhes Técnicos (Admin)</summary>
                  <p className="whitespace-pre-wrap leading-relaxed">{migrationError}</p>
                </details>
              </div>
            )}

            <div className="flex flex-col items-center justify-center p-8 bg-[#F7F4EF] rounded-xl border border-[#EADFD8] space-y-4">
              {isWriting ? (
                <div className="text-center space-y-3">
                  <RefreshCw className="w-10 h-10 animate-spin text-[#E94F2F] mx-auto" />
                  <p className="text-xs font-black text-[#201A17] font-sans">{migrationProgress || "Executando escritas em lotes atômicos e idempotentes..."}</p>
                  <p className="text-[10px] text-[#756B66]">Transmitindo cidades, estabelecimentos e menu de opcionais no Cloud Firestore de produção</p>
                </div>
              ) : migrationComplete ? (
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                    <Check className="w-6 h-6 stroke-[3px]" />
                  </div>
                  <p className="text-xs font-black text-emerald-800 font-sans">Migração Concluída com Sucesso!</p>
                  <p className="text-[10px] text-[#756B66]">Todos os lotes de dados foram escritos. Prossiga para auditar a integridade na Fase 4.</p>
                </div>
              ) : (
                <div className="text-center space-y-4 w-full">
                  <Database className="w-12 h-12 text-[#756B66]/40 mx-auto" />
                  <div className="space-y-1 text-center">
                    <p className="text-xs font-black text-[#201A17] font-sans">Nenhuma gravação de migração ativa iniciada.</p>
                    <p className="text-[10px] text-[#756B66]">Garante que a simulação Dry Run tenha sido feita com sucesso na Fase anterior.</p>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 bg-amber-50/50 rounded-xl border border-amber-500/10 text-amber-900 max-w-md mx-auto text-left">
                    <input 
                      type="checkbox" 
                      id="confirm-migration-checkbox"
                      checked={isConfirmedInUI} 
                      onChange={(e) => setIsConfirmedInUI(e.target.checked)}
                      className="w-4 h-4 rounded border-[#EADFD8] text-[#E94F2F] focus:ring-[#E94F2F] mt-0.5 cursor-pointer shrink-0"
                    />
                    <label htmlFor="confirm-migration-checkbox" className="text-[11px] font-medium select-none cursor-pointer leading-relaxed">
                      Confirmo que revisei o plano de migração, os alertas de simulação e que desejo iniciar a gravação oficial direta no Firestore de produção.
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleWriteCatalogToFirestore}
                    disabled={isWriting || !isConfirmedInUI}
                    className="px-6 py-3 bg-[#E94F2F] hover:bg-[#D84325] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 mx-auto shadow-sm"
                  >
                    <Flame className="w-4 h-4" />
                    <span>Gravar Dados no Firestore</span>
                  </button>
                </div>
              )}
            </div>

            {migrationComplete && (
              <div className="flex justify-end pt-2 border-t border-[#F7F4EF]">
                <button
                  onClick={() => setActiveStep(4)}
                  className="px-4 py-2 bg-[#201A17] text-[#FFBE5C] hover:bg-[#2D2420] text-xs font-bold rounded-lg transition-all flex items-center gap-1"
                >
                  <span>Ir para Fase 4 (Auditar & Ativar)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Validate and Activate */}
        {activeStep === 4 && (
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-[#201A17] font-sans">Auditar Integridade e Ativar Catálogo</h3>
                <p className="text-xs text-[#756B66]">
                  Roda o mecanismo de validação de 10 passos rigorosos para confirmar a conformidade dos dados migrados no Firestore antes de realizar o chaveamento global.
                </p>
              </div>
              <button
                onClick={handleValidate}
                disabled={isValidating}
                className="px-5 py-2.5 bg-[#201A17] text-white hover:bg-[#2D2420] disabled:opacity-50 text-xs font-black rounded-xl transition-all flex items-center gap-2 shrink-0 shadow-sm"
              >
                {isValidating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                <span>Auditar Banco de Dados</span>
              </button>
            </div>

            {validationReport ? (
              <div className="space-y-6">
                {/* Result summary banner */}
                <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                  validationReport.isValid 
                    ? 'bg-emerald-50 border-emerald-500/20 text-emerald-800' 
                    : 'bg-red-50 border-red-500/20 text-red-800'
                }`}>
                  <div className="flex items-center gap-3.5">
                    {validationReport.isValid ? (
                      <CheckCircle className="w-8 h-8 text-emerald-600 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-8 h-8 text-red-600 shrink-0" />
                    )}
                    <div>
                      <h4 className="text-sm font-black font-sans uppercase">
                        {validationReport.isValid ? 'Auditoria Concluída: 100% de Conformidade!' : 'A Auditoria Detectou Falhas Críticas!'}
                      </h4>
                      <p className="text-xs leading-relaxed opacity-90 mt-0.5">
                        {validationReport.isValid 
                          ? 'Todos os 10 testes rigorosos de integridade, preços, relações e preservação de catálogos passaram com louvor no banco de dados.' 
                          : 'Alguns testes falharam. Corrija a migração e tente auditar novamente.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Compare Stats */}
                <div className="p-4 rounded-xl border border-[#EADFD8] space-y-3">
                  <h4 className="text-xs font-black text-[#201A17] uppercase tracking-wider">Comparação de Contagem de Chaves</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-[#F7F4EF] p-3.5 rounded-xl border border-[#EADFD8] flex items-center justify-between">
                      <span className="text-xs font-bold text-[#756B66]">Cidades</span>
                      <div className="text-xs font-mono font-black text-[#201A17]">
                        Local: {validationReport.counts.cities.local} / Firestore: {validationReport.counts.cities.firestore}
                      </div>
                    </div>
                    <div className="bg-[#F7F4EF] p-3.5 rounded-xl border border-[#EADFD8] flex items-center justify-between">
                      <span className="text-xs font-bold text-[#756B66]">Estabelecimentos</span>
                      <div className="text-xs font-mono font-black text-[#201A17]">
                        Local: {validationReport.counts.establishments.local} / Firestore: {validationReport.counts.establishments.firestore}
                      </div>
                    </div>
                    <div className="bg-[#F7F4EF] p-3.5 rounded-xl border border-[#EADFD8] flex items-center justify-between">
                      <span className="text-xs font-bold text-[#756B66]">Produtos</span>
                      <div className="text-xs font-mono font-black text-[#201A17]">
                        Local: {validationReport.counts.products.local} / Firestore: {validationReport.counts.products.firestore}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Suite of 10 test cases */}
                <div className="rounded-xl border border-[#EADFD8] overflow-hidden">
                  <div className="bg-[#F7F4EF] px-4 py-3 border-b border-[#EADFD8] flex justify-between items-center">
                    <h4 className="text-xs font-black text-[#201A17] uppercase tracking-wider">Suíte de Validação (10 Regras Oficiais)</h4>
                    <span className="text-[10px] font-mono bg-white text-[#756B66] border border-[#EADFD8] px-2 py-0.5 rounded-md">
                      Passaram: {validationReport.tests.filter(t => t.status === 'pass').length} / 10
                    </span>
                  </div>
                  <div className="divide-y divide-[#F7F4EF]">
                    {validationReport.tests.map((test, index) => (
                      <div key={index} className="px-4 py-3.5 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#201A17] font-sans">
                              {index + 1}. {test.name}
                            </span>
                            {test.status === 'pass' ? (
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-500/10">
                                Passou
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-500/10">
                                Falhou
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#756B66] leading-relaxed">
                            {test.message}
                          </p>
                          <div className="text-[10px] text-[#756B66] font-mono">
                            Esperado: {test.expected} | Atual: <span className="text-[#201A17] font-bold">{test.actual}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Activation Banner */}
                {validationReport.isValid && (
                  <div className="p-6 bg-[#201A17] text-white rounded-xl border border-[#FFBE5C]/15 space-y-4">
                    <div className="flex items-center gap-2 text-[#FFBE5C]">
                      <CheckCircle className="w-5 h-5 stroke-[2.5px]" />
                      <h4 className="text-xs font-black uppercase tracking-wider font-sans">Pronto para ativação geral</h4>
                    </div>
                    <p className="text-xs text-[#EADFD8] leading-relaxed">
                      Sua migração de catálogo passou em 100% dos testes da suíte de integridade. Agora, você pode habilitar o Cloud Firestore de produção para ser a fonte oficial e síncrona do catálogo de toda a plataforma UaiPertim!
                    </p>
                    <div className="flex items-center gap-4 pt-1">
                      {isActiveSource ? (
                        <div className="flex flex-wrap items-center gap-4">
                          <span className="text-xs text-[#756B66] font-mono">Status: Fonte ativada no Firestore</span>
                          <button
                            onClick={handleDeactivateFirestore}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-all"
                          >
                            Voltar para Catálogo Local
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleActivateFirestore}
                          className="px-6 py-3 bg-[#FFBE5C] text-[#201A17] hover:bg-[#e2a84d] text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-md"
                        >
                          <Check className="w-4 h-4 stroke-[3px]" />
                          <span>Ativar Firestore como Fonte Oficial</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-dashed border-[#EADFD8] py-12 rounded-xl text-center text-xs text-[#756B66] space-y-2">
                <Database className="w-8 h-8 mx-auto text-[#756B66]/40" />
                <p>Execute a auditoria do banco de dados para analisar os registros gravados no Firestore.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
    )}
  </div>
);
};
