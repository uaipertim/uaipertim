import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  getDocs, 
  getDoc,
  serverTimestamp,
  runTransaction,
  limit
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { Review, Order } from "../types";
import { parseOrderDate } from "../utils/dateUtils";

const OFFENSIVE_WORDS = [
  'merda', 'bosta', 'caralho', 'puta', 'porra', 'lixo', 'safado', 
  'idiota', 'fdp', 'imbecil', 'escroto', 'vigarista'
];

function containsOffensiveTerms(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return OFFENSIVE_WORDS.some(word => lower.includes(word));
}

export const reviewService = {
  /**
   * Submits a new review for an order transactionally.
   */
  async submitReview(reviewData: {
    orderId: string;
    establishmentId: string;
    establishmentName?: string;
    customerUid: string;
    customerName: string;
    overallRating: number;
    productQualityRating?: number;
    serviceRating?: number;
    deliveryTimeRating?: number;
    tags?: string[];
    comment?: string;
  }): Promise<any> {
    if (!db) throw new Error("Database not initialized");

    const reviewRef = doc(db, "reviews", reviewData.orderId);

    try {
      const firebaseUser = auth?.currentUser;
      if (!firebaseUser?.uid) {
        const customErr: any = new Error("Usuário não autenticado.");
        customErr._stage = "validate-form";
        throw customErr;
      }

      // Determine status based on offensive terms filter
      const hasBadWords = containsOffensiveTerms(reviewData.comment || "");
      const status = hasBadWords ? 'under_review' : 'published';

      const newReview: any = {
        id: reviewData.orderId,
        orderId: reviewData.orderId,
        establishmentId: reviewData.establishmentId,
        establishmentName: reviewData.establishmentName || "",
        customerUid: reviewData.customerUid,
        customerName: reviewData.customerName,
        overallRating: reviewData.overallRating,
        productQualityRating: reviewData.productQualityRating || null,
        serviceRating: reviewData.serviceRating || null,
        deliveryTimeRating: reviewData.deliveryTimeRating || null,
        tags: reviewData.tags || [],
        comment: reviewData.comment || "",
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        merchantReply: null,
        processed: false
      };

      // 1. Create review on client (subject to secure firestore.rules!)
      try {
        await setDoc(reviewRef, newReview);
      } catch (err: any) {
        err._stage = "create-review";
        throw err;
      }

      // 2. Call secure backend to finalize status, process aggregates and update order
      let token: string;
      try {
        token = await firebaseUser.getIdToken();
      } catch (err: any) {
        err._stage = "get-id-token";
        throw err;
      }

      let response: Response;
      try {
        response = await fetch("/api/reviews/process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ orderId: reviewData.orderId })
        });
      } catch (err: any) {
        err._stage = "call-process-endpoint";
        throw err;
      }

      let payload: any = null;
      try {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          payload = await response.json();
        } else {
          const rawText = await response.text();
          const customErr: any = new Error(
            `Resposta inesperada do servidor (${response.status}): ${rawText.slice(0, 200)}`
          );
          customErr._stage = "parse-response";
          customErr._httpStatus = response.status;
          customErr.code = "INVALID_RESPONSE_TYPE";
          throw customErr;
        }
      } catch (err: any) {
        if (!err._stage) err._stage = "parse-response";
        if (!err._httpStatus) err._httpStatus = response.status;
        throw err;
      }

      if (!response.ok || (!payload?.success && payload?.code !== "ALREADY_PROCESSED")) {
        const customErr: any = new Error(payload?.message || payload?.error || "Falha ao processar avaliação.");
        customErr._stage = "backend-transaction";
        customErr._httpStatus = response.status;
        customErr.code = payload?.code || "REVIEW_PROCESSING_FAILED";
        throw customErr;
      }
      return payload;
    } catch (error: any) {
      const stage = error._stage || "create-review";
      console.error("REVIEW_SUBMISSION_FAILED", {
        stage,
        orderId: reviewData.orderId,
        reviewId: reviewData.orderId,
        httpStatus: error._httpStatus || null,
        errorCode: error.code || "UNKNOWN_ERROR",
        errorMessage: error.message || "Erro desconhecido"
      });
      throw error;
    }
  },

  /**
   * Updates an existing review (only permitted within 24 hours of creation).
   */
  async updateReview(
    orderId: string,
    reviewData: {
      overallRating: number;
      productQualityRating?: number;
      serviceRating?: number;
      deliveryTimeRating?: number;
      tags?: string[];
      comment?: string;
    }
  ): Promise<any> {
    if (!db) throw new Error("Database not initialized");

    const reviewRef = doc(db, "reviews", orderId);

    try {
      const firebaseUser = auth?.currentUser;
      if (!firebaseUser?.uid) {
        const customErr: any = new Error("Usuário não autenticado.");
        customErr._stage = "validate-form";
        throw customErr;
      }

      // 1. Read current review on client
      let reviewSnap;
      try {
        reviewSnap = await getDoc(reviewRef);
      } catch (err: any) {
        err._stage = "create-review";
        throw err;
      }

      if (!reviewSnap.exists()) {
        const customErr: any = new Error("Avaliação não encontrada.");
        customErr._stage = "create-review";
        throw customErr;
      }
      const review = reviewSnap.data() as Review;

      // Check 24 hours window
      const createdTime = parseOrderDate(review.createdAt).getTime();
      const nowTime = Date.now();
      const hoursPassed = (nowTime - createdTime) / (1000 * 60 * 60);
      if (hoursPassed > 24) {
        const customErr: any = new Error("A janela de edição de 24 horas expirou para esta avaliação.");
        customErr._stage = "validate-form";
        throw customErr;
      }

      const hasBadWords = containsOffensiveTerms(reviewData.comment || "");
      const newStatus = hasBadWords ? 'under_review' : 'published';

      // 2. Update review doc on client directly (allowed by rules for customer)
      const updatedReview: any = {
        ...review,
        overallRating: reviewData.overallRating,
        productQualityRating: reviewData.productQualityRating || null,
        serviceRating: reviewData.serviceRating || null,
        deliveryTimeRating: reviewData.deliveryTimeRating || null,
        tags: reviewData.tags || [],
        comment: reviewData.comment || "",
        status: newStatus,
        updatedAt: serverTimestamp()
      };

      try {
        await setDoc(reviewRef, updatedReview);
      } catch (err: any) {
        err._stage = "create-review";
        throw err;
      }

      // 3. Call backend to update aggregates safely
      let token: string;
      try {
        token = await firebaseUser.getIdToken();
      } catch (err: any) {
        err._stage = "get-id-token";
        throw err;
      }

      let response: Response;
      try {
        response = await fetch("/api/reviews/process-update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ orderId })
        });
      } catch (err: any) {
        err._stage = "call-process-endpoint";
        throw err;
      }

      let payload: any = null;
      try {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          payload = await response.json();
        } else {
          const rawText = await response.text();
          const customErr: any = new Error(
            `Resposta inesperada do servidor (${response.status}): ${rawText.slice(0, 200)}`
          );
          customErr._stage = "parse-response";
          customErr._httpStatus = response.status;
          customErr.code = "INVALID_RESPONSE_TYPE";
          throw customErr;
        }
      } catch (err: any) {
        if (!err._stage) err._stage = "parse-response";
        if (!err._httpStatus) err._httpStatus = response.status;
        throw err;
      }

      if (!response.ok || (!payload?.success && payload?.code !== "ALREADY_PROCESSED")) {
        const customErr: any = new Error(payload?.message || payload?.error || "Falha ao processar atualização da avaliação.");
        customErr._stage = "backend-transaction";
        customErr._httpStatus = response.status;
        customErr.code = payload?.code || "REVIEW_PROCESSING_FAILED";
        throw customErr;
      }
      return payload;
    } catch (error: any) {
      const stage = error._stage || "create-review";
      console.error("REVIEW_SUBMISSION_FAILED", {
        stage,
        orderId,
        reviewId: orderId,
        httpStatus: error._httpStatus || null,
        errorCode: error.code || "UNKNOWN_ERROR",
        errorMessage: error.message || "Erro desconhecido"
      });
      throw error;
    }
  },

  /**
   * Fetches a single review by orderId.
   */
  async getReview(orderId: string): Promise<Review | null> {
    if (!db) return null;
    try {
      const snap = await getDoc(doc(db, "reviews", orderId));
      if (snap.exists()) {
        return snap.data() as Review;
      }
      return null;
    } catch (error) {
      console.error("Error fetching review:", error);
      return null;
    }
  },

  /**
   * Fetches all published reviews for an establishment.
   */
  async getEstablishmentReviews(establishmentId: string): Promise<Review[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, "reviews"),
        where("establishmentId", "==", establishmentId),
        where("status", "==", "published"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list: Review[] = [];
      snap.forEach(doc => {
        list.push(doc.data() as Review);
      });
      return list;
    } catch (error) {
      console.error("Error fetching establishment reviews:", error);
      return [];
    }
  },

  /**
   * Fetches all reviews for merchant panel (including under_review, hidden, etc).
   */
  async getMerchantReviews(establishmentId: string): Promise<Review[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, "reviews"),
        where("establishmentId", "==", establishmentId),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list: Review[] = [];
      snap.forEach(doc => {
        list.push(doc.data() as Review);
      });
      return list;
    } catch (error) {
      console.error("Error fetching merchant reviews:", error);
      return [];
    }
  },

  /**
   * Fetches all reviews (for Admin panel).
   */
  async getAllReviews(): Promise<Review[]> {
    if (!db) return [];
    try {
      const q = query(
        collection(db, "reviews"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list: Review[] = [];
      snap.forEach(doc => {
        list.push(doc.data() as Review);
      });
      return list;
    } catch (error) {
      console.error("Error fetching all reviews:", error);
      return [];
    }
  },

  /**
   * Submit merchant reply to a review.
   */
  async submitMerchantReply(
    orderId: string,
    text: string,
    repliedByUid: string,
    repliedByName: string
  ): Promise<void> {
    if (!db) throw new Error("Database not initialized");
    try {
      const reviewRef = doc(db, "reviews", orderId);
      await updateDoc(reviewRef, {
        merchantReply: {
          text,
          repliedAt: new Date().toISOString(),
          repliedByUid,
          repliedByName
        },
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error submitting reply:", error);
      throw error;
    }
  },

  /**
   * Moderate a review (Admin).
   */
  async moderateReview(
    orderId: string,
    status: 'published' | 'under_review' | 'hidden',
    reason: string,
    adminUid: string
  ): Promise<void> {
    if (!db) throw new Error("Database not initialized");

    const reviewRef = doc(db, "reviews", orderId);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. Read review doc first
        const reviewSnap = await transaction.get(reviewRef);
        if (!reviewSnap.exists()) {
          throw new Error("Avaliação não encontrada.");
        }

        const review = reviewSnap.data() as Review;
        const oldStatus = review.status;

        // 2. Read establishment doc first
        const estRef = doc(db, "establishments", review.establishmentId);
        const estSnap = await transaction.get(estRef);

        // --- ALL READS MUST BE BEFORE ALL WRITES ---

        if (oldStatus === status) return; // no change

        // --- ALL WRITES START HERE ---

        // Update review status and moderation details
        transaction.update(reviewRef, {
          status,
          moderationReason: reason,
          moderatedByUid: adminUid,
          updatedAt: new Date().toISOString()
        });

        // Update establishment aggregates transactionally
        if (estSnap.exists()) {
          const estData = estSnap.data();
          let currentCount = typeof estData.ratingCount === 'number' ? estData.ratingCount : 0;
          let currentSum = typeof estData.ratingSum === 'number' ? estData.ratingSum : 0;

          if (oldStatus === 'published' && status !== 'published') {
            // Remove from published aggregates
            currentCount = Math.max(0, currentCount - 1);
            currentSum = Math.max(0, currentSum - review.overallRating);
          } else if (oldStatus !== 'published' && status === 'published') {
            // Add to published aggregates
            currentCount = currentCount + 1;
            currentSum = currentSum + review.overallRating;
          }

          const newAverage = currentCount > 0 ? Number((currentSum / currentCount).toFixed(2)) : 0;

          transaction.update(estRef, {
            ratingCount: currentCount,
            ratingSum: currentSum,
            ratingAverage: newAverage,
            rating: currentCount > 0 ? newAverage : 4.5
          });
        }
      });
    } catch (error) {
      console.error("Error moderating review:", error);
      throw error;
    }
  }
};
