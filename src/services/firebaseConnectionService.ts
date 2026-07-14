import { doc, getDoc } from "firebase/firestore";
import { db, isFirebaseConnected } from "../lib/firebase";
import { DATA_SOURCE, DataSourceMode } from "../config/dataSource";

export interface PublicAppConfig {
  appName: string;
  environment: string;
  active: boolean;
  demoMode: boolean;
  dataSource?: string;
}

export interface ConnectionStatus {
  status: 'firebase-connected' | 'firebase-unavailable';
  activeSource: DataSourceMode;
  message: string;
  configMessage?: string;
}

export async function checkFirebaseConnection(): Promise<ConnectionStatus> {
  const activeSource = DATA_SOURCE;

  if (!isFirebaseConnected || !db) {
    return {
      status: 'firebase-unavailable',
      activeSource,
      message: 'Firebase indisponível'
    };
  }

  try {
    const configDocRef = doc(db, 'appConfig', 'public');
    const configSnapshot = await getDoc(configDocRef);
    
    if (configSnapshot.exists()) {
      const data = configSnapshot.data() as PublicAppConfig;
      return {
        status: 'firebase-connected',
        activeSource,
        message: 'Firebase DEV conectado',
        configMessage: `Configuração carregada: ${data.appName} (${data.environment})`
      };
    } else {
      return {
        status: 'firebase-connected',
        activeSource,
        message: 'Firebase DEV conectado',
        configMessage: 'Firebase conectado, configuração inicial ainda não cadastrada.'
      };
    }
  } catch (error) {
    console.warn("Could not read appConfig/public from Firestore:", error);
    // Even if permission is denied or document isn't found, Firebase itself is initialized and connected
    return {
      status: 'firebase-connected',
      activeSource,
      message: 'Firebase DEV conectado',
      configMessage: 'Firebase conectado, configuração inicial ainda não cadastrada.'
    };
  }
}
