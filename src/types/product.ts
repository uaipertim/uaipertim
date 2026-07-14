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
}
