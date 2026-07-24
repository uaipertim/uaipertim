import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, ShoppingCart, Percent, Award, ArrowUpRight, ArrowDownRight, 
  Calendar, MapPin, Building2, TrendingUp, ChevronRight, X, Clock, Map, Sparkles, Filter, RefreshCw 
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { useApp } from '../context/AppContext';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid 
} from 'recharts';

interface OverviewMetrics {
  summary: {
    totalMovimentado: number;
    totalMovimentadoDiff: number | null;
    subtotalProd: number;
    subtotalProdDiff: number | null;
    pedidosConcluidos: number;
    pedidosConcluidosDiff: number | null;
    ticketMedio: number;
    ticketMedioDiff: number | null;
    taxasEntrega: number;
    taxasEntregaDiff: number | null;
    descontos: number;
    descontosDiff: number | null;
    pedidosRecebidos: number;
    pedidosRecebidosDiff: number | null;
    cancelledRecusados: number;
    cancelledRecusadosPct: number;
    cancelledRecusadosDiff: number | null;
  };
  operational: {
    total: number;
    concluidos: number;
    recusados: number;
    cancelados: number;
    emAndamento: number;
    taxaConclusao: number;
    taxaRecusa: number;
    taxaCancelamento: number;
    tempoMedioConfirmacaoMinutes: number;
    tempoMedioPreparacaoMinutes: number;
    tempoMedioTotalMinutes: number;
  };
  distributions: {
    paymentMethods: Array<{ id: string; label: string; count: number; pct: number; value: number }>;
    fulfillment: Array<{ id: string; label: string; count: number; pct: number; value: number }>;
  };
  meta: {
    ignoredOrdersCount: number;
  };
}

interface EstablishmentMetric {
  id: string;
  name: string;
  city: string;
  cityId: string;
  ordersReceived: number;
  ordersCompleted: number;
  valueMoved: number;
  ticketAverage: number;
  completionRate: number;
  cancelledRecusados: number;
  status: string;
  active: boolean;
}

interface EstablishmentDetail {
  summary: OverviewMetrics['summary'];
  operational: OverviewMetrics['operational'];
  distributions: OverviewMetrics['distributions'];
  products: Array<{ id: string; name: string; quantity: number; value: number; participationPct: number }>;
  neighborhoods: Array<{ name: string; count: number; value: number; deliveryFeeSum: number; avgDeliveryFee: number }>;
}

export const FinanceiroAdmin: React.FC = () => {
  const { cities, establishments, showToast } = useApp();

  // Filter States
  const [period, setPeriod] = useState<'7d' | '30d' | 'mes' | 'custom'>('7d');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [establishmentFilter, setEstablishmentFilter] = useState('all');

  // Data States
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [timeseries, setTimeseries] = useState<Array<{ date: string; count: number; value: number }>>([]);
  const [estMetrics, setEstMetrics] = useState<EstablishmentMetric[]>([]);

  // Establishment Detail States
  const [selectedEstId, setSelectedEstId] = useState<string | null>(null);
  const [selectedEstName, setSelectedEstName] = useState<string>('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<EstablishmentDetail | null>(null);

  // Sorting for establishment ranking table
  const [sortField, setSortField] = useState<'name' | 'ordersReceived' | 'ordersCompleted' | 'valueMoved' | 'ticketAverage' | 'completionRate'>('valueMoved');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Compute actual date objects based on selected preset
  const calculatedDates = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (period === '7d') {
      start.setDate(end.getDate() - 6);
    } else if (period === '30d') {
      start.setDate(end.getDate() - 29);
    } else if (period === 'mes') {
      start.setDate(1); // 1st of current month
    } else if (period === 'custom') {
      if (startDateStr) {
        const customStart = new Date(startDateStr);
        if (!isNaN(customStart.getTime())) {
          customStart.setHours(0, 0, 0, 0);
          start.setTime(customStart.getTime());
        }
      }
      if (endDateStr) {
        const customEnd = new Date(endDateStr);
        if (!isNaN(customEnd.getTime())) {
          customEnd.setHours(23, 59, 59, 999);
          end.setTime(customEnd.getTime());
        }
      }
    }
    return { start, end };
  }, [period, startDateStr, endDateStr]);

  // Set default custom dates on mount
  useEffect(() => {
    const now = new Date();
    const before7Days = new Date();
    before7Days.setDate(now.getDate() - 6);
    setStartDateStr(before7Days.toISOString().split('T')[0]);
    setEndDateStr(now.toISOString().split('T')[0]);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        showToast('Você precisa estar autenticado para visualizar os dados.', 'error');
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        startDate: calculatedDates.start.toISOString(),
        endDate: calculatedDates.end.toISOString(),
      });

      if (cityFilter !== 'all') params.append('cityId', cityFilter);
      if (establishmentFilter !== 'all') params.append('establishmentId', establishmentFilter);

      // Fetch overview and distributions
      const overviewRes = await fetch(`/api/admin/analytics/overview?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!overviewRes.ok) throw new Error(await overviewRes.text());
      const overviewData = await overviewRes.json();
      setMetrics(overviewData);

      // Fetch timeseries
      const timeseriesRes = await fetch(`/api/admin/analytics/timeseries?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!timeseriesRes.ok) throw new Error(await timeseriesRes.text());
      const tsData = await timeseriesRes.json();
      setTimeseries(tsData.timeseries || []);

      // Fetch establishments table list
      const estParams = new URLSearchParams({
        startDate: calculatedDates.start.toISOString(),
        endDate: calculatedDates.end.toISOString(),
      });
      if (cityFilter !== 'all') estParams.append('cityId', cityFilter);

      const establishmentsRes = await fetch(`/api/admin/analytics/establishments?${estParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!establishmentsRes.ok) throw new Error(await establishmentsRes.text());
      const estData = await establishmentsRes.json();
      setEstMetrics(estData);

    } catch (error: any) {
      console.error('Error fetching admin analytics:', error);
      showToast(error.message || 'Erro ao carregar métricas financeiras.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Trigger fetch on filter change
  useEffect(() => {
    if (period !== 'custom' || (startDateStr && endDateStr)) {
      fetchData();
    }
  }, [period, startDateStr, endDateStr, cityFilter, establishmentFilter]);

  // Fetch single establishment details when selected
  const fetchEstDetails = async (id: string, name: string) => {
    setSelectedEstId(id);
    setSelectedEstName(name);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const params = new URLSearchParams({
        startDate: calculatedDates.start.toISOString(),
        endDate: calculatedDates.end.toISOString(),
      });

      const res = await fetch(`/api/admin/analytics/establishments/${id}?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDetailData(data);
    } catch (error: any) {
      console.error('Error fetching establishment details:', error);
      showToast(error.message || 'Erro ao carregar detalhes do estabelecimento.', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  // Sorting handler
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedEsts = useMemo(() => {
    return [...estMetrics].sort((a: any, b: any) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  }, [estMetrics, sortField, sortDirection]);

  // Render change badges elegantly
  const renderTrendBadge = (diff: number | null) => {
    if (diff === null) {
      return (
        <span className="text-[10px] text-gray-500 bg-gray-100 font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-0.5">
          --
        </span>
      );
    }
    const isPositive = diff > 0;
    const isZero = diff === 0;

    if (isZero) {
      return (
        <span className="text-[10px] text-gray-500 bg-gray-100 font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-0.5">
          0,0%
        </span>
      );
    }

    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-0.5 ${
        isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
      }`}>
        {isPositive ? <ArrowUpRight className="w-3 h-3 shrink-0" /> : <ArrowDownRight className="w-3 h-3 shrink-0" />}
        {Math.abs(diff).toFixed(1).replace('.', ',')}%
      </span>
    );
  };

  return (
    <div className="space-y-6" id="financeiro-admin-container">
      {/* Filters Card */}
      <div className="bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#F7F4EF] pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4.5 h-4.5 text-[#E94F2F]" />
            <h3 className="font-black text-sm text-[#201A17] uppercase tracking-tight">Filtros e Parâmetros Analíticos</h3>
          </div>
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="text-xs font-bold text-[#E94F2F] hover:text-[#BD351C] flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-semibold">
          {/* Period Selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Período Fiscal</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="w-full p-2.5 rounded-xl border border-[#EADFD8] bg-[#F7F4EF]/35 focus:bg-white focus:border-[#E94F2F] outline-none text-xs font-bold"
            >
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="mes">Mês atual</option>
              <option value="custom">Período personalizado</option>
            </select>
          </div>

          {/* Custom Date Inputs (only shown when custom is selected) */}
          {period === 'custom' ? (
            <div className="md:col-span-1 grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Início</label>
                <input
                  type="date"
                  value={startDateStr}
                  max={endDateStr || undefined}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#EADFD8] bg-[#F7F4EF]/35 text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Término</label>
                <input
                  type="date"
                  value={endDateStr}
                  min={startDateStr || undefined}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#EADFD8] bg-[#F7F4EF]/35 text-xs font-bold"
                />
              </div>
            </div>
          ) : (
            <div className="hidden md:block col-span-1" />
          )}

          {/* City Selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Cidade de Atuação</label>
            <select
              value={cityFilter}
              onChange={(e) => {
                setCityFilter(e.target.value);
                setEstablishmentFilter('all'); // Reset shop filter on city switch
              }}
              className="w-full p-2.5 rounded-xl border border-[#EADFD8] bg-[#F7F4EF]/35 focus:bg-white focus:border-[#E94F2F] outline-none text-xs font-bold"
            >
              <option value="all">Todas as cidades</option>
              {cities.map(c => (
                <option key={c.id} value={c.id}>{c.name} - {c.state}</option>
              ))}
            </select>
          </div>

          {/* Establishment Selection */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Estabelecimento</label>
            <select
              value={establishmentFilter}
              onChange={(e) => setEstablishmentFilter(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-[#EADFD8] bg-[#F7F4EF]/35 focus:bg-white focus:border-[#E94F2F] outline-none text-xs font-bold"
            >
              <option value="all">Todos os parceiros</option>
              {establishments
                .filter(e => cityFilter === 'all' || e.cityId === cityFilter)
                .map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {loading ? (
        <div className="bg-white/60 backdrop-blur-xs py-20 rounded-3xl border border-[#EADFD8] flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-[#E94F2F] animate-spin" />
          <p className="text-xs text-[#756B66] font-black uppercase tracking-wider">Calculando Métricas e Agregações...</p>
        </div>
      ) : metrics ? (
        <>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Valor total movimentado */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider">Valor Movimentado</span>
                  <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded-lg">
                    <DollarSign className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-lg font-black text-[#201A17]">
                  R$ {metrics.summary.totalMovimentado.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-2 border-t border-[#F7F4EF]">
                {renderTrendBadge(metrics.summary.totalMovimentadoDiff)}
                <span className="text-[9px] text-[#756B66] font-bold">vs equivalent</span>
              </div>
            </div>

            {/* Pedidos concluídos */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider">Concluídos</span>
                  <div className="bg-[#E94F2F]/10 text-[#E94F2F] p-1.5 rounded-lg">
                    <ShoppingCart className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-lg font-black text-[#201A17]">{metrics.summary.pedidosConcluidos}</p>
              </div>
              <div className="flex items-center gap-1.5 pt-2 border-t border-[#F7F4EF]">
                {renderTrendBadge(metrics.summary.pedidosConcluidosDiff)}
                <span className="text-[9px] text-[#756B66] font-bold">vs equivalent</span>
              </div>
            </div>

            {/* Ticket médio */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider">Ticket Médio</span>
                  <div className="bg-blue-50 text-blue-600 p-1.5 rounded-lg">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-lg font-black text-[#201A17]">
                  R$ {metrics.summary.ticketMedio.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-2 border-t border-[#F7F4EF]">
                {renderTrendBadge(metrics.summary.ticketMedioDiff)}
                <span className="text-[9px] text-[#756B66] font-bold">vs equivalent</span>
              </div>
            </div>

            {/* Taxas de entrega */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider">Taxas de Entrega</span>
                  <div className="bg-amber-50 text-amber-600 p-1.5 rounded-lg">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-lg font-black text-[#201A17]">
                  R$ {metrics.summary.taxasEntrega.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-2 border-t border-[#F7F4EF]">
                {renderTrendBadge(metrics.summary.taxasEntregaDiff)}
                <span className="text-[9px] text-[#756B66] font-bold">vs equivalent</span>
              </div>
            </div>

            {/* Pedidos recebidos */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider">Recebidos</span>
                  <div className="bg-neutral-100 text-neutral-600 p-1.5 rounded-lg">
                    <ShoppingCart className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-lg font-black text-[#201A17]">{metrics.summary.pedidosRecebidos}</p>
              </div>
              <div className="flex items-center gap-1.5 pt-2 border-t border-[#F7F4EF]">
                {renderTrendBadge(metrics.summary.pedidosRecebidosDiff)}
                <span className="text-[9px] text-[#756B66] font-bold">vs equivalent</span>
              </div>
            </div>

            {/* Cancelados e recusados */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider">Perdas (Cancel/Recus)</span>
                  <div className="bg-rose-50 text-rose-600 p-1.5 rounded-lg">
                    <X className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-lg font-black text-rose-600">
                  {metrics.summary.cancelledRecusados} <span className="text-[10px] font-bold text-[#756B66]">({metrics.summary.cancelledRecusadosPct}%)</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 pt-2 border-t border-[#F7F4EF]">
                {renderTrendBadge(metrics.summary.cancelledRecusadosDiff)}
                <span className="text-[9px] text-[#756B66] font-bold">vs equivalent</span>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Time-Series Chart */}
            <div className="lg:col-span-2 bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm space-y-4">
              <div className="border-b border-[#F7F4EF] pb-3 flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-[#201A17] text-sm">Cronograma Diário de Faturamento</h4>
                  <p className="text-[10px] text-[#756B66] mt-0.5 font-bold">Valor diário de pedidos concluídos na plataforma</p>
                </div>
              </div>
              <div className="h-64 w-full text-[10px] font-bold">
                {timeseries.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    Nenhum faturamento registrado neste período.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#E94F2F" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#E94F2F" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1EAE4" />
                      <XAxis dataKey="date" stroke="#756B66" />
                      <YAxis stroke="#756B66" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #EADFD8', fontFamily: 'Inter' }}
                        formatter={(value: any) => [`R$ ${Number(value).toFixed(2).replace('.', ',')}`, 'Faturamento']}
                      />
                      <Area type="monotone" dataKey="value" stroke="#E94F2F" strokeWidth={2.5} fillOpacity={1} fill="url(#colorValue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Distributions column */}
            <div className="bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm flex flex-col justify-between gap-4">
              <div className="border-b border-[#F7F4EF] pb-3">
                <h4 className="font-extrabold text-[#201A17] text-sm">Fulfillment e Pagamentos</h4>
                <p className="text-[10px] text-[#756B66] mt-0.5 font-bold">Preferências e distribuição de consumo</p>
              </div>

              {/* Delivery distribution */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-[#756B66] uppercase tracking-wider leading-none">Modalidade de Encontro</p>
                <div className="space-y-2">
                  {metrics.distributions.fulfillment.map(item => (
                    <div key={item.id} className="space-y-1 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-[#201A17]">{item.label}</span>
                        <span className="text-[#756B66]">{item.count} pedidos ({item.pct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-[#F7F4EF] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#E94F2F] rounded-full transition-all duration-500" 
                          style={{ width: `${item.pct}%` }} 
                        />
                      </div>
                      <p className="text-[9px] text-[#756B66] text-right font-semibold">
                        Volume: R$ {item.value.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Methods distribution */}
              <div className="space-y-3 pt-3 border-t border-[#F7F4EF]">
                <p className="text-[10px] font-black text-[#756B66] uppercase tracking-wider leading-none">Formas de Pagamento</p>
                <div className="space-y-2">
                  {metrics.distributions.paymentMethods.map(item => (
                    <div key={item.id} className="space-y-1 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-[#201A17]">{item.label}</span>
                        <span className="text-[#756B66]">{item.pct}% ({item.count} un)</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#F7F4EF] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#FFBE5C] rounded-full transition-all duration-500" 
                          style={{ width: `${item.pct}%` }} 
                        />
                      </div>
                      <p className="text-[9px] text-[#756B66] text-right font-semibold">
                        Volume: R$ {item.value.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Operational Metrics Banner */}
          <div className="bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm">
            <div className="border-b border-[#F7F4EF] pb-3 mb-4">
              <h4 className="font-extrabold text-[#201A17] text-sm">Tempos de Resposta e Desempenho Operacional</h4>
              <p className="text-[10px] text-[#756B66] mt-0.5 font-bold">Média calculada para pedidos concluídos no fuso de Brasília</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
              <div className="bg-[#F7F4EF]/40 p-4 rounded-xl border border-[#EADFD8]/50 flex items-center gap-3">
                <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-[#756B66] uppercase leading-none">Tempo de Confirmação</p>
                  <p className="text-lg font-black text-[#201A17] mt-1">
                    {metrics.operational.tempoMedioConfirmacaoMinutes.toFixed(1).replace('.', ',')} min
                  </p>
                  <p className="text-[9px] text-[#756B66] font-semibold">Do recebimento ao aceite</p>
                </div>
              </div>

              <div className="bg-[#F7F4EF]/40 p-4 rounded-xl border border-[#EADFD8]/50 flex items-center gap-3">
                <div className="p-3 bg-[#E94F2F]/10 text-[#E94F2F] rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-[#756B66] uppercase leading-none">Tempo de Preparação</p>
                  <p className="text-lg font-black text-[#201A17] mt-1">
                    {metrics.operational.tempoMedioPreparacaoMinutes.toFixed(1).replace('.', ',')} min
                  </p>
                  <p className="text-[9px] text-[#756B66] font-semibold">Do aceite à disponibilização</p>
                </div>
              </div>

              <div className="bg-[#F7F4EF]/40 p-4 rounded-xl border border-[#EADFD8]/50 flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-[#756B66] uppercase leading-none">Tempo Total de Ciclo</p>
                  <p className="text-lg font-black text-[#201A17] mt-1">
                    {metrics.operational.tempoMedioTotalMinutes.toFixed(1).replace('.', ',')} min
                  </p>
                  <p className="text-[9px] text-[#756B66] font-semibold">Do clique à entrega final</p>
                </div>
              </div>
            </div>
          </div>

          {/* Ranking Table of Establishments */}
          <div className="bg-white rounded-3xl border border-[#EADFD8] shadow-sm overflow-hidden">
            <div className="p-5 border-b border-[#F7F4EF]">
              <h4 className="font-extrabold text-[#201A17] text-sm">Ranking de Faturamento dos Estabelecimentos</h4>
              <p className="text-[10px] text-[#756B66] mt-0.5 font-bold">Desempenho comercial e taxas de cancelamento/recusa</p>
            </div>
            <div className="overflow-x-auto text-xs font-semibold">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F7F4EF] border-b border-[#EADFD8] text-[9px] font-black text-[#756B66] uppercase tracking-wider">
                    <th className="py-3 px-4 cursor-pointer hover:bg-[#dfd7d0]" onClick={() => handleSort('name')}>
                      Estabelecimento
                    </th>
                    <th className="py-3 px-4">Cidade</th>
                    <th className="py-3 px-4 text-center cursor-pointer hover:bg-[#dfd7d0]" onClick={() => handleSort('ordersReceived')}>
                      Pedidos Rec.
                    </th>
                    <th className="py-3 px-4 text-center cursor-pointer hover:bg-[#dfd7d0]" onClick={() => handleSort('ordersCompleted')}>
                      Concluídos
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-[#dfd7d0]" onClick={() => handleSort('valueMoved')}>
                      Vol. Movimentado
                    </th>
                    <th className="py-3 px-4 text-right cursor-pointer hover:bg-[#dfd7d0]" onClick={() => handleSort('ticketAverage')}>
                      Ticket Médio
                    </th>
                    <th className="py-3 px-4 text-center cursor-pointer hover:bg-[#dfd7d0]" onClick={() => handleSort('completionRate')}>
                      Taxa Conclusão
                    </th>
                    <th className="py-3 px-4 text-right">Relatório</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F7F4EF] font-bold text-[#544B45]">
                  {sortedEsts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        Nenhum estabelecimento possui pedidos registrados neste período.
                      </td>
                    </tr>
                  ) : (
                    sortedEsts.map((est) => (
                      <tr key={est.id} className="hover:bg-[#F7F4EF]/20 transition-colors">
                        <td className="py-4 px-4">
                          <div className="text-[#201A17] font-black">{est.name}</div>
                          <div className="text-[9px] font-semibold mt-0.5 flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${est.active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            <span className="text-[#756B66] uppercase">{est.status}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-neutral-500 font-medium">{est.city}</td>
                        <td className="py-4 px-4 text-center text-neutral-800">{est.ordersReceived}</td>
                        <td className="py-4 px-4 text-center text-emerald-700">{est.ordersCompleted}</td>
                        <td className="py-4 px-4 text-right text-emerald-800">
                          R$ {est.valueMoved.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="py-4 px-4 text-right text-[#201A17]">
                          R$ {est.ticketAverage.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            est.completionRate > 85 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                            est.completionRate > 60 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                            'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}>
                            {est.completionRate.toFixed(1).replace('.', ',')}%
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => fetchEstDetails(est.id, est.name)}
                            className="p-1.5 bg-[#F7F4EF] hover:bg-[#201A17] text-[#201A17] hover:text-[#FFBE5C] rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[10px] uppercase font-black"
                          >
                            <span>Detalhar</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white py-12 rounded-3xl border border-[#EADFD8] text-center text-[#756B66] font-semibold">
          Nenhum dado encontrado para os filtros selecionados.
        </div>
      )}

      {/* Financial Disclaimer */}
      <div className="bg-amber-50/45 p-4 rounded-2xl border border-amber-200 flex items-start gap-3 text-amber-900 shadow-xs">
        <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed font-semibold">
          <strong className="font-extrabold uppercase tracking-wide">Aviso Legal de Cobrança:</strong> Os valores apresentados são calculados a partir dos pedidos registrados como concluídos. O pagamento é realizado diretamente ao estabelecimento e não é processado pelo UaiPertim.
        </p>
      </div>

      {/* Establishment Detailed Report Modal */}
      {selectedEstId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto" id="est-detailed-report-modal">
          <div className="bg-white w-full max-w-4xl rounded-3xl border border-[#EADFD8] shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#F7F4EF] flex items-center justify-between bg-[#F7F4EF]/40 rounded-t-3xl">
              <div>
                <span className="text-[9px] font-black text-[#E94F2F] uppercase tracking-wider">Detalhamento Financeiro</span>
                <h3 className="text-base font-black text-[#201A17]">{selectedEstName}</h3>
              </div>
              <button
                onClick={() => setSelectedEstId(null)}
                className="p-2 hover:bg-neutral-200/50 rounded-xl transition-colors text-neutral-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 text-[#E94F2F] animate-spin" />
                  <p className="text-xs text-[#756B66] font-black uppercase tracking-wider">Agregando produtos e bairros...</p>
                </div>
              ) : detailData ? (
                <>
                  {/* KPI card row for single store */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#F7F4EF]/25 p-4 rounded-xl border border-[#EADFD8]/40">
                      <p className="text-[9px] text-[#756B66] font-black uppercase leading-none">Valor Movimentado</p>
                      <p className="text-lg font-black text-emerald-800 mt-2">
                        R$ {detailData.summary.totalMovimentado.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div className="bg-[#F7F4EF]/25 p-4 rounded-xl border border-[#EADFD8]/40">
                      <p className="text-[9px] text-[#756B66] font-black uppercase leading-none">Pedidos Concluídos</p>
                      <p className="text-lg font-black text-[#201A17] mt-2">
                        {detailData.summary.pedidosConcluidos}
                      </p>
                    </div>
                    <div className="bg-[#F7F4EF]/25 p-4 rounded-xl border border-[#EADFD8]/40">
                      <p className="text-[9px] text-[#756B66] font-black uppercase leading-none">Ticket Médio</p>
                      <p className="text-lg font-black text-[#201A17] mt-2">
                        R$ {detailData.summary.ticketMedio.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div className="bg-[#F7F4EF]/25 p-4 rounded-xl border border-[#EADFD8]/40">
                      <p className="text-[9px] text-[#756B66] font-black uppercase leading-none">Taxas de Entrega</p>
                      <p className="text-lg font-black text-amber-700 mt-2">
                        R$ {detailData.summary.taxasEntrega.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  </div>

                  {/* Two columns: 1. Products Sold Ranking, 2. Neighborhood Delivery performance */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Products sold ranking */}
                    <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] space-y-4">
                      <div className="flex items-center gap-2 border-b border-[#F7F4EF] pb-2">
                        <Award className="w-4.5 h-4.5 text-[#FFBE5C]" />
                        <h4 className="font-extrabold text-[#201A17] text-xs uppercase tracking-tight">Produtos Mais Vendidos (Top 10)</h4>
                      </div>
                      <div className="space-y-3">
                        {detailData.products.length === 0 ? (
                          <p className="text-xs text-[#756B66] italic">Nenhum produto vendido registrado no período.</p>
                        ) : (
                          detailData.products.map((p, idx) => (
                            <div key={p.id} className="text-xs flex items-center justify-between font-bold">
                              <div className="flex items-center gap-2 max-w-[70%]">
                                <span className="bg-[#F7F4EF] text-[#201A17] text-[10px] w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="text-[#201A17] truncate">{p.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[#201A17]">{p.quantity} un</span>
                                <span className="text-[9px] text-[#756B66] block font-semibold">R$ {p.value.toFixed(2).replace('.', ',')}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Delivery neighborhoods performance */}
                    <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] space-y-4">
                      <div className="flex items-center gap-2 border-b border-[#F7F4EF] pb-2">
                        <Map className="w-4.5 h-4.5 text-[#E94F2F]" />
                        <h4 className="font-extrabold text-[#201A17] text-xs uppercase tracking-tight">Desempenho por Bairro de Entrega</h4>
                      </div>
                      <div className="space-y-3">
                        {detailData.neighborhoods.length === 0 ? (
                          <p className="text-xs text-[#756B66] italic">Nenhuma entrega registrada para bairros no período.</p>
                        ) : (
                          detailData.neighborhoods.map((n) => (
                            <div key={n.name} className="text-xs font-bold space-y-1">
                              <div className="flex justify-between items-center text-[#201A17]">
                                <span className="truncate max-w-[60%]">{n.name}</span>
                                <span>{n.count} entrega(s)</span>
                              </div>
                              <div className="flex justify-between items-center text-[9px] text-[#756B66] font-semibold leading-none">
                                <span>Taxa média: R$ {n.avgDeliveryFee.toFixed(2).replace('.', ',')}</span>
                                <span>Total Movido: R$ {n.value.toFixed(2).replace('.', ',')}</span>
                              </div>
                              <div className="border-b border-[#F7F4EF] pt-1" />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Operational Metrics specific to store */}
                  <div className="bg-white p-4 rounded-2xl border border-[#EADFD8]">
                    <div className="flex items-center gap-2 border-b border-[#F7F4EF] pb-2 mb-3">
                      <Clock className="w-4.5 h-4.5 text-blue-600" />
                      <h4 className="font-extrabold text-[#201A17] text-xs uppercase tracking-tight">Desempenho de Tempos da Loja</h4>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-xs font-semibold">
                      <div className="bg-[#F7F4EF]/25 p-3 rounded-lg text-center">
                        <p className="text-[9px] text-[#756B66] uppercase leading-none">Confirmação Média</p>
                        <p className="text-base font-black text-[#201A17] mt-1.5">
                          {detailData.operational.tempoMedioConfirmacaoMinutes.toFixed(1).replace('.', ',')} min
                        </p>
                      </div>
                      <div className="bg-[#F7F4EF]/25 p-3 rounded-lg text-center">
                        <p className="text-[9px] text-[#756B66] uppercase leading-none">Preparação Média</p>
                        <p className="text-base font-black text-[#201A17] mt-1.5">
                          {detailData.operational.tempoMedioPreparacaoMinutes.toFixed(1).replace('.', ',')} min
                        </p>
                      </div>
                      <div className="bg-[#F7F4EF]/25 p-3 rounded-lg text-center">
                        <p className="text-[9px] text-[#756B66] uppercase leading-none">Taxa de Conclusão</p>
                        <p className="text-base font-black text-emerald-800 mt-1.5">
                          {detailData.operational.taxaConclusao.toFixed(1).replace('.', ',')}%
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-center py-8 text-neutral-500 font-semibold">Nenhum detalhe pôde ser carregado.</p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#F7F4EF] flex justify-end">
              <button
                onClick={() => setSelectedEstId(null)}
                className="px-5 py-2.5 bg-[#EADFD8] hover:bg-[#DFD3C9] text-[#201A17] rounded-xl font-bold transition-colors text-xs cursor-pointer"
              >
                Fechar Relatório
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
