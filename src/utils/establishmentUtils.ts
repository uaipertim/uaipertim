import { Establishment } from '../types';

/**
 * Checks if an establishment can receive orders based on its current status.
 *
 * Requirements:
 * - active === true (registered and visible on the platform)
 * - open === true (open at this moment)
 * - acceptingOrders === true (accepting new orders)
 * - temporarilyPaused !== true (not temporarily paused)
 * - suspended !== true (not administratively suspended)
 */
export function canEstablishmentReceiveOrders(establishment: any): boolean {
  if (!establishment) return false;

  // active is required to be explicitly true
  const active = establishment.active === true;

  // open is required to be explicitly true. If open is undefined, fallback to isOpen
  const open = establishment.open !== undefined 
    ? establishment.open === true 
    : establishment.isOpen === true;

  // acceptingOrders is required to be explicitly true (defaults to true if undefined)
  const acceptingOrders = establishment.acceptingOrders !== undefined 
    ? establishment.acceptingOrders === true 
    : true;

  // temporarilyPaused must not be true
  const temporarilyPaused = establishment.temporarilyPaused === true;

  // suspended must not be true
  const suspended = establishment.suspended === true;

  return active && open && acceptingOrders && !temporarilyPaused && !suspended;
}

/**
 * Calculates the next opening text (e.g. "Abre hoje às 18h00" or "Abre amanhã às 11h00")
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
        return `Abre hoje às ${todayBH.openTime}`;
      }
    }

    // Check tomorrow:
    const tomorrowIdx = (currentDayIdx + 1) % 7;
    const tomorrowDay = daysOfWeek[tomorrowIdx];
    const tomorrowBH = businessHours.find(bh => bh.day.toLowerCase() === tomorrowDay.toLowerCase());
    if (tomorrowBH && tomorrowBH.isOpen) {
      return `Abre amanhã às ${tomorrowBH.openTime}`;
    }

    // Find any next open day:
    for (let i = 2; i < 7; i++) {
      const nextIdx = (currentDayIdx + i) % 7;
      const nextDay = daysOfWeek[nextIdx];
      const nextBH = businessHours.find(bh => bh.day.toLowerCase() === nextDay.toLowerCase());
      if (nextBH && nextBH.isOpen) {
        return `Abre ${nextBH.day} às ${nextBH.openTime}`;
      }
    }
  } catch (e) {
    console.error("Error calculating business hours text:", e);
  }

  return null;
}
