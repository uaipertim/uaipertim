import { OptionGroup } from '../types';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
  image?: string;
  sizes?: string[];
  borders?: string[];
  extras?: { name: string; price: number }[];
  optionGroups?: OptionGroup[];
  establishmentId?: string;
  menuCategoryId?: string;
  menuCategoryName?: string;
}
