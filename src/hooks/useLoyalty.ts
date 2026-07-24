import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { LoyaltyAccount } from '../lib/loyalty';
import { loyaltyService } from '../services/loyaltyService';

export type LoyaltyStatus = 
  | 'loading' 
  | 'unauthenticated'
  | 'initializationInProgress' 
  | 'initialized' 
  | 'accountNotFound' 
  | 'error';

export const useLoyalty = (customerId: string | undefined, userRole?: string, profileId?: string) => {
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [status, setStatus] = useState<LoyaltyStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const retry = useCallback(() => {
    setStatus('loading');
    setError(null);
    setAccount(null);
    setRetryTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    // Temp secure diagnostic log requested by user
    console.log("LOYALTY INTEGRATION FRONTEND LOG:", {
      authUid: customerId || null,
      profileId: profileId || null,
      accountDocumentPath: customerId ? `loyaltyAccounts/${customerId}` : null
    });

    if (!customerId) {
      // If there is no authenticated customer ID, set to unauthenticated and do not load
      setStatus('unauthenticated');
      return;
    }

    setStatus('loading');
    setError(null);

    let isInitializing = false;
    let timeoutId: any = null;
    let unsubSnapshot: (() => void) | null = null;

    // Set up a 10-second timeout to prevent infinite loading state
    timeoutId = setTimeout(() => {
      if (status === 'loading' || status === 'initializationInProgress') {
        console.error("Loyalty initialization timed out for user:", customerId);
        setError("Tempo limite excedido ao carregar dados de fidelidade. Verifique sua conexão.");
        setStatus('error');
        if (unsubSnapshot) {
          unsubSnapshot();
        }
      }
    }, 10000);

    const startListening = () => {
      try {
        const docRef = doc(db, 'loyaltyAccounts', customerId);
        unsubSnapshot = onSnapshot(docRef, async (docSnap) => {
          // Clear timeout once we get a real response from Firestore
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          try {
            if (docSnap.exists()) {
              const data = docSnap.data();
              // Normalize tier names to ensure proper casing matching frontend expectations
              let normalizedTier = data.tier || 'Bronze';
              if (normalizedTier.toLowerCase() === 'bronze') normalizedTier = 'Bronze';
              if (normalizedTier.toLowerCase() === 'prata') normalizedTier = 'Prata';
              if (normalizedTier.toLowerCase() === 'ouro') normalizedTier = 'Ouro';
              if (normalizedTier.toLowerCase() === 'diamante') normalizedTier = 'Diamante';

              setAccount({
                ...data,
                tier: normalizedTier
              } as LoyaltyAccount);
              setStatus('initialized');
            } else {
              // If document does not exist and the user is a customer, start self-initialization on server
              if (userRole === 'customer') {
                if (!isInitializing) {
                  isInitializing = true;
                  setStatus('initializationInProgress');
                  try {
                    console.log("Triggering loyalty auto-initialization via server API for user:", customerId);
                    await loyaltyService.initializeLoyalty();
                    // On success, backend transaction creates the document, which will trigger onSnapshot again.
                  } catch (err: any) {
                    console.error("Error auto-initializing loyalty account on server:", err);
                    setError(err.message || "Falha ao inicializar bônus de boas-vindas.");
                    setStatus('error');
                  }
                }
              } else {
                // If user is a merchant, admin or other role, they might not have a loyalty account. Show not found.
                setAccount(null);
                setStatus('accountNotFound');
              }
            }
          } catch (err: any) {
            console.error("Error processing loyalty snapshot:", err);
            setError(err.message || "Erro ao consultar conta de fidelidade.");
            setStatus('error');
          }
        }, (err) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          console.error("onSnapshot permission or database error in useLoyalty:", err);
          setError(`Sem permissão ou erro de acesso ao banco: ${err.message}`);
          setStatus('error');
        });
      } catch (err: any) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        console.error("Error setting up loyalty snapshot listener:", err);
        setError(err.message || "Falha de conexão com o banco de dados.");
        setStatus('error');
      }
    };

    startListening();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (unsubSnapshot) {
        unsubSnapshot();
      }
    };
  }, [customerId, userRole, retryTrigger, profileId]);

  return { 
    account, 
    loading: status === 'loading' || status === 'initializationInProgress', 
    status, 
    error,
    retry
  };
};
