import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, ShoppingCart, Percent, Award, ArrowUpRight, ArrowDownRight, 
  Calendar, MapPin, TrendingUp, X, Clock, Map, Sparkles, Filter, RefreshCw 
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

interface ProductDetail {
  id: string;
  name: string;
  quantity: number;
  value: number | null;
  participationPct: number;
}

interface NeighborhoodDetail {
  name: string;
  count: number;
  value: number;
  deliveryFeeSum: number;
  avgDeliveryFee: number;
}

interface DeliveryMeta {
  totalDeliveryOrders: number;
  legacyWithoutNeighborhoodCount: number;
}

interface FinanceiroEstabelecimentoProps {
  merchantId: string;
}

function getSaoPauloDateString(date: Date): string {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  return `${year}-${month}-${day}`;
}

function getSaoPauloDateFromYMD(ymdStr: string, timeSuffix: string): Date {
  return new Date(`${ymdStr}T${timeSuffix}-03:00`);
}

export const FinanceiroEstabelecimento: React.FC<FinanceiroEstabelecimentoProps> = ({ merchantId }) => {
  const { showToast } = useApp();

  // Filter States
  const [period, setPeriod] = useState<'7d' | '30d' | 'mes' | 'custom'>('7d');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');

  // Data States
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [timeseries, setTimeseries] = useState<Array<{ date: string; count: number; value: number }>>([]);
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDetail[]>([]);
  const [deliveryMeta, setDeliveryMeta] = useState<DeliveryMeta | null>(null);

  // Compute actual date objects based on selected preset in America/Sao_Paulo timezone
  const calculatedDates = useMemo(() => {
    const todayYMD = getSaoPauloDateString(new Date());

    if (period === '7d') {
      const end = getSaoPauloDateFromYMD(todayYMD, "23:59:59.999");
      const endDateObj = getSaoPauloDateFromYMD(todayYMD, "00:00:00");
      const startDateObj = new Date(endDateObj.getTime() - 6 * 24 * 60 * 60 * 1000);
      const startYMD = getSaoPauloDateString(startDateObj);
      const start = getSaoPauloDateFromYMD(startYMD, "00:00:00");
      return { start, end };
    } else if (period === '30d') {
      const end = getSaoPauloDateFromYMD(todayYMD, "23:59:59.999");
      const endDateObj = getSaoPauloDateFromYMD(todayYMD, "00:00:00");
      const startDateObj = new Date(endDateObj.getTime() - 29 * 24 * 60 * 60 * 1000);
      const startYMD = getSaoPauloDateString(startDateObj);
      const start = getSaoPauloDateFromYMD(startYMD, "00:00:00");
      return { start, end };
    } else if (period === 'mes') {
      const parts = todayYMD.split('-');
      const firstDayYMD = `${parts[0]}-${parts[1]}-01`;
      const start = getSaoPauloDateFromYMD(firstDayYMD, "00:00:00");
      const end = getSaoPauloDateFromYMD(todayYMD, "23:59:59.999");
      return { start, end };
    } else { // custom
      const start = getSaoPauloDateFromYMD(startDateStr || todayYMD, "00:00:00");
      const end = getSaoPauloDateFromYMD(endDateStr || todayYMD, "23:59:59.999");
      return { start, end };
    }
  }, [period, startDateStr, endDateStr]);

  // Set default custom dates on mount
  useEffect(() => {
    const todayYMD = getSaoPauloDateString(new Date());
    const endDateObj = getSaoPauloDateFromYMD(todayYMD, "00:00:00");
    const startDateObj = new Date(endDateObj.getTime() - 6 * 24 * 60 * 60 * 1000);
    const startYMD = getSaoPauloDateString(startDateObj);
    setStartDateStr(startYMD);
    setEndDateStr(todayYMD);
  }, []);

  const fetchData = async () => {
    if (!merchantId) return;
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

      // Fetch overview and distributions
      const overviewRes = await fetch(`/api/merchant/analytics/overview?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!overviewRes.ok) throw new Error(await overviewRes.text());
      const overviewData = await overviewRes.json();
      setMetrics(overviewData);

      // Fetch timeseries
      const timeseriesRes = await fetch(`/api/merchant/analytics/timeseries?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!timeseriesRes.ok) throw new Error(await timeseriesRes.text());
      const tsData = await timeseriesRes.json();
      setTimeseries(tsData.timeseries || []);

      // Fetch products and neighborhoods list
      const productsRes = await fetch(`/api/merchant/analytics/products?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!productsRes.ok) throw new Error(await productsRes.text());
      const prodData = await productsRes.json();
      setProducts(prodData.products || []);
      setNeighborhoods(prodData.neighborhoods || []);
      setDeliveryMeta(prodData.meta || null);

    } catch (error: any) {
      console.error('Error fetching merchant analytics:', error);
      showToast(error.message || 'Erro ao carregar dados financeiros.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Trigger fetch on filter change
  useEffect(() => {
    if (period !== 'custom' || (startDateStr && endDateStr)) {
      fetchData();
    }
  }, [period, startDateStr, endDateStr, merchantId]);

  // Render trend indicator badges
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
    <div className="space-y-6" id="financeiro-merchant-container">
      {/* Date Filters Card */}
      <div className="bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#F7F4EF] pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4.5 h-4.5 text-[#E94F2F]" />
            <h3 className="font-black text-sm text-[#201A17] uppercase tracking-tight">Período de Análise Financeira</h3>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold">
          {/* Preset Period */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Período Comercial</label>
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

          {/* Custom Date Pickers */}
          {period === 'custom' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Data Inicial</label>
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[#EADFD8] focus:border-[#E94F2F] outline-none font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Data Final</label>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  min={startDateStr || undefined}
                  className="w-full p-2 rounded-xl border border-[#EADFD8] focus:border-[#E94F2F] outline-none font-bold"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {loading && !metrics ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3 bg-white rounded-3xl border border-[#EADFD8]">
          <RefreshCw className="w-8 h-8 text-[#E94F2F] animate-spin" />
          <p className="text-xs font-bold text-[#756B66]">Processando base de dados financeira...</p>
        </div>
      ) : metrics ? (
        <>
          {/* Main Financial Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Card 1: VALOR MOVIMENTADO */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider leading-none">VALOR MOVIMENTADO</span>
                <p className="text-lg font-black text-[#201A17] mt-1">
                  R$ {metrics.summary.totalMovimentado.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-[#F7F4EF] pt-1.5 mt-auto">
                <span className="text-[8px] text-[#756B66] font-bold">vs. período anterior</span>
                {renderTrendBadge(metrics.summary.totalMovimentadoDiff)}
              </div>
            </div>

            {/* Card 2: VALOR DOS PEDIDOS CONCLUÍDOS */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider leading-none">PEDIDOS CONCLUÍDOS</span>
                <p className="text-lg font-black text-[#201A17] mt-1">
                  {metrics.summary.pedidosConcluidos}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-[#F7F4EF] pt-1.5 mt-auto">
                <span className="text-[8px] text-[#756B66] font-bold">vs. período anterior</span>
                {renderTrendBadge(metrics.summary.pedidosConcluidosDiff)}
              </div>
            </div>

            {/* Card 3: Ticket Médio */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider leading-none">Ticket Médio</span>
                <p className="text-lg font-black text-[#201A17] mt-1">
                  R$ {metrics.summary.ticketMedio.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-[#F7F4EF] pt-1.5 mt-auto">
                <span className="text-[8px] text-[#756B66] font-bold">vs. período anterior</span>
                {renderTrendBadge(metrics.summary.ticketMedioDiff)}
              </div>
            </div>

            {/* Card 4: TAXA DE ENTREGA COBRADA */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider leading-none">TAXA DE ENTREGA COBRADA</span>
                <p className="text-lg font-black text-[#201A17] mt-1">
                  R$ {metrics.summary.taxasEntrega.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-[#F7F4EF] pt-1.5 mt-auto">
                <span className="text-[8px] text-[#756B66] font-bold">vs. período anterior</span>
                {renderTrendBadge(metrics.summary.taxasEntregaDiff)}
              </div>
            </div>

            {/* Card 5: DESCONTO APLICADO */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider leading-none">DESCONTO APLICADO</span>
                <p className="text-lg font-black text-rose-600 mt-1">
                  R$ {metrics.summary.descontos.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-[#F7F4EF] pt-1.5 mt-auto">
                <span className="text-[8px] text-[#756B66] font-bold">vs. período anterior</span>
                {renderTrendBadge(metrics.summary.descontosDiff)}
              </div>
            </div>

            {/* Card 6: Pedidos Recebidos */}
            <div className="bg-white p-4 rounded-2xl border border-[#EADFD8] flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[9px] font-black text-[#756B66] uppercase tracking-wider leading-none">Pedidos Recebidos</span>
                <p className="text-lg font-black text-amber-600 mt-1">
                  {metrics.summary.pedidosRecebidos}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-[#F7F4EF] pt-1.5 mt-auto">
                <span className="text-[8px] text-[#756B66] font-bold">vs. período anterior</span>
                {renderTrendBadge(metrics.summary.pedidosRecebidosDiff)}
              </div>
            </div>
          </div>

          {/* Charts & Logistics Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Timeseries Sales Evolution */}
            <div className="lg:col-span-2 bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm space-y-3">
              <div>
                <h4 className="font-extrabold text-[#201A17] text-sm">Evolução do Volume Total Concluído</h4>
                <p className="text-[10px] text-[#756B66] font-semibold">Exclusivo para volume total de pedidos concluídos</p>
              </div>
              <div className="h-64 w-full">
                {timeseries.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-[#756B66] italic">
                    Sem movimentações financeiras para exibir o gráfico.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeseries}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#E94F2F" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#E94F2F" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EAE5" />
                      <XAxis dataKey="date" stroke="#756B66" fontSize={9} fontWeight="bold" tickLine={false} />
                      <YAxis 
                        stroke="#756B66" 
                        fontSize={9} 
                        fontWeight="bold" 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(value) => `R$ ${value}`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#201A17', borderRadius: '12px', border: 'none', color: '#fff' }}
                        labelStyle={{ fontWeight: 'bold', fontSize: '10px' }}
                        itemStyle={{ fontSize: '10px', color: '#FFBE5C', fontWeight: 'black' }}
                        formatter={(value: any) => [`R$ ${Number(value).toFixed(2).replace('.', ',')}`, 'Volume Concluído']}
                      />
                      <Area type="monotone" dataKey="value" stroke="#E94F2F" strokeWidth={2.5} fillOpacity={1} fill="url(#colorValue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Logistics Distributions */}
            <div className="bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm flex flex-col justify-between space-y-6">
              <div>
                <h4 className="font-extrabold text-[#201A17] text-sm">Canais de Entrega e Meios</h4>
                <p className="text-[10px] text-[#756B66] font-semibold">Distribuição por volume total concluído e quantidade</p>
              </div>

              {/* Fulfillment (Delivery vs Pickup) */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-[#756B66] uppercase tracking-wider leading-none">Modalidade de Entrega</p>
                <div className="space-y-2">
                  {metrics.distributions.fulfillment.map(item => (
                    <div key={item.id} className="space-y-1 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-[#201A17]">{item.label}</span>
                        <span className="text-[#756B66]">{item.count} un ({item.pct}%)</span>
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

              {/* Payment Methods */}
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

          {/* Operational Metrics specific to store */}
          <div className="bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm">
            <div className="border-b border-[#F7F4EF] pb-3 mb-4">
              <h4 className="font-extrabold text-[#201A17] text-sm">Tempos de Aceite e Desempenho Interno</h4>
              <p className="text-[10px] text-[#756B66] mt-0.5 font-bold">Métricas operacionais calculadas com base na esteira de produção</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
              <div className="bg-[#F7F4EF]/40 p-4 rounded-xl border border-[#EADFD8]/50 flex items-center gap-3">
                <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-[#756B66] uppercase leading-none">Aceite Médio do Pedido</p>
                  <p className="text-lg font-black text-[#201A17] mt-1">
                    {metrics.operational.tempoMedioConfirmacaoMinutes.toFixed(1).replace('.', ',')} min
                  </p>
                  <p className="text-[9px] text-[#756B66] font-semibold">Intervalo para confirmação da loja</p>
                </div>
              </div>

              <div className="bg-[#F7F4EF]/40 p-4 rounded-xl border border-[#EADFD8]/50 flex items-center gap-3">
                <div className="p-3 bg-[#E94F2F]/10 text-[#E94F2F] rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-[#756B66] uppercase leading-none">Tempo Médio de Preparo</p>
                  <p className="text-lg font-black text-[#201A17] mt-1">
                    {metrics.operational.tempoMedioPreparacaoMinutes.toFixed(1).replace('.', ',')} min
                  </p>
                  <p className="text-[9px] text-[#756B66] font-semibold">Do aceite à expedição/entrega</p>
                </div>
              </div>

              <div className="bg-[#F7F4EF]/40 p-4 rounded-xl border border-[#EADFD8]/50 flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-[#756B66] uppercase leading-none">Tempo Médio de Ciclo</p>
                  <p className="text-lg font-black text-[#201A17] mt-1">
                    {metrics.operational.tempoMedioTotalMinutes.toFixed(1).replace('.', ',')} min
                  </p>
                  <p className="text-[9px] text-[#756B66] font-semibold">Do clique à conclusão final</p>
                </div>
              </div>
            </div>
          </div>

          {/* Two-Column Product and Neighborhood Sales Report */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Products Sales */}
            <div className="bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[#F7F4EF] pb-3">
                <Award className="w-4.5 h-4.5 text-[#FFBE5C]" />
                <div>
                  <h4 className="font-extrabold text-[#201A17] text-sm">Ranking de Produtos Mais Vendidos (Top 15)</h4>
                  <p className="text-[10px] text-[#756B66] mt-0.5 font-bold">Distribuição por volume total concluído e quantidade</p>
                </div>
              </div>
              <div className="space-y-3">
                {products.length === 0 ? (
                  <p className="text-xs text-[#756B66] italic">Nenhum produto faturado neste fuso.</p>
                ) : (
                  products.map((p, idx) => (
                    <div key={p.id} className="text-xs flex items-center justify-between font-bold">
                      <div className="flex items-center gap-2 max-w-[70%]">
                        <span className="bg-[#F7F4EF] text-[#201A17] text-[10px] w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-[#201A17] truncate">{p.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[#201A17]">{p.quantity} un</span>
                        <span className="text-[9px] text-[#756B66] block font-semibold">
                          {p.value !== null ? `R$ ${p.value.toFixed(2).replace('.', ',')}` : 'Valor indisponível'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Neighborhoods Delivery */}
            <div className="bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-[#F7F4EF] pb-3">
                <Map className="w-4.5 h-4.5 text-[#E94F2F]" />
                <div>
                  <h4 className="font-extrabold text-[#201A17] text-sm">Ranking de Entregas por Bairro</h4>
                  <p className="text-[10px] text-[#756B66] mt-0.5 font-bold">Bairros de maior recorrência logística</p>
                </div>
              </div>

              {deliveryMeta && deliveryMeta.totalDeliveryOrders > 0 && (
                <div className="text-[10px] text-amber-800 bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/50 font-bold leading-relaxed">
                  Total de entregas: {deliveryMeta.totalDeliveryOrders} ({deliveryMeta.totalDeliveryOrders - deliveryMeta.legacyWithoutNeighborhoodCount} com bairro identificado, {deliveryMeta.legacyWithoutNeighborhoodCount} pedido(s) legado(s) sem bairro).
                </div>
              )}

              <div className="space-y-3">
                {neighborhoods.length === 0 ? (
                  <p className="text-xs text-[#756B66] italic">Nenhuma entrega registrada para bairros no período.</p>
                ) : (
                  neighborhoods.map((n) => (
                    <div key={n.name} className="text-xs font-bold space-y-1">
                      <div className="flex justify-between items-center text-[#201A17]">
                        <span className="truncate max-w-[65%]">{n.name}</span>
                        <span>{n.count} entregas</span>
                      </div>
                      <div className="flex justify-between items-center text-[9px] text-[#756B66] font-semibold leading-none">
                        <span>Taxa média: R$ {n.avgDeliveryFee.toFixed(2).replace('.', ',')}</span>
                        <span>Total Faturado: R$ {n.value.toFixed(2).replace('.', ',')}</span>
                      </div>
                      <div className="border-b border-[#F7F4EF] pt-1" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white py-12 rounded-3xl border border-[#EADFD8] text-center text-[#756B66] font-semibold">
          Nenhum faturamento registrado para esta filial no período.
        </div>
      )}

      {/* Financial Disclaimer Banner */}
      <div className="bg-amber-50/45 p-4 rounded-2xl border border-amber-200 flex items-start gap-3 text-amber-900 shadow-xs">
        <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] leading-relaxed font-semibold">
          <strong className="font-extrabold uppercase tracking-wide">Aviso de Recebimento de Valores:</strong> Os valores apresentados são calculados a partir dos pedidos registrados como concluídos. O pagamento é realizado diretamente ao estabelecimento e não é processado pelo UaiPertim.
        </p>
      </div>
    </div>
  );
};
