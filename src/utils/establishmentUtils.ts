import { Establishment } from '../types';

export interface EstablishmentOperationalState {
  storeStatus: "open" | "closed";
  ordersStatus: "accepting" | "paused" | "unavailable";
  pauseStatus: "inactive" | "active";
  pauseEndsAt: Date | null;
  canReceiveOrders: boolean;
  reason: string | null;
}

export function parseDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'object' && val.seconds !== undefined) {
    return new Date(val.seconds * 1000);
  }
  if (typeof val === 'object' && val._seconds !== undefined) {
    return new Date(val._seconds * 1000);
  }
  return null;
}

export function isPauseActive(establishment: any, currentDate: Date = new Date()): boolean {
  if (!establishment) return false;
  if (establishment.temporarilyPaused !== true) return false;
  if (establishment.pausedUntil) {
    const until = parseDate(establishment.pausedUntil);
    if (until) {
      return currentDate < until;
    }
  }
  return true; // Sem data definida significa pausa por tempo indeterminado
}

export function getEstablishmentOperationalState(
  establishment: any,
  currentDate: Date = new Date()
): EstablishmentOperationalState {
  if (!establishment) {
    return {
      storeStatus: "closed",
      ordersStatus: "unavailable",
      pauseStatus: "inactive",
      pauseEndsAt: null,
      canReceiveOrders: false,
      reason: "No establishment provided"
    };
  }

  // 1. Estabelecimento desativado, arquivado ou bloqueado administrativamente
  const active = establishment.active === true && establishment.suspended !== true;
  if (!active) {
    return {
      storeStatus: "closed",
      ordersStatus: "unavailable",
      pauseStatus: "inactive",
      pauseEndsAt: null,
      canReceiveOrders: false,
      reason: "Establishment is inactive or suspended"
    };
  }

  // 2. Loja fechada
  const open = establishment.open !== undefined 
    ? establishment.open === true 
    : establishment.isOpen === true;

  if (!open) {
    return {
      storeStatus: "closed",
      ordersStatus: "unavailable",
      pauseStatus: "inactive",
      pauseEndsAt: null,
      canReceiveOrders: false,
      reason: "Establishment is closed"
    };
  }

  // 3. Pausa temporária ativa
  const pauseActive = isPauseActive(establishment, currentDate);
  if (pauseActive) {
    const pauseEndsAt = establishment.pausedUntil ? parseDate(establishment.pausedUntil) : null;
    return {
      storeStatus: "open",
      ordersStatus: "paused",
      pauseStatus: "active",
      pauseEndsAt,
      canReceiveOrders: false,
      reason: "Establishment is temporarily paused"
    };
  }

  // 4. Aceitação manual de pedidos desativada
  const acceptingOrders = establishment.acceptingOrders !== undefined 
    ? establishment.acceptingOrders === true 
    : true;

  if (!acceptingOrders) {
    return {
      storeStatus: "open",
      ordersStatus: "paused",
      pauseStatus: "inactive",
      pauseEndsAt: null,
      canReceiveOrders: false,
      reason: "Orders are manually disabled"
    };
  }

  // 5. Operação normal
  return {
    storeStatus: "open",
    ordersStatus: "accepting",
    pauseStatus: "inactive",
    pauseEndsAt: null,
    canReceiveOrders: true,
    reason: null
  };
}

/**
 * Checks if an establishment can receive orders based on its current status.
 */
export function canEstablishmentReceiveOrders(establishment: any, currentDate: Date = new Date()): boolean {
  const state = getEstablishmentOperationalState(establishment, currentDate);
  return state.canReceiveOrders;
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h${minutes.toString().padStart(2, '0')}`;
  }
  return timeStr;
}

/**
 * Calculates the next opening text (e.g. "Abre hoje às 18h" or "Abre amanhã às 11h")
 * based on the business hours of an establishment relative to America/Sao_Paulo timezone.
 */
export function getNextOpeningTimeText(businessHours: any[] | undefined): string | null {
  if (!businessHours || businessHours.length === 0) return null;

  const now = new Date();
  
  try {
    const dayNameInPt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(now);
    // Normalize to capitalization matching the day name key
    const capitalizedDay = dayNameInPt.charAt(0).toUpperCase() + dayNameInPt.slice(1).toLowerCase();

    const timeString = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(now);
    
    const daysOfWeek = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
    const currentDayIdx = daysOfWeek.findIndex(d => d.toLowerCase() === capitalizedDay.toLowerCase());
    
    if (currentDayIdx === -1) return null;

    // Check if open today later:
    const todayBH = businessHours.find(bh => bh.day.toLowerCase() === capitalizedDay.toLowerCase());
    if (todayBH && todayBH.isOpen) {
      if (timeString < todayBH.openTime) {
        return `Abre hoje às ${formatTime(todayBH.openTime)}`;
      }
    }

    // Check tomorrow:
    const tomorrowIdx = (currentDayIdx + 1) % 7;
    const tomorrowDay = daysOfWeek[tomorrowIdx];
    const tomorrowBH = businessHours.find(bh => bh.day.toLowerCase() === tomorrowDay.toLowerCase());
    if (tomorrowBH && tomorrowBH.isOpen) {
      return `Abre amanhã às ${formatTime(tomorrowBH.openTime)}`;
    }

    // Find any next open day:
    for (let i = 2; i < 7; i++) {
      const nextIdx = (currentDayIdx + i) % 7;
      const nextDay = daysOfWeek[nextIdx];
      const nextBH = businessHours.find(bh => bh.day.toLowerCase() === nextDay.toLowerCase());
      if (nextBH && nextBH.isOpen) {
        return `Abre ${nextBH.day} às ${formatTime(nextBH.openTime)}`;
      }
    }
  } catch (e) {
    console.error("Error calculating business hours text:", e);
  }

  return null;
}

/**
 * Central function to calculate the total estimated delivery time in minutes.
 * Formula: estimatedTotalMinutes = baseEstimatedMinutes + additionalEstimatedMinutes
 * If baseEstimatedMinutes is undefined or null, it indicates that the establishment's preparation time is not configured yet.
 */
export function calculateEstimatedTotalMinutes(
  baseEstimatedMinutes: number | undefined | null,
  additionalMinutes: number | undefined | null
): number | undefined {
  if (baseEstimatedMinutes === undefined || baseEstimatedMinutes === null) {
    return undefined;
  }
  return Number(baseEstimatedMinutes) + Number(additionalMinutes || 0);
}

