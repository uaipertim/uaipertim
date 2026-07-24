// Central environment and feature configuration layer for UaiPertim
// Supports environments: 'development' | 'staging' | 'production'

// Helper function to safely read environment variables from either process.env (Node/esbuild) or import.meta.env (Vite client)
const getEnvValue = (key: string, fallback: string = ''): string => {
  // 1. Try process.env (Node.js/esbuild environment or injected by bundler)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  // 2. Try import.meta.env (Vite frontend client bundling) safely
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta && (import.meta as any).env) {
      // @ts-ignore
      const val = (import.meta as any).env[key];
      if (val !== undefined) {
        return val as string;
      }
    }
  } catch (e) {
    // Short-circuit in Node.js/CommonJS where import.meta might throw
  }
  return fallback;
};

// Application Environment
export const APP_ENV = (getEnvValue('VITE_APP_ENV') || getEnvValue('APP_ENV') || 'development') as 'development' | 'staging' | 'production';

// Basic App Metadata
export const APP_NAME = getEnvValue('VITE_APP_NAME') || 'UaiPertim';

export const PUBLIC_APP_URL = getEnvValue('VITE_PUBLIC_APP_URL') || 
  (typeof window !== 'undefined' ? window.location.origin : 'https://uaipertim.com.br');

export const PUBLIC_API_BASE_URL = getEnvValue('VITE_PUBLIC_API_BASE_URL') || '';

// Hardcoded, working default configuration for development fallback
export const ORIGINAL_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDkLqmCTFFqaIsdj6RoU2QCwNiITBEsUTo",
  authDomain: "gen-lang-client-0673282457.firebaseapp.com",
  projectId: "gen-lang-client-0673282457",
  storageBucket: "gen-lang-client-0673282457.firebasestorage.app",
  messagingSenderId: "271251032954",
  appId: "1:271251032954:web:31afabc67be3533665e4c3"
};

export const ORIGINAL_FIRESTORE_DATABASE_ID = "ai-studio-uaipertim-1ec226bc-5361-4d8f-93aa-92f62786acfe";

// Check if we have complete VITE_FIREBASE_* variables in environment
const hasCompleteEnvFirebase = 
  !!getEnvValue('VITE_FIREBASE_API_KEY') &&
  !!getEnvValue('VITE_FIREBASE_AUTH_DOMAIN') &&
  !!getEnvValue('VITE_FIREBASE_PROJECT_ID') &&
  !!getEnvValue('VITE_FIREBASE_STORAGE_BUCKET') &&
  !!getEnvValue('VITE_FIREBASE_MESSAGING_SENDER_ID') &&
  !!getEnvValue('VITE_FIREBASE_APP_ID');

// Select Firebase config based on completeness and active environment
export const FIREBASE_CONFIG = (() => {
  if (hasCompleteEnvFirebase) {
    return {
      apiKey: getEnvValue('VITE_FIREBASE_API_KEY'),
      authDomain: getEnvValue('VITE_FIREBASE_AUTH_DOMAIN'),
      projectId: getEnvValue('VITE_FIREBASE_PROJECT_ID'),
      storageBucket: getEnvValue('VITE_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: getEnvValue('VITE_FIREBASE_MESSAGING_SENDER_ID'),
      appId: getEnvValue('VITE_FIREBASE_APP_ID')
    };
  }
  // If not complete and we are NOT in production, use our original working configuration
  if (APP_ENV !== 'production') {
    return ORIGINAL_FIREBASE_CONFIG;
  }
  // In production, return whatever is there (which will fail validation)
  return {
    apiKey: getEnvValue('VITE_FIREBASE_API_KEY'),
    authDomain: getEnvValue('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnvValue('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getEnvValue('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnvValue('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnvValue('VITE_FIREBASE_APP_ID')
  };
})();

export const FIRESTORE_DATABASE_ID = (() => {
  const envDbId = getEnvValue('VITE_FIRESTORE_DATABASE_ID');
  if (envDbId) return envDbId;
  if (APP_ENV !== 'production') return ORIGINAL_FIRESTORE_DATABASE_ID;
  return '';
})();

// Validation functions
export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
}

export function validateEnvironment(): ValidationResult {
  const missingFields: string[] = [];
  
  // In development, everything has safe fallbacks, so always valid
  if (APP_ENV !== 'production') {
    return { valid: true, missingFields: [] };
  }
  
  // In production, validate strictly
  if (!getEnvValue('VITE_FIREBASE_API_KEY')) missingFields.push('VITE_FIREBASE_API_KEY');
  if (!getEnvValue('VITE_FIREBASE_AUTH_DOMAIN')) missingFields.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!getEnvValue('VITE_FIREBASE_PROJECT_ID')) missingFields.push('VITE_FIREBASE_PROJECT_ID');
  if (!getEnvValue('VITE_FIREBASE_STORAGE_BUCKET')) missingFields.push('VITE_FIREBASE_STORAGE_BUCKET');
  if (!getEnvValue('VITE_FIREBASE_MESSAGING_SENDER_ID')) missingFields.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
  if (!getEnvValue('VITE_FIREBASE_APP_ID')) missingFields.push('VITE_FIREBASE_APP_ID');
  if (!getEnvValue('VITE_FIRESTORE_DATABASE_ID')) missingFields.push('VITE_FIRESTORE_DATABASE_ID');
  if (!getEnvValue('VITE_APP_NAME')) missingFields.push('VITE_APP_NAME');
  if (!getEnvValue('VITE_PUBLIC_APP_URL')) missingFields.push('VITE_PUBLIC_APP_URL');
  
  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

// Helper to determine active environment flags
export const isProduction = APP_ENV === 'production';
export const isStaging = APP_ENV === 'staging';
export const isDevelopment = APP_ENV === 'development';

// API request helper - ensures relative requests on current host to bypass hardcoded ai.studio links
export const getApiUrl = (route: string): string => {
  const cleanRoute = route.startsWith('/') ? route : `/${route}`;
  return cleanRoute;
};
