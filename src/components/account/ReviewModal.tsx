import React, { useState, useEffect } from 'react';
import { Star, X, Check, Loader2, Calendar } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useApp } from '../../context/AppContext';
import { reviewService } from '../../services/reviewService';
import { Review } from '../../types';
import { parseOrderDate } from '../../utils/dateUtils';

interface ReviewModalProps {
  orderId: string;
  establishmentId: string;
  establishmentName: string;
  customerUid: string;
  customerName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Muito ruim',
  2: 'Ruim',
  3: 'Regular',
  4: 'Muito bom',
  5: 'Excelente'
};

const POSITIVE_TAGS = [
  'Produto saboroso',
  'Chegou rápido',
  'Bem embalado',
  'Bom atendimento',
  'Pedido correto'
];

const NEGATIVE_TAGS = [
  'Pedido demorou',
  'Produto diferente',
  'Item faltando',
  'Embalagem inadequada',
  'Atendimento ruim'
];

export const ReviewModal: React.FC<ReviewModalProps> = ({
  orderId,
  establishmentId,
  establishmentName,
  customerUid,
  customerName,
  onClose,
  onSuccess
}) => {
  const { setOrders, showToast } = useApp();
  const [loading, setLoading] = useState(false);
  const [fetchingExisting, setFetchingExisting] = useState(true);
  const [existingReview, setExistingReview] = useState<Review | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Form State
  const [overallRating, setOverallRating] = useState<number>(0);
  const [productQualityRating, setProductQualityRating] = useState<number>(0);
  const [serviceRating, setServiceRating] = useState<number>(0);
  const [deliveryTimeRating, setDeliveryTimeRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load existing review if any
  useEffect(() => {
    let active = true;
    const loadExisting = async () => {
      try {
        const rev = await reviewService.getReview(orderId);
        if (!active) return;
        if (rev) {
          setExistingReview(rev);
          setOverallRating(rev.overallRating);
          setProductQualityRating(rev.productQualityRating || 0);
          setServiceRating(rev.serviceRating || 0);
          setDeliveryTimeRating(rev.deliveryTimeRating || 0);
          setComment(rev.comment || '');
          setSelectedTags(rev.tags || []);

          // Check if 24 hours have passed since creation
          const createdTime = parseOrderDate(rev.createdAt).getTime();
          const hoursPassed = (Date.now() - createdTime) / (1000 * 60 * 60);
          if (hoursPassed > 24) {
            setIsReadOnly(true);
          }
        }
      } catch (err) {
        console.error("Error loading existing review:", err);
      } finally {
        if (active) setFetchingExisting(false);
      }
    };
    loadExisting();
    return () => { active = false; };
  }, [orderId]);

  // Escape key handler to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Adjust tags list based on current score
  const availableTags = overallRating >= 4 ? POSITIVE_TAGS : POSITIVE_TAGS.concat(NEGATIVE_TAGS);

  const handleToggleTag = (tag: string) => {
    if (isReadOnly) return;
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleRatingHover = (rating: number) => {
    // optional interactive helper
  };

  const finalizeReviewSuccess = ({
    orderId,
    reviewId,
    review
  }: {
    orderId: string;
    reviewId: string;
    review?: any;
  }) => {
    // 1. Atualizar o pedido local + 2. Atualizar o histórico/lista Meus Pedidos
    const nowIso = new Date().toISOString();
    const reviewSubmittedAt = review?.createdAt 
      ? (typeof review.createdAt.toDate === 'function' ? review.createdAt.toDate().toISOString() : review.createdAt) 
      : nowIso;

    setOrders(prev =>
      prev.map(order =>
        order.id === orderId
          ? {
              ...order,
              reviewSubmitted: true,
              reviewId,
              reviewSubmittedAt
            }
          : order
      )
    );

    // 3. Remover ou substituir o botão "Avaliar" (acontece via atualização de estado)
    
    // 4. Definir estado do modal como fechado
    onClose();

    // 5. Limpar estado temporário do formulário
    setOverallRating(0);
    setProductQualityRating(0);
    setServiceRating(0);
    setDeliveryTimeRating(0);
    setComment('');
    setSelectedTags([]);
    setError(null);

    // 6. Liberar isSubmitting
    setLoading(false);

    // 7. Mostrar exatamente um toast
    showToast("Avaliação enviada com sucesso!", "success", `review-success-${reviewId}`);

    // Chamar callback do pai se houver
    if (onSuccess) {
      try {
        onSuccess();
      } catch (err) {
        console.error("Error executing parent onSuccess callback:", err);
      }
    }
  };

  const reconcileReviewSubmission = async (orderId: string, customerUid: string) => {
    try {
      // 1. calcular o reviewId determinístico
      const detReviewId = `${orderId}_${customerUid}`;

      // 2. ler o documento da review (tentando tanto o orderId quanto o detReviewId)
      let reviewSnap = await getDoc(doc(db, "reviews", orderId));
      let foundId = orderId;
      if (!reviewSnap.exists()) {
        reviewSnap = await getDoc(doc(db, "reviews", detReviewId));
        if (reviewSnap.exists()) {
          foundId = detReviewId;
        }
      }

      // 3. ler o pedido relacionado
      const orderSnap = await getDoc(doc(db, "orders", orderId));
      const orderData = orderSnap.exists() ? orderSnap.data() : null;

      // 4. verificar as condições
      if (reviewSnap.exists()) {
        const review = reviewSnap.data();
        const isProcessed = review.processed === true || review.status === "published" || (orderData && orderData.reviewSubmitted === true);
        if (isProcessed) {
          return {
            processed: true,
            reviewId: foundId,
            review
          };
        }
      } else if (orderData && orderData.reviewSubmitted === true) {
        return {
          processed: true,
          reviewId: orderId,
          review: {
            orderId,
            status: "published",
            processed: true
          }
        };
      }
    } catch (err) {
      console.error("Erro na reconciliação:", err);
    }
    return { processed: false, reviewId: orderId, review: null };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate submits
    if (isReadOnly) return;
    if (overallRating === 0) {
      setError("A nota geral é obrigatória.");
      return;
    }
    if (comment.length > 500) {
      setError("O comentário não pode ultrapassar 500 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 3. NÃO CRIAR NOVA AVALIAÇÃO PARA O PL-9160 (Ou qualquer outra que já tenha sido processada)
      const reconciliationBefore = await reconcileReviewSubmission(orderId, customerUid);
      if (reconciliationBefore.processed) {
        finalizeReviewSuccess({
          orderId,
          reviewId: reconciliationBefore.reviewId,
          review: reconciliationBefore.review
        });
        return;
      }

      if (existingReview) {
        // Update review
        await reviewService.updateReview(orderId, {
          overallRating,
          productQualityRating: productQualityRating || undefined,
          serviceRating: serviceRating || undefined,
          deliveryTimeRating: deliveryTimeRating || undefined,
          tags: selectedTags,
          comment: comment.trim()
        });
      } else {
        // Create new review
        await reviewService.submitReview({
          orderId,
          establishmentId,
          establishmentName,
          customerUid,
          customerName,
          overallRating,
          productQualityRating: productQualityRating || undefined,
          serviceRating: serviceRating || undefined,
          deliveryTimeRating: deliveryTimeRating || undefined,
          tags: selectedTags,
          comment: comment.trim()
        });
      }

      // Re-fetch review to get processed state
      const finalRecon = await reconcileReviewSubmission(orderId, customerUid);
      finalizeReviewSuccess({
        orderId,
        reviewId: finalRecon.reviewId || orderId,
        review: finalRecon.review
      });
    } catch (err: any) {
      // 4. RECONCILIAÇÃO APÓS ERRO
      console.warn("Review submission encountered error, attempting reconciliation...", err);
      const reconciliation = await reconcileReviewSubmission(orderId, customerUid);

      if (reconciliation.processed) {
        finalizeReviewSuccess({
          orderId,
          reviewId: reconciliation.reviewId,
          review: reconciliation.review
        });
        return;
      }

      console.error("REVIEW_SUBMISSION_FAILED", {
        stage: err._stage || "update-local-state",
        orderId,
        reviewId: orderId,
        httpStatus: err._httpStatus || null,
        errorCode: err.code || "UNKNOWN_ERROR",
        errorMessage: err.message || "Ocorreu um erro ao enviar sua avaliação. Tente novamente."
      });
      setError(err?.message || "Ocorreu um erro ao enviar sua avaliação. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div id="review-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-300">
      {/* Container Card / BottomSheet */}
      <div 
        className="bg-[#FCFAF7] w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-[#EADFD8] transition-transform duration-300 translate-y-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#EADFD8] flex items-center justify-between shrink-0 bg-[#FCFAF7] z-10">
          <div>
            <h3 className="font-black text-lg text-[#201A17] tracking-tight">
              {existingReview ? (isReadOnly ? 'Sua Avaliação' : 'Editar Avaliação') : 'Avalie sua experiência'}
            </h3>
            <p className="text-xs text-[#756B66] font-bold mt-0.5">
              Pedido {orderId.slice(-6).toUpperCase()} • {establishmentName}
            </p>
          </div>
          <button 
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-2 hover:bg-[#F2ECE4] rounded-xl text-[#756B66] hover:text-[#201A17] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {fetchingExisting ? (
          <div className="flex-1 py-20 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#E94F2F] animate-spin" />
            <p className="text-xs font-bold text-[#756B66]">Buscando dados da avaliação...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Scrollable Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">
              {/* 24 Hours Info Banner */}
              {existingReview && (
                <div className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-start gap-2.5 ${
                  isReadOnly 
                    ? 'bg-amber-50 text-amber-800 border-amber-200' 
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  <Calendar className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    {isReadOnly ? (
                      <p>Esta avaliação foi enviada há mais de 24 horas e está em modo somente leitura.</p>
                    ) : (
                      <p>Você pode editar sua avaliação por até 24 horas após o envio. As notas e comentários serão recalculados.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Note Error */}
              {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold">
                  {error}
                </div>
              )}

              {/* Overall Rating (Mandatory) */}
              <div className="text-center space-y-2">
                <label className="text-xs font-black uppercase text-[#756B66] tracking-wider block">
                  Sua nota geral *
                </label>
                
                <div className="flex items-center justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      disabled={isReadOnly}
                      onClick={() => {
                        setOverallRating(star);
                        // Reset tags if rating drops
                        if (star < 4) {
                          setSelectedTags([]);
                        }
                      }}
                      className={`p-1.5 rounded-full transition-transform active:scale-90 ${
                        isReadOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
                      }`}
                    >
                      <Star 
                        className={`w-9 h-9 ${
                          star <= overallRating 
                            ? 'fill-amber-400 text-amber-400' 
                            : 'text-[#EADFD8] fill-transparent'
                        }`} 
                      />
                    </button>
                  ))}
                </div>

                {overallRating > 0 && (
                  <p className="text-sm font-black text-[#E94F2F] tracking-tight">
                    {overallRating} — {RATING_LABELS[overallRating]}
                  </p>
                )}
              </div>

              {/* Criteria (Optional) */}
              {overallRating > 0 && (
                <div className="bg-[#F7F4EF]/70 p-4 rounded-2xl border border-[#EADFD8]/40 space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-[#756B66] tracking-wider border-b border-[#EADFD8]/50 pb-2">
                    Avaliação detalhada (opcional)
                  </h4>

                  {/* Criterion 1: Quality */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-[#5C534E]">Qualidade dos produtos</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => setProductQualityRating(star)}
                          className="p-0.5"
                        >
                          <Star 
                            className={`w-5 h-5 ${
                              star <= productQualityRating 
                                ? 'fill-amber-400 text-amber-400' 
                                : 'text-gray-200 fill-transparent'
                            }`} 
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Criterion 2: Service */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-[#5C534E]">Atendimento</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => setServiceRating(star)}
                          className="p-0.5"
                        >
                          <Star 
                            className={`w-5 h-5 ${
                              star <= serviceRating 
                                ? 'fill-amber-400 text-amber-400' 
                                : 'text-gray-200 fill-transparent'
                            }`} 
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Criterion 3: Delivery/Prep Time */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-[#5C534E]">Tempo de preparo/entrega</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => setDeliveryTimeRating(star)}
                          className="p-0.5"
                        >
                          <Star 
                            className={`w-5 h-5 ${
                              star <= deliveryTimeRating 
                                ? 'fill-amber-400 text-amber-400' 
                                : 'text-gray-200 fill-transparent'
                            }`} 
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* Quick Tags (conforming list based on rating) */}
              {overallRating > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-[#756B66] tracking-wider block">
                    Tags rápidas (opcional)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleToggleTag(tag)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                            isSelected
                              ? 'bg-[#E94F2F] text-white border-transparent'
                              : 'bg-white text-[#756B66] border border-[#EADFD8] hover:bg-[#F7F4EF]'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                          <span>{tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Comment Section (Optional) */}
              <div className="space-y-1.5 pb-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black uppercase text-[#756B66] tracking-wider">
                    Comentário (opcional)
                  </label>
                  <span className="text-[10px] text-[#756B66] font-bold">
                    {comment.length}/500
                  </span>
                </div>
                <textarea
                  value={comment}
                  disabled={isReadOnly}
                  onChange={(e) => setComment(e.target.value.slice(0, 500))}
                  placeholder="Conte-nos como foi sua experiência com este pedido..."
                  rows={3}
                  className="w-full bg-white border border-[#EADFD8] focus:border-[#E94F2F] focus:ring-1 focus:ring-[#E94F2F] rounded-2xl p-3.5 text-xs font-semibold placeholder:text-[#A89C93] text-[#201A17] focus:outline-none transition-all resize-none disabled:bg-[#F2ECE4]/40 disabled:text-[#756B66]"
                />
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="shrink-0 p-5 border-t border-[#EADFD8] bg-[#FCFAF7] pb-[calc(20px+env(safe-area-inset-bottom,0px))]">
              {!isReadOnly ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={onClose}
                    className="flex-1 px-5 py-3.5 bg-white border border-[#EADFD8] hover:bg-[#F7F4EF] text-xs font-black text-[#5C534E] rounded-xl transition-all active:scale-95 cursor-pointer text-center"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || overallRating === 0}
                    className="flex-2 px-5 py-3.5 bg-[#E94F2F] hover:bg-[#BD351C] text-xs font-black text-white rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin text-white" />}
                    <span>{existingReview ? 'Salvar Alterações' : 'Enviar avaliação'}</span>
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full px-5 py-3.5 bg-[#E94F2F] hover:bg-[#BD351C] text-xs font-black text-white rounded-xl transition-all active:scale-95 cursor-pointer text-center"
                  >
                    Fechar Visualização
                  </button>
                </div>
              )}
            </div>

          </form>
        )}
      </div>
    </div>
  );
};
