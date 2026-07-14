export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'cliente' | 'estabelecimento' | 'administrador';
  createdAt: string;
  active: boolean;
}
