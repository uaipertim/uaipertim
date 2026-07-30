import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, Loader2, Check, EyeOff, AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';
import { reviewService } from '../../services/reviewService';
import { Review } from '../../types';
import { formatOrderDateTime } from '../../utils/dateUtils';

export const AdminReviewsModeration: React.FC = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'under_review' | 'hidden'>('all');
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');

  // Moderation state
  const [moderationReason, setModerationReason] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await reviewService.getAllReviews();
      setReviews(data);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar as avaliações no painel admin.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  const handleModerate = async (
    orderId: string, 
    status: 'published' | 'under_review' | 'hidden',
    reason: string
  ) => {
    setActionLoading(prev => ({ ...prev, [orderId]: true }));
    try {
      await reviewService.moderateReview(
        orderId,
        status,
        reason,
        'admin' // simulated/active adminUid
      );

      // Update local state
      setReviews(prev => prev.map(r => {
        if (r.id === orderId) {
          return {
            ...r,
            status,
            moderationReason: reason,
            moderatedByUid: 'admin'
          };
        }
        return r;
      }));

      // Clear reason
      setModerationReason(prev => ({ ...prev, [orderId]: '' }));
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Erro ao moderar avaliação.");
    } finally {
      setActionLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const filteredReviews = reviews.filter(r => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchRating = ratingFilter === 'all' || r.overallRating === ratingFilter;
    return matchStatus && matchRating;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-3xl border border-[#EADFD8] shadow-2xs">
        <div>
          <h3 className="font-extrabold text-base text-[#201A17]">Moderação de Avaliações</h3>
          <p className="text-xs text-[#756B66] font-medium mt-0.5">
            Gerencie todas as avaliações do sistema. Aprove, oculte ou analise avaliações retidas por filtros de moderação.
          </p>
        </div>
        
        <button
          onClick={loadReviews}
          disabled={loading}
          className="px-4 py-2 bg-[#F7F4EF] hover:bg-[#EADFD8] border border-[#EADFD8] text-xs font-black text-[#5C534E] rounded-xl transition-all cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sincronizar</span>
        </button>
      </div>

      {/* Filter and Controls */}
      <div className="bg-[#F7F4EF]/50 p-4 rounded-2xl border border-[#EADFD8]/40 flex flex-wrap gap-4 items-center justify-between">
        
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase text-[#756B66] tracking-wider mr-2">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-white border border-[#EADFD8] focus:border-[#E94F2F] rounded-xl px-3 py-2 text-xs font-bold text-[#201A17] focus:outline-none"
          >
            <option value="all">Todos os Status</option>
            <option value="under_review">⚠️ Retidas na Moderação</option>
            <option value="published">✅ Publicadas</option>
            <option value="hidden">🚫 Ocultadas</option>
          </select>

          <span className="text-[10px] font-black uppercase text-[#756B66] tracking-wider ml-4 mr-2">Nota Geral:</span>
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-white border border-[#EADFD8] focus:border-[#E94F2F] rounded-xl px-3 py-2 text-xs font-bold text-[#201A17] focus:outline-none"
          >
            <option value="all">Todas</option>
            <option value="5">5 estrelas</option>
            <option value="4">4 estrelas</option>
            <option value="3">3 estrelas</option>
            <option value="2">2 estrelas</option>
            <option value="1">1 estrela</option>
          </select>
        </div>

        <div className="text-xs font-bold text-[#756B66]">
          Mostrando {filteredReviews.length} de {reviews.length} avaliações
        </div>

      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3 bg-white rounded-3xl border border-[#EADFD8]">
          <Loader2 className="w-8 h-8 text-[#E94F2F] animate-spin" />
          <p className="text-xs font-bold text-[#756B66]">Carregando histórico para moderação...</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-[#EADFD8] p-8 space-y-3">
          <div className="bg-emerald-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto text-emerald-600 border border-emerald-100">
            <Check className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-extrabold text-base text-[#201A17]">Fila limpa!</h4>
            <p className="text-xs text-[#756B66] max-w-sm mx-auto font-semibold">
              Nenhuma avaliação corresponde aos filtros especificados.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredReviews.map((review) => {
            const hasCriteria = typeof review.productQualityRating === 'number' ||
                                typeof review.serviceRating === 'number' ||
                                typeof review.deliveryTimeRating === 'number';

            const statusStyles = {
              published: 'bg-emerald-50 text-emerald-800 border-emerald-200',
              under_review: 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse',
              hidden: 'bg-gray-100 text-gray-700 border-gray-200'
            };

            const statusLabels = {
              published: 'Publicada',
              under_review: 'Reter na Moderação',
              hidden: 'Ocultada'
            };

            return (
              <div 
                key={review.id} 
                className="bg-white rounded-3xl border border-[#EADFD8] p-5 flex flex-col justify-between space-y-4 shadow-2xs relative"
              >
                <div className="space-y-3">
                  
                  {/* Top info */}
                  <div className="flex items-start justify-between gap-3 border-b border-[#F7F4EF] pb-3.5">
                    <div>
                      <h4 className="font-extrabold text-sm text-[#201A17]">{review.customerName}</h4>
                      <p className="text-[10px] text-[#756B66] font-bold">
                        Para: <strong className="text-gray-800">{review.establishmentName}</strong>
                      </p>
                      <p className="text-[9px] text-[#756B66] font-bold mt-0.5">
                        Pedido #{review.orderId.slice(-6).toUpperCase()} • {formatOrderDateTime(review.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${statusStyles[review.status]}`}>
                        {statusLabels[review.status]}
                      </span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star 
                            key={s} 
                            className={`w-3 h-3 ${s <= review.overallRating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} 
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Comment & Tags */}
                  <div className="space-y-2">
                    {review.tags && review.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {review.tags.map(t => (
                          <span 
                            key={t} 
                            className="px-2 py-0.5 bg-[#F7F4EF]/60 text-[#756B66] border border-[#EADFD8]/40 rounded-md text-[9px] font-black"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {review.comment ? (
                      <p className="text-xs font-semibold text-[#5C534E] leading-relaxed italic bg-stone-50 p-3.5 rounded-2xl border border-stone-100">
                        "{review.comment}"
                      </p>
                    ) : (
                      <p className="text-xs font-bold text-gray-300 italic">Sem comentário escrito.</p>
                    )}

                    {review.moderationReason && (
                      <div className="p-3 bg-rose-50/50 border border-rose-100/60 rounded-2xl text-[10px] font-semibold text-rose-800 leading-normal flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500 mt-0.5" />
                        <div>
                          <strong>Motivo da moderação:</strong> {review.moderationReason}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Detailed Scores if any */}
                  {hasCriteria && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-extrabold text-[#756B66] bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
                      {typeof review.productQualityRating === 'number' && (
                        <span>Qualidade: {review.productQualityRating}/5</span>
                      )}
                      {typeof review.serviceRating === 'number' && (
                        <span>Serviço: {review.serviceRating}/5</span>
                      )}
                      {typeof review.deliveryTimeRating === 'number' && (
                        <span>Tempo: {review.deliveryTimeRating}/5</span>
                      )}
                    </div>
                  )}

                  {/* Merchant Reply if any */}
                  {review.merchantReply && (
                    <div className="bg-orange-50/30 border-l border-[#E94F2F] p-3 rounded-r-2xl rounded-bl-2xl text-[11px] space-y-1">
                      <p className="font-black text-[#E94F2F] uppercase text-[9px]">Resposta do estabelecimento:</p>
                      <p className="font-medium text-[#5C534E] italic">"{review.merchantReply.text}"</p>
                    </div>
                  )}

                </div>

                {/* Moderate Actions */}
                <div className="pt-3 border-t border-[#F7F4EF] space-y-3">
                  {review.status !== 'published' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleModerate(review.id, 'published', '')}
                        disabled={actionLoading[review.id]}
                        className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {actionLoading[review.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Aprovar / Publicar</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={moderationReason[review.id] || ''}
                          onChange={(e) => setModerationReason(prev => ({ ...prev, [review.id]: e.target.value }))}
                          placeholder="Motivo da ocultação (obrigatório)..."
                          className="flex-1 bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none"
                        />
                        <button
                          onClick={() => handleModerate(review.id, 'hidden', moderationReason[review.id] || 'Ocultado por moderação')}
                          disabled={actionLoading[review.id] || !moderationReason[review.id]?.trim()}
                          className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          {actionLoading[review.id] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                          <span>Ocultar</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
