import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, Loader2, Send, Check, AlertCircle, EyeOff, Eye } from 'lucide-react';
import { reviewService } from '../../services/reviewService';
import { Review } from '../../types';
import { formatOrderDateTime } from '../../utils/dateUtils';

interface MerchantReviewsProps {
  establishmentId: string;
  merchantName: string;
}

export const MerchantReviews: React.FC<MerchantReviewsProps> = ({ establishmentId, merchantName }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'under_review' | 'hidden'>('all');

  // Reply state
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyLoading, setReplyLoading] = useState<Record<string, boolean>>({});

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await reviewService.getMerchantReviews(establishmentId);
      setReviews(data);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar as avaliações.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [establishmentId]);

  const handleSendReply = async (orderId: string) => {
    const text = replyText[orderId]?.trim();
    if (!text) return;

    setReplyLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      await reviewService.submitMerchantReply(
        orderId,
        text,
        establishmentId, // use establishmentId as the uid / repliedByUid
        merchantName
      );
      
      // Update local state
      setReviews(prev => prev.map(r => {
        if (r.id === orderId) {
          return {
            ...r,
            merchantReply: {
              text,
              repliedAt: new Date().toISOString(),
              repliedByUid: establishmentId,
              repliedByName: merchantName
            }
          };
        }
        return r;
      }));

      // Clear text
      setReplyText(prev => ({ ...prev, [orderId]: '' }));
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar resposta. Verifique as permissões.");
    } finally {
      setReplyLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  // Math aggregates from reviews
  const publishedReviews = reviews.filter(r => r.status === 'published');
  const totalCount = publishedReviews.length;
  
  const averageRating = totalCount > 0 
    ? Number((publishedReviews.reduce((sum, r) => sum + r.overallRating, 0) / totalCount).toFixed(2))
    : 0;

  // Criteria averages
  const getCriteriaAverage = (field: 'productQualityRating' | 'serviceRating' | 'deliveryTimeRating') => {
    const filtered = publishedReviews.filter(r => typeof r[field] === 'number');
    if (filtered.length === 0) return 0;
    return Number((filtered.reduce((sum, r) => sum + (r[field] as number), 0) / filtered.length).toFixed(1));
  };

  const qualityAverage = getCriteriaAverage('productQualityRating');
  const serviceAverage = getCriteriaAverage('serviceRating');
  const deliveryAverage = getCriteriaAverage('deliveryTimeRating');

  // Distribution chart
  const distribution = [5, 4, 3, 2, 1].map(stars => {
    const count = publishedReviews.filter(r => r.overallRating === stars).length;
    const percentage = totalCount > 0 ? (count / totalCount) * 100 : 0;
    return { stars, count, percentage };
  });

  // Filter reviews
  const filteredReviews = reviews.filter(r => {
    const matchRating = ratingFilter === 'all' || r.overallRating === ratingFilter;
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchRating && matchStatus;
  });

  return (
    <div className="space-y-6">
      
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Main rating score card */}
        <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 flex flex-col justify-between space-y-4 shadow-xs">
          <h3 className="font-extrabold text-sm text-[#756B66] uppercase tracking-wider">Pontuação Geral</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-[#201A17]">{averageRating || '0.0'}</span>
            <span className="text-sm font-bold text-[#756B66]">/ 5.0</span>
          </div>
          <div className="flex items-center gap-1 text-amber-400">
            {[1, 2, 3, 4, 5].map(s => (
              <Star 
                key={s} 
                className={`w-5 h-5 ${s <= Math.round(averageRating) ? 'fill-amber-400' : 'text-gray-200 fill-transparent'}`} 
              />
            ))}
            <span className="text-xs font-bold text-[#756B66] ml-2">({totalCount} avaliações publicadas)</span>
          </div>
        </div>

        {/* Detailed Criteria */}
        <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 space-y-4 shadow-xs">
          <h3 className="font-extrabold text-sm text-[#756B66] uppercase tracking-wider">Métricas Detalhadas</h3>
          
          <div className="space-y-3">
            {/* Quality */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-[#5C534E]">
                <span>Qualidade dos Produtos</span>
                <span className="font-black text-[#201A17]">{qualityAverage || '--'}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${(qualityAverage / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* Service */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-[#5C534E]">
                <span>Atendimento</span>
                <span className="font-black text-[#201A17]">{serviceAverage || '--'}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${(serviceAverage / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* Delivery/Prep time */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-[#5C534E]">
                <span>Tempo de Entrega/Preparo</span>
                <span className="font-black text-[#201A17]">{deliveryAverage || '--'}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-orange-400 rounded-full transition-all duration-500"
                  style={{ width: `${(deliveryAverage / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Distribution list */}
        <div className="bg-white rounded-3xl border border-[#EADFD8] p-6 space-y-2.5 shadow-xs">
          <h3 className="font-extrabold text-sm text-[#756B66] uppercase tracking-wider mb-2">Distribuição de Notas</h3>
          
          {distribution.map(item => (
            <div key={item.stars} className="flex items-center gap-3 text-xs font-semibold text-[#5C534E]">
              <span className="w-3 text-right">{item.stars}</span>
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
              
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${item.percentage}%` }}
                />
              </div>

              <span className="w-8 text-right text-[10px] font-bold text-[#756B66]">{item.count}</span>
            </div>
          ))}
        </div>

      </div>

      {/* Filter and Content Controls */}
      <div className="bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]/40 flex flex-wrap gap-4 items-center justify-between">
        
        {/* Rating selectors */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase text-[#756B66] tracking-wider mr-2">Filtrar nota:</span>
          <button
            onClick={() => setRatingFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
              ratingFilter === 'all'
                ? 'bg-[#E94F2F] text-white border-transparent'
                : 'bg-white border-[#EADFD8] text-[#5C534E] hover:bg-[#F2ECE4]'
            }`}
          >
            Todas
          </button>
          {[5, 4, 3, 2, 1].map(star => (
            <button
              key={star}
              onClick={() => setRatingFilter(star)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center gap-1 ${
                ratingFilter === star
                  ? 'bg-[#E94F2F] text-white border-transparent'
                  : 'bg-white border-[#EADFD8] text-[#5C534E] hover:bg-[#F2ECE4]'
              }`}
            >
              <span>{star}</span>
              <Star className="w-3 h-3 fill-current shrink-0" />
            </button>
          ))}
        </div>

        {/* Status filters */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase text-[#756B66] tracking-wider mr-2">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-white border border-[#EADFD8] focus:border-[#E94F2F] rounded-xl px-3 py-2 text-xs font-bold text-[#201A17] focus:outline-none"
          >
            <option value="all">Todos os Status</option>
            <option value="published">Publicadas</option>
            <option value="under_review">Em Moderação</option>
            <option value="hidden">Ocultadas</option>
          </select>
        </div>

      </div>

      {/* Review list */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-white rounded-3xl border border-[#EADFD8]">
          <Loader2 className="w-8 h-8 text-[#E94F2F] animate-spin" />
          <p className="text-xs font-bold text-[#756B66]">Carregando avaliações...</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-[#EADFD8] p-8 space-y-3">
          <div className="bg-orange-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto text-[#E94F2F] border border-orange-100">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-extrabold text-base text-[#201A17]">Nenhuma avaliação encontrada</h4>
            <p className="text-xs text-[#756B66] max-w-sm mx-auto font-semibold">
              Você ainda não recebeu avaliações que correspondam aos filtros selecionados.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReviews.map((review) => {
            const hasCriteria = typeof review.productQualityRating === 'number' ||
                                typeof review.serviceRating === 'number' ||
                                typeof review.deliveryTimeRating === 'number';

            const statusStyles = {
              published: 'bg-emerald-50 text-emerald-800 border-emerald-200',
              under_review: 'bg-amber-50 text-amber-800 border-amber-200',
              hidden: 'bg-gray-50 text-gray-700 border-gray-200'
            };

            const statusLabels = {
              published: 'Publicada',
              under_review: 'Em Moderação',
              hidden: 'Ocultada'
            };

            return (
              <div 
                key={review.id} 
                className="bg-white rounded-3xl border border-[#EADFD8] p-5 space-y-4 shadow-2xs relative"
              >
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F7F4EF] pb-3.5">
                  <div>
                    <h4 className="font-extrabold text-sm text-[#201A17]">{review.customerName}</h4>
                    <p className="text-[10px] text-[#756B66] font-bold">
                      Pedido #{review.orderId.slice(-6).toUpperCase()} • {formatOrderDateTime(review.createdAt)}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${statusStyles[review.status]}`}>
                      {statusLabels[review.status]}
                    </span>

                    {/* Overall Score Star Badge */}
                    <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[10px] font-black flex items-center gap-1">
                      <span>{review.overallRating}</span>
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                    </span>
                  </div>
                </div>

                {/* Optional Detailed Scores */}
                {hasCriteria && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-bold text-[#756B66] bg-[#F7F4EF]/30 px-3 py-2 rounded-xl">
                    {typeof review.productQualityRating === 'number' && (
                      <span className="flex items-center gap-1">
                        Qualidade: <strong className="text-[#201A17]">{review.productQualityRating}/5</strong>
                      </span>
                    )}
                    {typeof review.serviceRating === 'number' && (
                      <span className="flex items-center gap-1">
                        Atendimento: <strong className="text-[#201A17]">{review.serviceRating}/5</strong>
                      </span>
                    )}
                    {typeof review.deliveryTimeRating === 'number' && (
                      <span className="flex items-center gap-1">
                        Tempo de entrega: <strong className="text-[#201A17]">{review.deliveryTimeRating}/5</strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Comment & Tags */}
                <div className="space-y-2">
                  {review.tags && review.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {review.tags.map(t => (
                        <span 
                          key={t} 
                          className="px-2 py-0.5 bg-gray-50 text-gray-700 border border-gray-100 rounded-md text-[9px] font-black"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {review.comment ? (
                    <p className="text-xs font-semibold text-[#5C534E] leading-relaxed italic bg-stone-50/70 p-3.5 rounded-2xl border border-stone-100">
                      "{review.comment}"
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-gray-400 italic">Sem comentário escrito.</p>
                  )}
                </div>

                {/* Merchant Reply Section */}
                {review.merchantReply ? (
                  <div className="ml-4 sm:ml-8 bg-[#F7F4EF]/50 border-l-2 border-[#E94F2F] p-4 rounded-r-3xl rounded-bl-3xl space-y-1.5">
                    <div className="flex items-center justify-between gap-2 border-b border-[#EADFD8]/40 pb-1.5">
                      <span className="text-[10px] font-black uppercase text-[#E94F2F] tracking-wider">
                        Sua Resposta
                      </span>
                      <span className="text-[9px] text-[#756B66] font-bold">
                        {formatOrderDateTime(review.merchantReply.repliedAt)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#5C534E] leading-relaxed">
                      {review.merchantReply.text}
                    </p>
                  </div>
                ) : (
                  // Reply input for Merchant
                  <div className="ml-4 sm:ml-8 pt-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replyText[review.id] || ''}
                        onChange={(e) => setReplyText(prev => ({ ...prev, [review.id]: e.target.value.slice(0, 300) }))}
                        placeholder="Escreva uma resposta pública para o cliente..."
                        disabled={replyLoading[review.id]}
                        className="flex-1 bg-[#FCFAF7] border border-[#EADFD8] focus:border-[#E94F2F] focus:ring-1 focus:ring-[#E94F2F] focus:outline-none rounded-xl px-4 py-2.5 text-xs font-semibold text-[#201A17] placeholder:text-gray-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSendReply(review.id);
                          }
                        }}
                      />
                      <button
                        onClick={() => handleSendReply(review.id)}
                        disabled={replyLoading[review.id] || !replyText[review.id]?.trim()}
                        className="px-4 bg-[#E94F2F] hover:bg-[#BD351C] text-white rounded-xl transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer active:scale-95 shrink-0"
                        title="Enviar resposta"
                      >
                        {replyLoading[review.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
