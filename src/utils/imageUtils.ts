import { Establishment } from '../types';

export const resolveEstablishmentLogo = (est: Establishment | any): string => {
  // Priority: 1. logoUrl (canonical), 2. legacy fields, 3. fallback
  const url = est?.logoUrl || est?.logo || est?.imageUrl || est?.image || null;
  
  // Return the URL or a placeholder if it's empty
  return url && url.trim().length > 0 ? url.trim() : ''; 
};

export const resolveEstablishmentCover = (est: Establishment | any): string => {
  // Priority: 1. coverImageUrl (canonical), 2. legacy fields, 3. fallback
  const url = est?.coverImageUrl || est?.coverUrl || est?.bannerUrl || est?.imageUrl || est?.image || null;
  
  return url && url.trim().length > 0 ? url.trim() : '';
};
