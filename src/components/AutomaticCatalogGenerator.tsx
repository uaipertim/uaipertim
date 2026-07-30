import React, { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { db, auth } from "../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import {
  catalogGeneratorService,
  GeneratorAnalysis,
  GeneratorPreview,
  CatalogInventorySummary,
  CatalogStatus,
  getCatalogInventorySummary,
  getCatalogStatus,
  CatalogEligibility,
  calculateCatalogEligibility,
  mapEstablishmentCategoryToSegment,
  SEGMENT_TEMPLATES
} from "../services/catalogGeneratorService";
import {
  Sparkles,
  Database,
  Trash2,
  Building2,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Info,
  Loader2,
  Search,
  Check,
  ChevronRight,
  List,
  Flame,
  Play
} from "lucide-react";

interface AutomaticCatalogGeneratorProps {
  isActiveSource: boolean;
}

export const AutomaticCatalogGenerator: React.FC<AutomaticCatalogGeneratorProps> = ({ isActiveSource }) => {
  const { establishments, products, setProducts, menuCategories, setMenuCategories, showToast } = useApp();

  const activeSource = isActiveSource ? "firestore" : "local";

  // State managers
  const [selectedEstIds, setSelectedEstIds] = useState<string[]>([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generatorLogs, setGeneratorLogs] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<GeneratorPreview | null>(null);

  // New database summaries state
  const [databaseSummaries, setDatabaseSummaries] = useState<Record<string, CatalogInventorySummary>>({});
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "empty" | "real_catalog" | "demo_catalog" | "mixed_catalog" | "review_required">("all");

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const fetchDatabaseSummaries = async () => {
    setIsLoadingSummaries(true);
    try {
      // Direct Firestore query to always get up-to-date real data, satisfying Rule 16
      const prodsColl = collection(db, "products");
      const snapshot = await getDocs(prodsColl);
      
      const record: Record<string, any[]> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const estId = data.establishmentId || "unknown";
        if (!record[estId]) {
          record[estId] = [];
        }
        record[estId].push({ id: docSnap.id, ...data });
      });

      const summariesMap: Record<string, CatalogInventorySummary> = {};
      const FIRESTORE_DATABASE_ID = "ai-studio-uaipertim-1ec226bc-5361-4d8f-93aa-92f62786acfe";

      establishments.forEach((est) => {
        const estProds = record[est.id] || [];
        let realProducts = 0;
        let demoProducts = 0;
        let activeProducts = 0;
        let inactiveProducts = 0;
        const productIds: string[] = [];

        estProds.forEach((p) => {
          productIds.push(p.id);
          // Rule 6: Um produto deve ser tratado como real quando não possuir simultaneamente isDemo === true e demoSource === 'automatic-catalog-generator'
          const isGeneratedDemoProduct =
            p.isDemo === true &&
            p.demoSource === "automatic-catalog-generator";

          if (isGeneratedDemoProduct) {
            demoProducts++;
          } else {
            realProducts++;
          }

          if (p.active !== false) {
            activeProducts++;
          } else {
            inactiveProducts++;
          }
        });

        summariesMap[est.id] = {
          establishmentId: est.id,
          totalProducts: estProds.length,
          realProducts,
          demoProducts,
          activeProducts,
          inactiveProducts,
          productIds,
          source: "firestore",
          databaseId: FIRESTORE_DATABASE_ID,
        };
      });

      setDatabaseSummaries(summariesMap);
    } catch (err) {
      console.error("Erro ao carregar resumos do Firestore:", err);
    } finally {
      setIsLoadingSummaries(false);
    }
  };

  // Run analysis when establishments or activeSource changes
  useEffect(() => {
    fetchDatabaseSummaries();
  }, [establishments, activeSource]);

  // Scroll logs to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [generatorLogs]);

  const getSummary = (estId: string): CatalogInventorySummary => {
    return databaseSummaries[estId] || {
      establishmentId: estId,
      totalProducts: 0,
      realProducts: 0,
      demoProducts: 0,
      activeProducts: 0,
      inactiveProducts: 0,
      productIds: [],
      source: "firestore",
      databaseId: "ai-studio-uaipertim-1ec226bc-5361-4d8f-93aa-92f62786acfe",
    };
  };

  const getEstEligibility = (estId: string): CatalogEligibility => {
    if (isLoadingSummaries && !databaseSummaries[estId]) {
      return {
        isEligible: false,
        status: "inventory_error",
        reason: "Carregando informações do catálogo...",
        totalProducts: 0,
        realProducts: 0,
        demoProducts: 0,
        mappedSegment: null,
        templateId: null,
      };
    }
    const sum = getSummary(estId);
    const est = establishments.find((e) => e.id === estId);
    if (!est) {
      return {
        isEligible: false,
        status: "inventory_error",
        reason: "Estabelecimento não encontrado.",
        totalProducts: 0,
        realProducts: 0,
        demoProducts: 0,
        mappedSegment: null,
        templateId: null,
      };
    }
    return calculateCatalogEligibility(est, sum, activeSource);
  };

  if (isLoadingSummaries && Object.keys(databaseSummaries).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-[#EADFD8] space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#E94F2F]" />
        <p className="text-sm font-semibold text-[#756B66]">Carregando análise de estabelecimentos do Firestore de produção...</p>
      </div>
    );
  }

  // Calculate stats based on canonical statuses
  const totalStores = establishments.length;
  const emptyStoresCount = establishments.filter(est => {
    const el = getEstEligibility(est.id);
    return el.status === "empty" || el.status === "review_required";
  }).length;
  const filledStoresCount = totalStores - emptyStoresCount;
  const coveragePercent = totalStores > 0 ? Math.round((filledStoresCount / totalStores) * 100) : 0;
  const eligibleStoresCount = establishments.filter(est => getEstEligibility(est.id).isEligible).length;

  // Filtered establishments list
  const filteredEsts = establishments.filter((est) => {
    const matchesSearch = est.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (est.category || "").toLowerCase().includes(searchQuery.toLowerCase());

    const eligibility = getEstEligibility(est.id);
    const status = eligibility.status;

    if (filterStatus === "empty") return matchesSearch && (status === "empty" || status === "review_required");
    if (filterStatus === "real_catalog") return matchesSearch && status === "real_catalog";
    if (filterStatus === "demo_catalog") return matchesSearch && status === "demo_catalog";
    if (filterStatus === "mixed_catalog") return matchesSearch && status === "mixed_catalog";
    if (filterStatus === "review_required") return matchesSearch && status === "review_required";
    return matchesSearch;
  });

  // Action: Select all empty eligible establishments
  const handleSelectAllEmpty = () => {
    const eligibleIds = establishments
      .filter((est) => getEstEligibility(est.id).isEligible)
      .map((e) => e.id);
    setSelectedEstIds(eligibleIds);
    setPreviewData(null);
    showToast(`${eligibleIds.length} estabelecimentos elegíveis foram selecionados.`, "info");
  };

  // Action: Toggle single selection
  const handleToggleSelect = (id: string) => {
    const eligibility = getEstEligibility(id);
    if (!eligibility.isEligible) {
      showToast(eligibility.reason || "Este estabelecimento não é elegível para geração.", "warning");
      return;
    }
    setPreviewData(null);
    if (selectedEstIds.includes(id)) {
      setSelectedEstIds(prev => prev.filter(item => item !== id));
    } else {
      setSelectedEstIds(prev => [...prev, id]);
    }
  };

  // Action: Clear selection
  const handleClearSelection = () => {
    setSelectedEstIds([]);
    setPreviewData(null);
  };

  // Action: Generate Preview
  const handleGeneratePreview = () => {
    if (selectedEstIds.length === 0) {
      showToast("Selecione ao menos um estabelecimento para gerar a prévia.", "warning");
      return;
    }

    // Safety check: ensure all selected are eligible
    const nonEligibleSelected = selectedEstIds.filter(id => !getEstEligibility(id).isEligible);
    if (nonEligibleSelected.length > 0) {
      showToast("Ação interrompida: Um ou mais estabelecimentos selecionados não são elegíveis.", "error");
      return;
    }

    const preview = catalogGeneratorService.generatePreview(activeSource, establishments, selectedEstIds);
    setPreviewData(preview);
    showToast("Prévia gerada com sucesso! Verifique os detalhes abaixo.", "success");
  };

  // Action: Execute Generation
  const executeGenerationBackend = async () => {
    setIsConfirmModalOpen(false);
    setIsGenerating(true);
    setGeneratorLogs([]);

    const log = (msg: string) => {
      setGeneratorLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    const firstEstId = selectedEstIds[0];
    const firstEst = establishments.find(e => e.id === firstEstId);
    const estName = firstEst ? firstEst.name : "Padaria do Centro";
    const segment = firstEst ? mapEstablishmentCategoryToSegment(firstEst) : "padaria";
    const sum = firstEst ? getSummary(firstEst.id) : null;
    const totalProds = sum ? sum.totalProducts : 0;

    log("[GERADOR] Clique em “Confirmar e Gerar” recebido.");
    log("[GERADOR] Modo piloto genérico ativo.");
    log("[GERADOR] Limite da operação: 1 estabelecimento.");
    log(`[GERADOR] Estabelecimento: ${estName}.`);
    log(`[GERADOR] ID: ${firstEstId}.`);
    log("[GERADOR] Validando catálogo atual.");
    log(`[GERADOR] Produtos encontrados: ${totalProds}.`);
    log(`[GERADOR] Segmento: ${segment}.`);
    log(`[GERADOR] Template: ${segment}.`);
    
    // Calculate the counts of categories and products to create for this segment/template
    const templates = SEGMENT_TEMPLATES[segment] || [];
    const uniqueCategoryNames = Array.from(new Set(templates.map((t: any) => t.categoryName)));
    const catCount = uniqueCategoryNames.length;
    const prodCount = templates.length;

    log(`[GERADOR] Preparando ${catCount} categorias e ${prodCount} produtos.`);
    log("[GERADOR] Enviando operação ao Firestore.");
    
    try {
      // 1. Get Authentication Token
      log("Obtendo token de autenticação de administrador...");
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("Sessão administrativa expirada ou inválida. Por favor, faça login novamente.");
      }

      // 2. Post request to administrative route
      log("Enviando payload seguro para o servidor...");
      const payload = {
        establishmentIds: selectedEstIds,
        operation: "generate-demo-catalog",
        expectedTemplate: segment,
        expectedSegment: segment,
        previewVersion: 1
      };

      const establishmentId = selectedEstIds[0];

      const response = await fetch('/api/admin/catalog-generator/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Handle specific status codes
        if (response.status === 401) {
          throw new Error("Sessão de administrador ausente ou expirada.");
        }
        if (response.status === 403) {
          throw new Error("Seu usuário não possui permissão administrativa para executar esta ação.");
        }
        if (response.status === 409 && result.code === "REAL_CATALOG_EXISTS") {
          // Rule 10: AUTOMATIC REAL-TIME RECONCILIATION
          log("[RECONCILIAÇÃO] Conflito detectado: O estabelecimento já possui produtos reais cadastrados.");
          log("[RECONCILIAÇÃO] Sincronizando estado local com o Firestore de produção...");
          
          setPreviewData(null);
          setSelectedEstIds(prev => prev.filter(id => id !== establishmentId));
          
          await fetchDatabaseSummaries();
          
          log("[RECONCILIAÇÃO] Concluído! KPIs e filtros atualizados instantaneamente.");
          throw new Error("O estabelecimento já possui produtos reais cadastrados. Geração suspensa para preservar dados reais.");
        }
        throw new Error(result.message || result.error || "Falha na geração do catálogo demonstrativo pelo servidor.");
      }

      // 3. Process success
      if (result.success) {
        log(`Sucesso absoluto! ${result.message}`);
        log(`Métricas da gravação: ${result.categoriesCreated} categorias criadas, ${result.productsCreated} produtos novos criados.`);
        if (result.categoriesSkipped > 0 || result.productsSkipped > 0) {
          log(`Itens ignorados por redundância (idempotência): ${result.categoriesSkipped} categorias, ${result.productsSkipped} produtos.`);
        }
        
        if (result.categoriesCreated === 0 && result.productsCreated === 0) {
          showToast("Catálogo demonstrativo já existente e intacto no Firestore de produção.", "info");
        } else {
          showToast(`Catálogo demonstrativo da ${result.establishmentName || "Padaria do Centro"} criado com sucesso.`, "success");
        }

        // Fetch latest summaries to update metrics after successful generation!
        await fetchDatabaseSummaries();

        // Clear selection and preview
        setSelectedEstIds([]);
        setPreviewData(null);
      } else {
        throw new Error(result.message || "Erro inesperado.");
      }

    } catch (err: any) {
      console.error("Erro na geração do catálogo via backend:", err);
      log(`FALHA CRÍTICA: ${err.message || err}`);
      showToast(`Erro na geração: ${err.message}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExecuteGeneration = async () => {
    // 1. Immediate click response
    console.log("Clique no botão 'Confirmar e Gerar' detectado pelo componente.");
    setGeneratorLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Clique no botão 'Confirmar e Gerar' detectado.`]);

    if (selectedEstIds.length === 0) {
      showToast("Selecione ao menos um estabelecimento para gerar o catálogo.", "warning");
      return;
    }

    if (selectedEstIds.length > 1) {
      showToast("Durante a homologação, selecione apenas um estabelecimento por geração.", "warning");
      return;
    }

    // Front-end safety validation - block if any previewed establishment is incompatible or needs review
    if (previewData?.diagnostics) {
      const hasIncompatible = previewData.diagnostics.some(d => !d.isCompatible || d.templateId === "revisao_necessaria");
      if (hasIncompatible) {
        showToast("A prévia atual não corresponde à categoria cadastrada do estabelecimento. Revise o mapeamento antes de gerar o catálogo.", "error");
        return;
      }
    }

    if (activeSource === "firestore") {
      setIsConfirmModalOpen(true);
      return;
    }

    // Local source fallback
    const confirmMsg = `Deseja gerar produtos locais para os ${selectedEstIds.length} estabelecimentos selecionados?`;
    if (!window.confirm(confirmMsg)) return;

    setIsGenerating(true);
    setGeneratorLogs([]);

    const log = (msg: string) => {
      setGeneratorLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    try {
      const result = await catalogGeneratorService.executeGeneration(
        activeSource,
        establishments,
        selectedEstIds,
        products,
        menuCategories,
        log
      );

      if (result.success) {
        showToast(result.message, "success");
        if (activeSource === "local" && result.localProducts && result.localCategories) {
          setProducts(result.localProducts);
          setMenuCategories(result.localCategories);
          // Persist local storage as AppContext would do
          localStorage.setItem("pl_products", JSON.stringify(result.localProducts));
          localStorage.setItem("pl_menu_categories", JSON.stringify(result.localCategories));
        }
        await fetchDatabaseSummaries();
        setSelectedEstIds([]);
        setPreviewData(null);
      } else {
        showToast(result.message, "error");
      }
    } catch (err: any) {
      console.error(err);
      log(`FALHA CRÍTICA: ${err.message || err}`);
      showToast(`Erro durante a geração: ${err.message}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Action: Remove Demonstration Catalogs
  const handleRemoveDemoCatalogs = async () => {
    let targetEstId: string | undefined = undefined;

    if (selectedEstIds.length === 1) {
      const singleEstId = selectedEstIds[0];
      const singleEst = establishments.find((e) => e.id === singleEstId);
      const opt = window.confirm(
        `Você gostaria de remover os dados de demonstração APENAS do estabelecimento "${singleEst?.name || singleEstId}"?\n\nClique em [OK] para remover APENAS de "${singleEst?.name || singleEstId}".\nClique em [Cancelar] para remover de TODA a plataforma.`
      );
      if (opt) {
        targetEstId = singleEstId;
      } else {
        const confirmAll = window.confirm("Deseja remover produtos de demonstração de TODOS os estabelecimentos cadastrados na plataforma?");
        if (!confirmAll) return;
      }
    } else {
      const confirmMsg = activeSource === "firestore"
        ? "CUIDADO EXTREMO! Deseja remover todos os produtos e categorias demonstrativos criados pelo gerador automático de TODOS os estabelecimentos do banco de dados Cloud Firestore? Essa ação é irreversível."
        : "Deseja remover todos os produtos e categorias demonstrativos gerados localmente para todos os estabelecimentos?";

      if (!window.confirm(confirmMsg)) return;
      if (!window.confirm("Você tem certeza absoluta que deseja prosseguir com a remoção limpa dos dados demo?")) return;
    }

    setIsDeleting(true);
    setGeneratorLogs([]);

    const log = (msg: string) => {
      setGeneratorLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    try {
      const result = await catalogGeneratorService.removeDemonstrationProducts(
        activeSource,
        establishments,
        products,
        menuCategories,
        log,
        targetEstId
      );

      if (result.success) {
        showToast(result.message, "success");
        if (activeSource === "local" && result.localProducts && result.localCategories) {
          setProducts(result.localProducts);
          setMenuCategories(result.localCategories);
          localStorage.setItem("pl_products", JSON.stringify(result.localProducts));
          localStorage.setItem("pl_menu_categories", JSON.stringify(result.localCategories));
        }
        await fetchDatabaseSummaries();
        setSelectedEstIds([]);
        setPreviewData(null);
      } else {
        showToast(result.message, "error");
      }
    } catch (err: any) {
      console.error(err);
      log(`FALHA NA REMOÇÃO: ${err.message || err}`);
      showToast(`Erro na remoção: ${err.message}`, "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8" id="automatic-catalog-generator-wrapper">
      {/* Coverage Analysis and Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Total de Estabelecimentos</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl font-black text-[#201A17]">{totalStores}</span>
            <span className="text-xs text-[#756B66] font-bold">cadastradas</span>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[11px] font-bold text-[#756B66] bg-[#FAF8F6] p-2 rounded-xl border border-[#EADFD8]/60">
            <Building2 className="w-3.5 h-3.5 text-[#E94F2F]" />
            <span>Estrutura de comércios ativa</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Estabelecimentos sem Catálogo</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-4xl font-black ${emptyStoresCount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {emptyStoresCount}
            </span>
            <span className="text-xs text-[#756B66] font-bold">vazias</span>
          </div>
          <div className="mt-4">
            {eligibleStoresCount > 0 ? (
              <button
                onClick={handleSelectAllEmpty}
                className="w-full text-center bg-[#E94F2F]/10 hover:bg-[#E94F2F]/20 text-[#E94F2F] border border-[#E94F2F]/20 py-1.5 px-3 rounded-xl text-xs font-black transition-all"
              >
                Selecionar todos os {eligibleStoresCount} estabelecimentos elegíveis
              </button>
            ) : (
              <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Nenhum estabelecimento sem produtos!</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Estabelecimentos com Catálogo</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl font-black text-emerald-600">{filledStoresCount}</span>
            <span className="text-xs text-[#756B66] font-bold">ativas</span>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[11px] font-bold text-emerald-700 bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10">
            <Check className="w-3.5 h-3.5" />
            <span>Catálogos estruturados</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Cobertura de Catálogo</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-4xl font-black text-[#201A17]">{coveragePercent}%</span>
            <span className="text-xs text-[#756B66] font-bold">concluído</span>
          </div>
          <div className="mt-4">
            <div className="w-full bg-[#FAF8F6] rounded-full h-2.5 border border-[#EADFD8]/60 overflow-hidden">
              <div
                className="bg-[#E94F2F] h-full transition-all duration-500"
                style={{ width: `${coveragePercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Action Panel */}
      <div className="bg-[#FAF8F6] p-6 rounded-3xl border border-[#EADFD8] space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-[#201A17] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Painel de Operações em Lote
            </h3>
            <p className="text-xs text-[#756B66] leading-relaxed">
              Crie catálogos completos com dados reais de demonstração adaptados ao segmento de cada comércio de forma automática.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {selectedEstIds.length > 0 && (
              <button
                onClick={handleClearSelection}
                className="px-4 py-2 text-xs font-bold text-[#756B66] hover:text-[#201A17] transition-all"
              >
                Limpar seleção ({selectedEstIds.length})
              </button>
            )}

            <button
              onClick={handleGeneratePreview}
              disabled={selectedEstIds.length === 0 || isGenerating || isDeleting}
              className="px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all bg-white hover:bg-gray-50 text-[#201A17] border border-[#EADFD8] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#756B66]" />
              Gerar Prévia
            </button>

            <button
              onClick={handleExecuteGeneration}
              disabled={selectedEstIds.length === 0 || isGenerating || isDeleting}
              className="px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all bg-[#E94F2F] hover:bg-[#BD351C] text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Confirmar e Gerar
                </>
              )}
            </button>

            <button
              onClick={handleRemoveDemoCatalogs}
              disabled={isGenerating || isDeleting}
              className="px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Removendo...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover Dados Demo
                </>
              )}
            </button>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="p-4 bg-[#FFBE5C]/10 border border-[#FFBE5C]/20 rounded-2xl text-[11px] text-[#7A5B2C] leading-relaxed flex gap-3">
          <Info className="w-4 h-4 text-[#FFBE5C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold uppercase tracking-wider">Aviso de Integridade dos Dados:</p>
            <p className="font-semibold">
              O sistema utiliza <strong>IDs determinísticos</strong> baseados no ID do comércio e slug do produto para prevenir duplicidade de registros, mesmo se executado múltiplas vezes.
              Nenhum comércio que já possui produtos cadastrados será modificado para garantir a preservação de dados manuais existentes.
            </p>
          </div>
        </div>
      </div>

      {/* Terminal Live logs */}
      {(isGenerating || isDeleting || generatorLogs.length > 0) && (
        <div className="bg-[#1C1613] rounded-3xl border border-[#2D2420] p-5 shadow-inner space-y-3">
          <div className="flex items-center justify-between border-b border-[#2D2420] pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
              <span className="text-[10px] font-bold text-[#EADFD8] uppercase tracking-wider font-mono">Console de Geração de Catálogo</span>
            </div>
            <button
              onClick={() => setGeneratorLogs([])}
              className="text-[10px] font-bold text-[#756B66] hover:text-[#EADFD8]"
            >
              Limpar Console
            </button>
          </div>
          <div className="max-h-[250px] overflow-y-auto font-mono text-[11px] text-[#A69990] space-y-1.5 scrollbar-thin">
            {generatorLogs.map((logLine, idx) => (
              <div key={idx} className="leading-relaxed whitespace-pre-wrap">
                {logLine}
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
        </div>
      )}

      {/* Preview Container */}
      {previewData && (
        <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-black text-[#201A17] uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                PRÉVIA DA GERAÇÃO — SIMULAÇÃO ({previewData.establishmentsCount} {previewData.establishmentsCount === 1 ? 'ESTABELECIMENTO' : 'ESTABELECIMENTOS'})
              </h4>
              <p className="text-xs text-[#756B66]">Dados estruturados simulados deterministicamente antes da gravação final.</p>
            </div>
            {previewData.diagnostics?.some((d: any) => !d.isCompatible || d.templateId === "revisao_necessaria") ? (
              <span className="px-3 py-1 bg-rose-100 text-rose-800 text-[10px] font-black rounded-full uppercase">
                Bloqueado — Revisão necessária
              </span>
            ) : (
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-700 text-[10px] font-black rounded-full uppercase">
                Dry-run aprovado
              </span>
            )}
          </div>

          {/* Detailed Diagnostics Audit Panel */}
          {previewData.diagnostics && previewData.diagnostics.length > 0 && (
            <div className="p-4 bg-amber-50/30 border border-amber-200/50 rounded-2xl space-y-4">
              <h5 className="text-[10px] font-black text-[#7A5B2C] uppercase tracking-wider flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                Painel de Diagnóstico Técnico e Mapeamento de Segmento
              </h5>
              
              {previewData.diagnostics.map((diag: any, idx: number) => {
                const criteriaUsed = diag.primaryCategory 
                  ? "primaryCategory" 
                  : (diag.categoryIds && diag.categoryIds.length > 0 ? "categoryIds" : "categoryName/category");
                
                return (
                  <div key={idx} className="p-4 bg-white border border-[#EADFD8] rounded-xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-[#201A17]">
                        Estabelecimento: <span className="text-[#E94F2F]">{diag.establishmentName}</span> (ID: <span className="font-mono text-[11px]">{diag.establishmentId}</span>)
                      </div>
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${diag.isCompatible && diag.templateId !== "revisao_necessaria" ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {diag.isCompatible && diag.templateId !== "revisao_necessaria" ? 'Compatível' : 'Incompatível'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-[11px] font-medium text-[#756B66]">
                      <div><strong>documentId:</strong> <span className="font-mono">{diag.documentId || "null"}</span></div>
                      <div><strong>name:</strong> <span className="font-mono">{diag.name || "null"}</span></div>
                      <div><strong>primaryCategory:</strong> <span className="font-mono">{diag.primaryCategory || "null"}</span></div>
                      <div><strong>category:</strong> <span className="font-mono">{diag.category || "null"}</span></div>
                      <div><strong>categoryId:</strong> <span className="font-mono">{diag.categoryId || "null"}</span></div>
                      <div><strong>categoryIds:</strong> <span className="font-mono">{JSON.stringify(diag.categoryIds) || "null"}</span></div>
                      <div><strong>subcategory:</strong> <span className="font-mono">{diag.subcategory || "null"}</span></div>
                      <div><strong>segment:</strong> <span className="font-mono">{diag.segment || "null"}</span></div>
                      <div><strong>businessType:</strong> <span className="font-mono">{diag.businessType || "null"}</span></div>
                      <div><strong>slug:</strong> <span className="font-mono">{diag.slug || "null"}</span></div>
                      <div className="sm:col-span-2 md:col-span-3"><strong>aboutDescription:</strong> <span className="font-mono">{diag.aboutDescription || "null"}</span></div>
                    </div>

                    <div className="border-t border-[#FAF8F6] pt-2 flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
                      <div><strong>Categoria oficial detectada:</strong> <span className="font-bold text-[#201A17]">{diag.detectedCategory}</span></div>
                      <div><strong>Segmento utilizado:</strong> <span className="font-bold text-[#201A17]">{diag.detectedSegment}</span></div>
                      <div><strong>Template aplicado:</strong> <span className="font-bold text-amber-600">{diag.templateId}</span></div>
                      <div><strong>Critério utilizado:</strong> <span className="font-bold text-blue-600">{criteriaUsed}</span></div>
                    </div>

                    {(!diag.isCompatible || diag.templateId === "revisao_necessaria") && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 font-extrabold text-[11px] leading-relaxed flex gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>A prévia atual não corresponde à categoria cadastrada do estabelecimento. Revise o mapeamento antes de gerar o catálogo.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-[#FAF8F6] rounded-2xl border border-[#EADFD8] max-h-[300px] overflow-y-auto space-y-3">
              <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">Categorias internas ({previewData.categoriesToCreate.length})</span>
              <div className="space-y-2">
                {previewData.categoriesToCreate.map((cat, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border border-[#EADFD8]/50 text-xs">
                    <span className="font-bold text-[#201A17]">{cat.name}</span>
                    <span className="text-[10px] text-[#756B66] font-mono">Ordem {cat.sortOrder} • {cat.establishmentId}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-[#FAF8F6] rounded-2xl border border-[#EADFD8] max-h-[300px] overflow-y-auto space-y-3">
              <span className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">Produtos novos ({previewData.productsToCreate.length})</span>
              <div className="space-y-2">
                {previewData.productsToCreate.map((prod, idx) => (
                  <div key={idx} className="p-2.5 bg-white rounded-lg border border-[#EADFD8]/50 text-xs flex justify-between items-center">
                    <div>
                      <div className="font-bold text-[#201A17] flex items-center gap-1.5">
                        {prod.name}
                        {prod.isFeatured && (
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1 rounded">Destaque</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#756B66] mt-0.5">{prod.categoryName} • Estabelecimento ID: {prod.establishmentId}</div>
                    </div>
                    <span className="font-black text-[#201A17] shrink-0">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(prod.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Establishments Grid / Interactive Checklist */}
      <div className="bg-white rounded-3xl border border-[#EADFD8] overflow-hidden shadow-xs space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-[#201A17] text-base">Todos os Estabelecimentos</h3>
            <p className="text-xs text-[#756B66]">Selecione individualmente ou filtre por cobertura de catálogo.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#756B66] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar comércio..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-1.5 w-full sm:w-[200px] rounded-xl text-xs border border-[#EADFD8] outline-none focus:border-[#E94F2F] bg-white text-[#201A17]"
              />
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="p-1.5 rounded-xl text-xs border border-[#EADFD8] outline-none focus:border-[#E94F2F] bg-white text-[#201A17] font-bold cursor-pointer"
            >
              <option value="all">Filtro: Todos</option>
              <option value="empty">Sem Catálogo (Vazio / Elegível)</option>
              <option value="real_catalog">Catálogo Real</option>
              <option value="demo_catalog">Catálogo Demonstrativo</option>
              <option value="mixed_catalog">Catálogo Misto</option>
              <option value="review_required">Revisão Necessária</option>
            </select>
          </div>
        </div>

        {/* List of establishments */}
        <div className="border border-[#EADFD8] rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF8F6] border-b border-[#EADFD8] text-[#756B66] font-black uppercase tracking-wider text-[10px]">
                <th className="p-4 w-12 text-center">Sel</th>
                <th className="p-4">Estabelecimento</th>
                <th className="p-4">Categoria/Segmento</th>
                <th className="p-4 text-center">Itens no Catálogo</th>
                <th className="p-4">Status do estabelecimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EADFD8]/50">
              {filteredEsts.length > 0 ? (
                filteredEsts.map((est) => {
                  const sum = getSummary(est.id);
                  const eligibility = getEstEligibility(est.id);
                  const isEligible = eligibility.isEligible;
                  const isSelected = selectedEstIds.includes(est.id);

                  let badgeStyle = "bg-amber-100 text-amber-800 border border-amber-200";
                  let statusText = "Sem Catálogo";
                  let tooltipText = "";

                  if (eligibility.status === "empty") {
                    badgeStyle = "bg-amber-100 text-amber-800 border border-amber-200";
                    statusText = "Sem Catálogo";
                    tooltipText = "Selecionar para gerar catálogo demonstrativo.";
                  } else if (eligibility.status === "real_catalog") {
                    badgeStyle = "bg-emerald-100 text-emerald-800 border border-emerald-200";
                    statusText = "Catálogo Real";
                    tooltipText = `${sum.realProducts} produtos reais cadastrados. Geração automática indisponível.`;
                  } else if (eligibility.status === "demo_catalog") {
                    badgeStyle = "bg-blue-100 text-blue-800 border border-blue-200";
                    statusText = "Catálogo Demo";
                    tooltipText = "Este estabelecimento já possui um catálogo demonstrativo.";
                  } else if (eligibility.status === "mixed_catalog") {
                    badgeStyle = "bg-purple-100 text-purple-800 border border-purple-200";
                    statusText = "Catálogo Misto";
                    tooltipText = "Este estabelecimento já possui produtos reais e demonstrativos.";
                  } else if (eligibility.status === "review_required") {
                    badgeStyle = "bg-rose-100 text-rose-800 border border-rose-200";
                    statusText = "Revisão Necessária";
                    tooltipText = "Categoria não definida. Revisão necessária.";
                  } else if (eligibility.status === "inventory_error") {
                    badgeStyle = "bg-rose-100 text-rose-800 border border-rose-200";
                    statusText = "Revisão Necessária";
                    tooltipText = "Não foi possível confirmar o catálogo deste estabelecimento. Tente novamente.";
                  }

                  return (
                    <tr
                      key={est.id}
                      onClick={() => handleToggleSelect(est.id)}
                      className={`hover:bg-[#FAF8F6]/50 transition-all ${
                        isSelected ? "bg-[#E94F2F]/5" : ""
                      } ${!isEligible ? "opacity-75 cursor-not-allowed" : "cursor-pointer"}`}
                      title={tooltipText}
                    >
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isEligible}
                          onChange={() => handleToggleSelect(est.id)}
                          className="w-4 h-4 rounded text-[#E94F2F] border-[#EADFD8] focus:ring-[#E94F2F] disabled:opacity-50 disabled:cursor-not-allowed"
                          title={tooltipText}
                        />
                      </td>
                      <td className="p-4 font-extrabold text-[#201A17]">{est.name}</td>
                      <td className="p-4">
                        <span className="bg-gray-100 text-gray-800 font-bold px-2.5 py-1 rounded-lg text-[10px] uppercase">
                          {est.category || "Não definida"}
                        </span>
                      </td>
                      <td className="p-4 text-center font-bold text-[#201A17]">
                        {sum.totalProducts} produtos ({sum.realProducts} reais, {sum.demoProducts} demo)
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${badgeStyle}`}>
                          {!isEligible ? <AlertTriangle className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                          {statusText}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[#756B66] font-semibold">
                    Nenhum estabelecimento encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Confirmation Modal */}
      {isConfirmModalOpen && (() => {
        const selectedEst = establishments.find(e => e.id === selectedEstIds[0]);
        const selectedEstName = selectedEst ? selectedEst.name : "Padaria do Centro";
        const selectedSegment = selectedEst ? mapEstablishmentCategoryToSegment(selectedEst) : "padaria";
        const selectedTemplates = selectedSegment && selectedSegment !== "revisao_necessaria" ? SEGMENT_TEMPLATES[selectedSegment] : [];
        const selectedCategoriesCount = Array.from(new Set(selectedTemplates.map((t: any) => t.categoryName))).length;
        const selectedProductsCount = selectedTemplates.length;

        return (
          <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setIsConfirmModalOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <div 
              className="bg-[#FCFAF6] border border-[#EADFD8] rounded-2xl max-w-md w-full text-left shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 flex flex-col p-6 space-y-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div className="bg-[#E94F2F]/10 p-2 rounded-xl">
                  <Sparkles className="w-6 h-6 text-[#E94F2F]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#201A17]">Confirmar criação do catálogo demonstrativo?</h3>
                  <p className="text-xs font-bold text-[#E94F2F] uppercase tracking-wider">Ação Administrativa Segura</p>
                </div>
              </div>

              <div className="bg-white/65 p-4 rounded-xl border border-[#EADFD8] space-y-2.5 text-xs text-[#5C534E]">
                <div className="flex justify-between">
                  <span className="font-bold text-[#756B66]">Estabelecimento:</span>
                  <span className="font-extrabold text-[#201A17]">{selectedEstName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-[#756B66]">Categorias:</span>
                  <span className="font-extrabold text-[#201A17]">{selectedCategoriesCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-[#756B66]">Produtos:</span>
                  <span className="font-extrabold text-[#201A17]">{selectedProductsCount}</span>
                </div>
                <div className="flex justify-between border-t border-[#EADFD8]/60 pt-2">
                  <span className="font-bold text-[#756B66]">Fonte:</span>
                  <span className="font-extrabold text-[#E94F2F]">Cloud Firestore — Produção</span>
                </div>
              </div>

              <p className="text-xs font-medium text-[#756B66] leading-relaxed">
                “Nenhum produto real será alterado. Somente dados demonstrativos identificados pelo Gerador Automático de Catálogo serão criados.”
              </p>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-black transition-all bg-white hover:bg-gray-50 text-[#756B66] border border-[#EADFD8]"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeGenerationBackend}
                  className="px-5 py-2 rounded-xl text-xs font-black transition-all bg-[#E94F2F] hover:bg-[#BD351C] text-white shadow-md hover:shadow-lg"
                >
                  Confirmar criação
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
