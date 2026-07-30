import { PUBLIC_ESTABLISHMENT_CATEGORIES, Establishment } from '../types';
import { getEstablishmentCategoryIds } from './labelUtils';

export const getAvailableCategoriesForCity = (establishments: Establishment[], cityId: string) => {
  const activeEstablishments = establishments.filter((est) => {
    if (est.cityId !== cityId) return false;
    const isActive = est.platformStatus !== undefined 
      ? est.platformStatus === 'active'
      : (est.active === true && est.suspended !== true);
    return isActive;
  });

  const availableCategoryIds = new Set<string>();
  activeEstablishments.forEach((est) => {
    const catIds = getEstablishmentCategoryIds(est);
    catIds.forEach((id) => {
      availableCategoryIds.add(id);
    });
  });

  return [
    { id: 'all', label: 'Todos', icon: 'grid', public: true },
    ...PUBLIC_ESTABLISHMENT_CATEGORIES.filter((cat) => availableCategoryIds.has(cat.id))
  ];
};
