export interface UserAddress {
  id?: string;
  label: 'Casa' | 'Trabalho' | 'Outro';
  recipientName: string;
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  cityId: 'sao-joao-batista-do-gloria-mg' | 'passos-mg';
  cityName: string;
  state: 'MG';
  reference?: string;
  isDefault: boolean;
  createdAt?: any;
  updatedAt?: any;
}
