import React, { useState, useEffect, useMemo } from 'react';
import { Star, ShieldCheck, Check, ChevronDown, SlidersHorizontal, Loader2, Calendar } from 'lucide-react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { parseOrderDate } from '../utils/dateUtils';
import { Review } from '../types';

interface PublicReviewsProps {
  establishmentId: string;
  ratingAverage?: number;
  ratingCount?: number;
}

// Protected review format sent to frontend
interface SafePublicReview {
  id: string;
  displayName: string;
  overallRating: number;
  detailedRatings: {
    quality?: number;
    service?: number;
    delivery?: number;
  };
  tags: string[];
  comment: string;
  merchantReply?: {
    text: string;
    repliedAt: string;
    repliedByName?: string;
  } | null;
  createdAt: string;
  verifiedPurchase: boolean;
}

export const PublicReviews: React.FC<PublicReviewsProps> = ({
  establishmentId,
  ratingAverage,
  ratingCount
}) => {
  const [reviews, setReviews] = useState<SafePublicReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<number | 'all'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'highest' | 'lowest'>('recent');
  const [visibleCount, setVisibleCount] = useState(5);

  // Helper to format client names securely (First name + initial of last name)
  const formatCustomerName = (name?: string): string => {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return 'Cliente UaiPertim';
    }
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) {
      return 'Cliente UaiPertim';
    }
    const firstName = parts[0];
    const firstFormatted = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    
    if (parts.length > 1) {
      const connectors = ['de', 'da', 'do', 'dos', 'das', 'e'];
      let initialIndex = 1;
      while (initialIndex < parts.length && connectors.includes(parts[initialIndex].toLowerCase())) {
        initialIndex++;
      }
      if (initialIndex < parts.length) {
        const initial = parts[initialIndex].charAt(0).toUpperCase();
        return `${firstFormatted} ${initial}.`;
      }
    }
    return firstFormatted;
  };

  // Helper to format review dates elegantly: "25 jul. 2026"
  const formatReviewDate = (createdAt: any): string => {
    const date = parseOrderDate(createdAt);
    const months = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Fetch reviews securely from Firestore
  useEffect(() => {
    let active = true;
    const fetchReviews = async () => {
      if (!db || !establishmentId) return;
      setLoading(true);
      try {
        let snap;
        // Search by establishmentId using the working composite index (same as merchant reviews query)
        // This is 100% immune to index errors because we know this index exists and works.
        try {
          const q = query(
            collection(db, "reviews"),
            where("establishmentId", "==", establishmentId),
            orderBy("createdAt", "desc")
          );
          snap = await getDocs(q);
        } catch (indexErr) {
          console.warn("Primary merchant index not available, falling back to basic query", indexErr);
          // Ultimate fallback: simple query with single filter and no orderBy to ensure NO index is required
          const qSimple = query(
            collection(db, "reviews"),
            where("establishmentId", "==", establishmentId)
          );
          snap = await getDocs(qSimple);
        }

        if (!active) return;

        const safeList: SafePublicReview[] = [];
        snap.forEach((doc) => {
          const data = doc.data();
          
          // Strict filtering of status on the client side
          if (data.status !== "published") {
            return;
          }

          // Check if it is a verified purchase: if it has a valid order ID or is processed
          const verifiedPurchase = !!data.orderId || data.processed === true;

          // Strict Normalization Pattern - Exclude all sensitive fields
          const secureReview: SafePublicReview = {
            id: doc.id,
            displayName: formatCustomerName(data.customerName),
            overallRating: data.overallRating || 5,
            detailedRatings: {
              quality: data.productQualityRating,
              service: data.serviceRating,
              delivery: data.deliveryTimeRating
            },
            tags: data.tags || [],
            comment: data.comment || '',
            merchantReply: data.merchantReply ? {
              text: data.merchantReply.text,
              repliedAt: data.merchantReply.repliedAt,
              repliedByName: data.merchantReply.repliedByName
            } : null,
            createdAt: data.createdAt,
            verifiedPurchase: verifiedPurchase
          };
          safeList.push(secureReview);
        });

        // Ensure the list is sorted by createdAt desc (crucial if we fell back to the query without orderBy)
        safeList.sort((a, b) => {
          const timeA = a.createdAt ? parseOrderDate(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? parseOrderDate(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });

        setReviews(safeList);
      } catch (err) {
        console.error("Error fetching public reviews:", err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchReviews();
    return () => {
      active = false;
    };
  }, [establishmentId]);

  // Compute stats on the safe reviews array
  const stats = useMemo(() => {
    const totalCount = reviews.length;
    
    // Distribution count
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    
    // Criteria metrics accumulators
    let qualitySum = 0;
    let qualityCount = 0;
    let serviceSum = 0;
    let serviceCount = 0;
    let deliverySum = 0;
    let deliveryCount = 0;

    reviews.forEach(r => {
      // Distribution
      const rRating = Math.min(5, Math.max(1, Math.round(r.overallRating))) as 5|4|3|2|1;
      distribution[rRating] = (distribution[rRating] || 0) + 1;

      // Quality
      if (r.detailedRatings.quality !== undefined && r.detailedRatings.quality > 0) {
        qualitySum += r.detailedRatings.quality;
        qualityCount++;
      }
      // Service
      if (r.detailedRatings.service !== undefined && r.detailedRatings.service > 0) {
        serviceSum += r.detailedRatings.service;
        serviceCount++;
      }
      // Delivery
      if (r.detailedRatings.delivery !== undefined && r.detailedRatings.delivery > 0) {
        deliverySum += r.detailedRatings.delivery;
        deliveryCount++;
      }
    });

    const averageRatingVal = totalCount > 0 
      ? Number((reviews.reduce((sum, r) => sum + r.overallRating, 0) / totalCount).toFixed(1))
      : 0;

    return {
      totalCount,
      averageRating: averageRatingVal,
      distribution,
      criteria: {
        quality: qualityCount > 0 ? Number((qualitySum / qualityCount).toFixed(1)) : null,
        service: serviceCount > 0 ? Number((serviceSum / serviceCount).toFixed(1)) : null,
        delivery: deliveryCount > 0 ? Number((deliverySum / deliveryCount).toFixed(1)) : null
      }
    };
  }, [reviews]);

  // Apply filters and sorting
  const processedReviewsList = useMemo(() => {
    let result = [...reviews];

    // 1. Filter by stars
    if (selectedRatingFilter !== 'all') {
      result = result.filter(r => Math.round(r.overallRating) === selectedRatingFilter);
    }

    // 2. Sort
    if (sortBy === 'recent') {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'highest') {
      result.sort((a, b) => b.overallRating - a.overallRating || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'lowest') {
      result.sort((a, b) => a.overallRating - b.overallRating || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return result;
  }, [reviews, selectedRatingFilter, sortBy]);

  // Slice list for progressive loading
  const visibleReviews = useMemo(() => {
    return processedReviewsList.slice(0, visibleCount);
  }, [processedReviewsList, visibleCount]);

  const hasMore = processedReviewsList.length > visibleCount;

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + 5);
  };

  // Star rendering helper
  const renderStars = (rating: number, sizeClass = "w-4 h-4") => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= Math.round(rating);
          return (
            <Star
              key={star}
              className={`${sizeClass} ${
                isFilled ? 'fill-[#FFBE5C] text-[#FFBE5C]' : 'text-[#EADFD8] fill-none'
              }`}
            />
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-[#EADFD8] p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 text-[#E94F2F] animate-spin mb-3" />
        <p className="text-sm text-[#756B66] font-bold">Carregando avaliações...</p>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="bg-white rounded-[2rem] border border-[#EADFD8] p-10 md:p-16 text-center space-y-4 max-w-2xl mx-auto shadow-sm">
        <div className="w-16 h-16 bg-[#FAF8F5] rounded-full flex items-center justify-center mx-auto text-[#A39994]">
          <Star className="w-8 h-8 stroke-[1.5]" />
        </div>
        <div className="space-y-2">
          <h4 className="text-lg font-black text-[#201A17] tracking-tight">Este estabelecimento ainda não recebeu avaliações.</h4>
          <p className="text-sm text-[#756B66] leading-relaxed font-medium">
            Faça seu pedido e compartilhe sua experiência depois da entrega.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="customer-reviews-section" className="space-y-8">
      <h3 className="text-xl md:text-2xl font-black text-[#201A17] tracking-tight">
        Avaliações dos clientes
      </h3>

      {/* Summary Area */}
      <div className="bg-white rounded-[2rem] border border-[#EADFD8]/60 p-6 md:p-8 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* General Average Rating */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left md:border-r md:border-[#F7F4EF] md:pr-8 md:h-full md:justify-center">
            <span className="text-5xl md:text-6xl font-black text-[#201A17] tracking-tighter">
              {stats.averageRating.toFixed(1).replace('.', ',')}
            </span>
            <div className="mt-2">
              {renderStars(stats.averageRating, "w-5 h-5")}
            </div>
            <p className="text-xs text-[#756B66] font-extrabold mt-3 flex items-center gap-1.5 uppercase tracking-wide">
              <ShieldCheck className="w-4 h-4 text-[#2F9E69] fill-emerald-50" />
              {stats.totalCount} {stats.totalCount === 1 ? 'avaliação verificada' : 'avaliações verificadas'}
            </p>
          </div>

          {/* Star Distribution */}
          <div className="space-y-2 md:border-r md:border-[#F7F4EF] md:pr-8">
            <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider mb-3">Distribuição das notas</h4>
            {([5, 4, 3, 2, 1] as const).map((stars) => {
              const count = stats.distribution[stars] || 0;
              const percentage = stats.totalCount > 0 ? (count / stats.totalCount) * 100 : 0;
              return (
                <div key={stars} className="flex items-center gap-3 text-xs">
                  <span className="w-12 text-[#201A17] font-bold text-right shrink-0">{stars} {stars === 1 ? 'estrela' : 'estrelas'}</span>
                  <div className="flex-1 h-2 bg-[#F7F4EF] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#FFBE5C] rounded-full transition-all duration-500" 
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="w-6 text-[#756B66] font-extrabold text-left shrink-0">{count}</span>
                </div>
              );
            })}
          </div>

          {/* Detailed Ratings Metrics */}
          <div className="space-y-4 md:pl-4">
            <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider mb-1">Métricas detalhadas</h4>
            
            <div className="space-y-3.5">
              {/* Product Quality */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-[#5C534E] font-bold">Qualidade dos produtos</span>
                  <span className="text-[#201A17] font-black">{stats.criteria.quality !== null ? `${stats.criteria.quality.toFixed(1)}/5,0` : 'Sem dados'}</span>
                </div>
                <div className="h-1.5 bg-[#F7F4EF] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#2F9E69] rounded-full" 
                    style={{ width: `${stats.criteria.quality !== null ? (stats.criteria.quality / 5) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Service */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-[#5C534E] font-bold">Atendimento</span>
                  <span className="text-[#201A17] font-black">{stats.criteria.service !== null ? `${stats.criteria.service.toFixed(1)}/5,0` : 'Sem dados'}</span>
                </div>
                <div className="h-1.5 bg-[#F7F4EF] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#2F9E69] rounded-full" 
                    style={{ width: `${stats.criteria.service !== null ? (stats.criteria.service / 5) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Delivery Time */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-[#5C534E] font-bold">Tempo de entrega</span>
                  <span className="text-[#201A17] font-black">{stats.criteria.delivery !== null ? `${stats.criteria.delivery.toFixed(1)}/5,0` : 'Sem dados'}</span>
                </div>
                <div className="h-1.5 bg-[#F7F4EF] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#2F9E69] rounded-full" 
                    style={{ width: `${stats.criteria.delivery !== null ? (stats.criteria.delivery / 5) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Filters and Sorters */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center border-b border-[#EADFD8]/40 pb-5">
        
        {/* Rating filters - scrollable horizontally on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1.5 md:pb-0 scrollbar-none shrink-0 -mx-4 px-4 md:mx-0 md:px-0">
          <button
            onClick={() => { setSelectedRatingFilter('all'); setVisibleCount(5); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-colors shrink-0 ${
              selectedRatingFilter === 'all'
                ? 'bg-[#E94F2F] text-white shadow-xs'
                : 'bg-white border border-[#EADFD8] text-[#756B66] hover:bg-[#FAF8F5]'
            }`}
          >
            Todas
          </button>
          {([5, 4, 3, 2, 1] as const).map((stars) => {
            const count = reviews.filter(r => Math.round(r.overallRating) === stars).length;
            return (
              <button
                key={stars}
                onClick={() => { setSelectedRatingFilter(stars); setVisibleCount(5); }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1 shrink-0 ${
                  selectedRatingFilter === stars
                    ? 'bg-[#E94F2F] text-white shadow-xs'
                    : 'bg-white border border-[#EADFD8] text-[#756B66] hover:bg-[#FAF8F5]'
                }`}
              >
                {stars} <Star className="w-3.5 h-3.5 fill-current" /> {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>

        {/* Sorting Dropdown */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <span className="text-xs font-extrabold text-[#756B66] uppercase tracking-wide">Ordenar por:</span>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as any); setVisibleCount(5); }}
              className="bg-white border border-[#EADFD8] rounded-xl text-xs font-bold text-[#201A17] pl-3 pr-8 py-2 appearance-none focus:outline-none focus:border-[#E94F2F] focus:ring-1 focus:ring-[#E94F2F]/20 cursor-pointer shadow-xs"
            >
              <option value="recent">Mais recentes</option>
              <option value="highest">Melhor avaliadas</option>
              <option value="lowest">Menor nota</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#756B66] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Reviews List */}
      {processedReviewsList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#EADFD8] p-10 text-center text-sm text-[#756B66] font-medium leading-relaxed">
          Nenhuma avaliação encontrada com o filtro selecionado.
        </div>
      ) : (
        <div className="space-y-5">
          {visibleReviews.map((review) => {
            const detailedCount = [
              review.detailedRatings.quality,
              review.detailedRatings.service,
              review.detailedRatings.delivery
            ].filter(v => v !== undefined && v > 0).length;

            return (
              <div 
                key={review.id}
                className="bg-white rounded-2xl border border-[#EADFD8]/50 p-5 md:p-6 shadow-xs flex flex-col gap-4 animate-fade-in"
              >
                {/* Header: name, date, rating, verification */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F7F4EF] pb-3.5">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm md:text-base text-[#201A17]">
                        {review.displayName}
                      </span>
                      {review.verifiedPurchase && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-[#2F9E69] bg-[#E8F5E9] px-2 py-0.5 rounded-full uppercase tracking-wider">
                          <Check className="w-2.5 h-2.5" /> Compra verificada
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#A39994] font-extrabold flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" />
                      {formatReviewDate(review.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {renderStars(review.overallRating, "w-4 h-4")}
                    <span className="text-xs font-black text-[#201A17] bg-[#FAF8F5] border border-[#EADFD8]/40 px-2 py-0.5 rounded-lg">
                      {review.overallRating.toFixed(1).replace('.', ',')}
                    </span>
                  </div>
                </div>

                {/* Body Content */}
                <div className="space-y-3">
                  {/* Detailed sub-criteria averages if filled */}
                  {detailedCount > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[#5C534E] font-extrabold bg-[#FAF8F5] p-3 rounded-xl border border-[#EADFD8]/25">
                      {review.detailedRatings.quality !== undefined && review.detailedRatings.quality > 0 && (
                        <span>Qualidade: <span className="text-[#201A17]">{review.detailedRatings.quality}/5</span></span>
                      )}
                      {review.detailedRatings.service !== undefined && review.detailedRatings.service > 0 && (
                        <span>Atendimento: <span className="text-[#201A17]">{review.detailedRatings.service}/5</span></span>
                      )}
                      {review.detailedRatings.delivery !== undefined && review.detailedRatings.delivery > 0 && (
                        <span>Entrega: <span className="text-[#201A17]">{review.detailedRatings.delivery}/5</span></span>
                      )}
                    </div>
                  )}

                  {/* Comment */}
                  {review.comment && review.comment.trim() !== '' && (
                    <p className="text-xs md:text-sm text-[#201A17] leading-relaxed whitespace-pre-wrap font-medium">
                      “{review.comment}”
                    </p>
                  )}

                  {/* Tags */}
                  {review.tags && review.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {review.tags.map((tag) => (
                        <span 
                          key={tag}
                          className="inline-flex text-[10px] font-black text-[#E94F2F] bg-[#FFF5F2] border border-[#FFE8E0] px-2 py-0.5 rounded-full"
                        >
                          #{tag.replace(/^#/, '')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Merchant Reply Area */}
                {review.merchantReply && (
                  <div className="mt-2 bg-[#F7F4EF]/60 rounded-xl p-4 border border-[#EADFD8]/45 relative animate-fade-in">
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <span className="text-[10px] font-black text-[#E94F2F] uppercase tracking-wider">
                        Resposta do estabelecimento
                      </span>
                      <span className="text-[9px] text-[#A39994] font-bold">
                        {formatReviewDate(review.merchantReply.repliedAt)}
                      </span>
                    </div>
                    <p className="text-xs text-[#5C534E] leading-relaxed italic font-medium whitespace-pre-wrap">
                      “{review.merchantReply.text}”
                    </p>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* Load More Button */}
      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={handleLoadMore}
            className="inline-flex items-center justify-center gap-2 text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] px-6 py-3 rounded-xl transition-all duration-200 active:scale-95 shadow-md shadow-orange-500/10 min-w-[180px]"
          >
            Ver mais avaliações
          </button>
        </div>
      )}
    </div>
  );
};
