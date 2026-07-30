import { Establishment, Product, SupportTicket, Feedback, DeliveryNeighborhood, BusinessHours, Order, City } from './types';

export const CITIES: City[] = [
  {
    id: "sao-joao-batista-do-gloria-mg",
    name: "São João Batista do Glória",
    state: "MG",
    active: true,
    default: true
  },
  {
    id: "passos-mg",
    name: "Passos",
    state: "MG",
    active: true,
    default: false
  }
];

export const INITIAL_ESTABLISHMENTS: Establishment[] = [
  // São João Batista do Glória - MG
  {
    id: 'pizzaria-da-praca',
    name: 'Pizzaria da Praça',
    category: 'Pizzas',
    rating: 4.9,
    deliveryTime: '35-50 min',
    deliveryFee: 5.00,
    minOrderValue: 25.00,
    isOpen: true,
    active: true,
    featured: true,
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=60',
    phone: '(35) 3524-1234',
    email: 'contato@pizzariadapraca.com.br',
    owner: 'Carlos Roberto da Silva',
    address: 'Praça Central, 120 - Centro',
    city: 'São João Batista do Glória',
    cityId: 'sao-joao-batista-do-gloria-mg',
    cityName: 'São João Batista do Glória',
    state: 'MG',
    document: '12.345.678/0001-90',
    companyName: 'Silva & Oliveira Pizzaria Ltda',
    platformFeePercent: 10,
    bairro: 'Centro',
    cep: '37920-000',
    atendeRetirada: true,
    entregaPropria: true,
    bairrosAtendidos: 'Centro, Jardim das Flores, Bela Vista'
  },
  {
    id: 'burger-do-gloria',
    name: 'Burger do Glória',
    category: 'Lanches',
    rating: 4.7,
    deliveryTime: '30-45 min',
    deliveryFee: 4.00,
    minOrderValue: 20.00,
    isOpen: true,
    active: true,
    featured: true,
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=60',
    phone: '(35) 3524-5678',
    email: 'contato@burgergloria.com.br',
    owner: 'Rodrigo Antunes',
    address: 'Av. Pinheiros, 45 - Centro',
    city: 'São João Batista do Glória',
    cityId: 'sao-joao-batista-do-gloria-mg',
    cityName: 'São João Batista do Glória',
    state: 'MG',
    document: '12.345.678/0002-11',
    companyName: 'Antunes Lanches Glória Ltda',
    platformFeePercent: 12,
    bairro: 'Centro',
    cep: '37920-000',
    atendeRetirada: true,
    entregaPropria: true,
    bairrosAtendidos: 'Centro, Novo Horizonte'
  },
  {
    id: 'sabor-mineiro',
    name: 'Sabor Mineiro',
    category: 'Mineira',
    rating: 4.8,
    deliveryTime: '40-55 min',
    deliveryFee: 6.00,
    minOrderValue: 25.00,
    isOpen: true,
    active: true,
    featured: false,
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=60',
    phone: '(35) 3524-9900',
    email: 'contato@sabormineiro.com.br',
    owner: 'Dona Maria da Silva',
    address: 'Av. Beira Rio, 200 - Centro',
    city: 'São João Batista do Glória',
    cityId: 'sao-joao-batista-do-gloria-mg',
    cityName: 'São João Batista do Glória',
    state: 'MG',
    document: '12.345.678/0003-22',
    companyName: 'Restaurante Sabor Mineiro EIRELI',
    platformFeePercent: 10,
    bairro: 'Centro',
    cep: '37920-000',
    atendeRetirada: true,
    entregaPropria: false,
    bairrosAtendidos: 'Centro, Panorama, Portal do Glória'
  },
  {
    id: 'mercado-central-do-gloria',
    name: 'Mercado Central do Glória',
    category: 'Mercados',
    rating: 4.6,
    deliveryTime: '45-60 min',
    deliveryFee: 7.00,
    minOrderValue: 30.00,
    isOpen: true,
    active: true,
    featured: false,
    image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=600&auto=format&fit=crop&q=60',
    phone: '(35) 3524-4411',
    email: 'contato@mercadogloria.com.br',
    owner: 'Antônio Pereira',
    address: 'Rua Minas Gerais, 310 - Centro',
    city: 'São João Batista do Glória',
    cityId: 'sao-joao-batista-do-gloria-mg',
    cityName: 'São João Batista do Glória',
    state: 'MG',
    document: '12.345.678/0004-33',
    companyName: 'Mercado Central Gloria Ltda',
    platformFeePercent: 8,
    bairro: 'Centro',
    cep: '37920-000',
    atendeRetirada: false,
    entregaPropria: true,
    bairrosAtendidos: 'Centro, Todo o município'
  },

  // Passos - MG
  {
    id: 'pizzaria-avenida',
    name: 'Pizzaria Avenida',
    category: 'Pizzas',
    rating: 4.8,
    deliveryTime: '35-50 min',
    deliveryFee: 6.00,
    minOrderValue: 25.00,
    isOpen: true,
    active: true,
    featured: true,
    image: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=600&auto=format&fit=crop&q=60',
    phone: '(35) 3521-1234',
    email: 'contato@pizzariaavenida.com.br',
    owner: 'José Alencar',
    address: 'Av. da Moda, 1100 - Centro',
    city: 'Passos',
    cityId: 'passos-mg',
    cityName: 'Passos',
    state: 'MG',
    document: '98.765.432/0001-10',
    companyName: 'Avenida Pizza & Massas Ltda',
    platformFeePercent: 10,
    bairro: 'Centro',
    cep: '37900-000',
    atendeRetirada: true,
    entregaPropria: true,
    bairrosAtendidos: 'Centro, Muarama, Penha, Belo Horizonte'
  },
  {
    id: 'burger-17',
    name: 'Burger 17',
    category: 'Lanches',
    rating: 4.8,
    deliveryTime: '30-45 min',
    deliveryFee: 5.00,
    minOrderValue: 20.00,
    isOpen: true,
    active: true,
    featured: true,
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=60',
    phone: '(35) 3521-5678',
    email: 'contato@burger17.com.br',
    owner: 'Rodrigo Antunes',
    address: 'Rua Santo Antônio, 417 - Penha',
    city: 'Passos',
    cityId: 'passos-mg',
    cityName: 'Passos',
    state: 'MG',
    document: '98.765.432/0002-20',
    companyName: 'Antunes Hambúrgueres Gourmet',
    platformFeePercent: 12,
    bairro: 'Penha',
    cep: '37900-120',
    atendeRetirada: true,
    entregaPropria: true,
    bairrosAtendidos: 'Centro, Penha, Muarama, Califórnia'
  },
  {
    id: 'sushi-nori',
    name: 'Sushi Nori',
    category: 'Japonesa',
    rating: 4.7,
    deliveryTime: '45-60 min',
    deliveryFee: 7.00,
    minOrderValue: 35.00,
    isOpen: true,
    active: true,
    featured: false,
    image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&auto=format&fit=crop&q=60',
    phone: '(35) 3521-9900',
    email: 'adm@sushinori.com.br',
    owner: 'Sayuri Tanaka',
    address: 'Rua Três de Maio, 75 - Muarama',
    city: 'Passos',
    cityId: 'passos-mg',
    cityName: 'Passos',
    state: 'MG',
    document: '45.678.901/0001-23',
    companyName: 'Tanaka Sushi Bar S/S',
    platformFeePercent: 11,
    bairro: 'Muarama',
    cep: '37900-250',
    atendeRetirada: true,
    entregaPropria: false,
    bairrosAtendidos: 'Centro, Muarama, Penha, Belo Horizonte, Canjeranus'
  },
  {
    id: 'mercado-passos',
    name: 'Mercado Passos',
    category: 'Mercados',
    rating: 4.5,
    deliveryTime: '45-65 min',
    deliveryFee: 8.00,
    minOrderValue: 30.00,
    isOpen: true,
    active: true,
    featured: false,
    image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=600&auto=format&fit=crop&q=60',
    phone: '(35) 3521-4411',
    email: 'comercial@mercadopassos.com.br',
    owner: 'Marcos de Souza',
    address: 'Av. Arnaldo de Oliveira, 1500 - Belo Horizonte',
    city: 'Passos',
    cityId: 'passos-mg',
    cityName: 'Passos',
    state: 'MG',
    document: '11.222.333/0001-44',
    companyName: 'Supermercado Passos Ltda',
    platformFeePercent: 8,
    bairro: 'Belo Horizonte',
    cep: '37900-400',
    atendeRetirada: false,
    entregaPropria: true,
    bairrosAtendidos: 'Centro, Belo Horizonte, Muarama, Coimbras'
  }
];

export const INITIAL_PRODUCTS: Record<string, Product[]> = {
  'pizzaria-da-praca': [
    {
      id: 'p-1',
      name: 'Pizza Calabresa',
      description: 'Molho de tomate artesanal da casa, muçarela de primeira qualidade, calabresa fatiada crocante, cebola roxa em rodelas finas e orégano.',
      price: 49.90,
      category: 'Pizzas tradicionais',
      available: true,
      image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop&q=80',
      sizes: ['Pequena', 'Média', 'Grande'],
      borders: ['Sem borda', 'Borda de Catupiry', 'Borda de Cheddar'],
      extras: [
        { name: 'Dobro de Queijo', price: 8.00 },
        { name: 'Cebola Extra', price: 2.00 },
        { name: 'Bacon fatiado', price: 6.50 }
      ]
    },
    {
      id: 'p-2',
      name: 'Pizza Frango com Catupiry',
      description: 'Molho de tomate, peito de frango desfiado temperado com ervas finas, muçarela e o legítimo requeijão cremoso Catupiry.',
      price: 54.90,
      category: 'Pizzas tradicionais',
      available: true,
      image: 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=500&auto=format&fit=crop&q=80',
      sizes: ['Pequena', 'Média', 'Grande'],
      borders: ['Sem borda', 'Borda de Catupiry', 'Borda de Cheddar'],
      extras: [
        { name: 'Creme de alho', price: 4.00 },
        { name: 'Azeitonas pretas inteiras', price: 3.50 }
      ]
    },
    {
      id: 'p-3',
      name: 'Pizza Portuguesa',
      description: 'Molho de tomate, presunto cozido ralado, muçarela, ovos cozidos, ervilhas frescas, cebola fatiada, azeitonas pretas selecionadas e orégano.',
      price: 57.90,
      category: 'Pizzas tradicionais',
      available: true,
      image: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=500&auto=format&fit=crop&q=80',
      sizes: ['Pequena', 'Média', 'Grande'],
      borders: ['Sem borda', 'Borda de Catupiry', 'Borda de Cheddar'],
      extras: [
        { name: 'Dobro de Presunto', price: 6.00 }
      ]
    },
    {
      id: 'p-4',
      name: 'Pizza Quatro Queijos',
      description: 'Molho de tomate artesanal, combinação perfeita de muçarela, provolone defumado, parmesão ralado na hora e Catupiry.',
      price: 59.90,
      category: 'Pizzas especiais',
      available: true,
      image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=500&auto=format&fit=crop&q=80',
      sizes: ['Pequena', 'Média', 'Grande'],
      borders: ['Sem borda', 'Borda de Catupiry', 'Borda de Cheddar'],
      extras: [
        { name: 'Gorgonzola extra', price: 7.00 }
      ]
    },
    {
      id: 'p-5',
      name: 'Combo Família',
      description: '1 Pizza Grande Tradicional (Calabresa, Frango ou Portuguesa) + 1 Refrigerante de 2 Litros bem gelado + Borda de Catupiry grátis.',
      price: 69.90,
      category: 'Combos',
      available: true,
      image: 'https://images.unsplash.com/photo-1604917621956-10dfa7cce2e7?w=500&auto=format&fit=crop&q=80',
      sizes: ['Grande'],
      borders: ['Borda de Catupiry', 'Sem borda', 'Borda de Cheddar'],
    },
    {
      id: 'p-6',
      name: 'Refrigerante 2 litros',
      description: 'Garrafa pet de 2 Litros. Opções: Coca-Cola, Guaraná Antarctica ou Fanta Laranja. Escolha na observação.',
      price: 12.00,
      category: 'Bebidas',
      available: true,
      image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=80'
    }
  ],
  'pizzaria-avenida': [
    {
      id: 'pa-1',
      name: 'Pizza Margherita Especial',
      description: 'Molho de tomate fresco, muçarela especial fatiada, rodelas de tomate cereja maduro, manjericão fresco gigante e azeite de oliva extra virgem.',
      price: 47.90,
      category: 'Pizzas tradicionais',
      available: true,
      image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop&q=80',
      sizes: ['Pequena', 'Média', 'Grande'],
      borders: ['Sem borda', 'Borda de Catupiry'],
      extras: [
        { name: 'Tomate extra', price: 2.00 }
      ]
    },
    {
      id: 'pa-2',
      name: 'Pizza de Lombo com Catupiry',
      description: 'Lombo canadense fatiado de qualidade superior, cebola caramelizada, muçarela e generoso requeijão Catupiry.',
      price: 56.90,
      category: 'Pizzas especiais',
      available: true,
      image: 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=500&auto=format&fit=crop&q=80',
      sizes: ['Média', 'Grande'],
      borders: ['Sem borda', 'Borda de Catupiry', 'Borda de Cheddar']
    }
  ],
  'burger-do-gloria': [
    {
      id: 'bg-1',
      name: 'Glória Burger',
      description: 'Pão brioche selado na manteiga de garrafa, blend de costela angus 160g, queijo coalho grelhado, melado de cana e rúcula fresca.',
      price: 32.90,
      category: 'Lanches',
      available: true,
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80',
    },
    {
      id: 'bg-2',
      name: 'Double Cheddar do Vale',
      description: 'Dois blends de carne artesanal 120g cada, muito queijo cheddar cremoso e cebola picadinha na chapa.',
      price: 38.90,
      category: 'Lanches',
      available: true,
      image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500&auto=format&fit=crop&q=80',
    }
  ],
  'burger-17': [
    {
      id: 'b-1',
      name: 'Burger Clássico',
      description: 'Pão de brioche selado, blend de carne artesanal de 150g, queijo prato derretido, maionese artesanal da casa, tomate e alface americana fresca.',
      price: 28.90,
      category: 'Lanches',
      available: true,
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80',
    },
    {
      id: 'b-2',
      name: 'Burger Bacon Crispy',
      description: 'Pão de brioche, blend de carne de 150g, muito bacon fatiado crocante, queijo cheddar derretido e molho barbecue rústico.',
      price: 34.90,
      category: 'Lanches',
      available: true,
      image: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500&auto=format&fit=crop&q=80',
    },
    {
      id: 'b-3',
      name: 'Batata Rústica Individual',
      description: 'Batatas fritas com corte rústico especial, temperadas com sal, alecrim e alho frito na temperatura perfeita.',
      price: 12.00,
      category: 'Porções',
      available: true,
      image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=80',
    }
  ],
  'sabor-mineiro': [
    {
      id: 'sm-1',
      name: 'Feijoada Completa',
      description: 'Deliciosa feijoada com carnes nobres (carne seca, lombo, costelinha e paio). Acompanha arroz, couve refogada na manteiga, farofa artesanal, vinagrete e laranja.',
      price: 38.90,
      category: 'Refeições',
      available: true,
      image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop&q=80',
    },
    {
      id: 'sm-2',
      name: 'Mexido de Minas Especial',
      description: 'Arroz, feijão, pernil desfiado, couve, ovo frito com gema mole, bacon crocante, calabresa e banana da terra grelhada.',
      price: 34.90,
      category: 'Refeições',
      available: true,
      image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop&q=80',
    }
  ],
  'sushi-nori': [
    {
      id: 's-1',
      name: 'Combo Nori Tradicional (20 peças)',
      description: 'Deliciosa seleção contendo 5 sashimis de salmão, 5 niguiris de salmão, 5 uramakis Philadelphia e 5 hossomakis de salmão fresco.',
      price: 59.90,
      category: 'Combos',
      available: true,
      image: 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=500&auto=format&fit=crop&q=80',
    },
    {
      id: 's-2',
      name: 'Temaki Salmão Completo',
      description: 'Cone de alga crocante (Nori), recheado generosamente com arroz japonês cozido (shari), salmão fresco em cubos, cream cheese e cebolinha.',
      price: 26.90,
      category: 'Temakis',
      available: true,
      image: 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=500&auto=format&fit=crop&q=80',
    }
  ],
  'mercado-central-do-gloria': [
    {
      id: 'mcg-1',
      name: 'Queijo Canastra Real 500g',
      description: 'O legítimo e premiado Queijo Canastra artesanal, meia cura, sabor marcante e casca amarela lisa.',
      price: 45.00,
      category: 'Laticínios',
      available: true,
      image: 'https://images.unsplash.com/photo-1589881133595-a3c085cb1493?w=500&auto=format&fit=crop&q=80',
    },
    {
      id: 'mcg-2',
      name: 'Doce de Leite Viçosa 400g',
      description: 'Doce de leite cremoso tradicional Viçosa, considerado o melhor do Brasil por sucessivos prêmios.',
      price: 19.90,
      category: 'Doces',
      available: true,
      image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500&auto=format&fit=crop&q=80',
    }
  ],
  'mercado-passos': [
    {
      id: 'mp-1',
      name: 'Pack de Cerveja Heineken 6 Latas',
      description: 'Cerveja Heineken Lager 350ml. Pack com 6 latas de alumínio. Entrega rápida e gelada garantida!',
      price: 32.90,
      category: 'Bebidas',
      available: true,
      image: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=500&auto=format&fit=crop&q=80',
    },
    {
      id: 'mp-2',
      name: 'Carvão Vegetal Premium 4kg',
      description: 'Saco de carvão vegetal de eucalipto premium de queima limpa e longa duração. Perfeito para o churrasco do final de semana.',
      price: 19.90,
      category: 'Churrasco',
      available: true,
      image: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=500&auto=format&fit=crop&q=80',
    }
  ]
};

export const INITIAL_NEIGHBORHOODS: DeliveryNeighborhood[] = [
  // São João Batista do Glória - MG
  { id: 'gloria-centro', name: 'Centro', fee: 5.00, timeEstimate: '30-40 min', cityId: 'sao-joao-batista-do-gloria-mg' },
  { id: 'gloria-jardim-planalto', name: 'Jardim Planalto', fee: 7.00, timeEstimate: '35-45 min', cityId: 'sao-joao-batista-do-gloria-mg' },
  { id: 'gloria-vila-nova', name: 'Vila Nova', fee: 8.00, timeEstimate: '40-50 min', cityId: 'sao-joao-batista-do-gloria-mg' },
  { id: 'gloria-parque-das-flores', name: 'Parque das Flores', fee: 10.00, timeEstimate: '45-55 min', cityId: 'sao-joao-batista-do-gloria-mg' },
  { id: 'gloria-distrito-industrial', name: 'Distrito Industrial', fee: 12.00, timeEstimate: '50-60 min', cityId: 'sao-joao-batista-do-gloria-mg' },
  
  // Passos - MG
  { id: 'passos-centro', name: 'Centro', fee: 6.00, timeEstimate: '25-35 min', cityId: 'passos-mg' },
  { id: 'passos-coimbras', name: 'Coimbras', fee: 8.00, timeEstimate: '30-40 min', cityId: 'passos-mg' },
  { id: 'passos-bela-vista', name: 'Bela Vista', fee: 8.00, timeEstimate: '30-40 min', cityId: 'passos-mg' },
  { id: 'passos-penha', name: 'Penha', fee: 9.00, timeEstimate: '35-45 min', cityId: 'passos-mg' },
  { id: 'passos-muarama', name: 'Muarama', fee: 10.00, timeEstimate: '35-45 min', cityId: 'passos-mg' }
];

export const INITIAL_BUSINESS_HOURS: BusinessHours[] = [
  { day: 'Segunda-feira', isOpen: false, openTime: '18:00', closeTime: '23:30' },
  { day: 'Terça-feira', isOpen: true, openTime: '18:00', closeTime: '23:30' },
  { day: 'Quarta-feira', isOpen: true, openTime: '18:00', closeTime: '23:30' },
  { day: 'Quinta-feira', isOpen: true, openTime: '18:00', closeTime: '23:30' },
  { day: 'Sexta-feira', isOpen: true, openTime: '18:00', closeTime: '23:30' },
  { day: 'Sábado', isOpen: true, openTime: '18:00', closeTime: '00:00' },
  { day: 'Domingo', isOpen: true, openTime: '18:00', closeTime: '23:30' },
];

export const INITIAL_TICKETS: SupportTicket[] = [
  {
    id: 'T-1002',
    sender: 'Carlos Roberto (Pizzaria da Praça)',
    type: 'estabelecimento',
    subject: 'Alteração de taxa de repasse',
    description: 'Olá, gostaria de verificar se é possível revisar nossa taxa atual de repasse do UaiPertim, tendo em vista que atingimos mais de 150 pedidos concluídos no mês.',
    priority: 'media',
    status: 'respondido',
    date: '2026-07-10T14:30:00Z',
    replies: [
      {
        sender: 'Suporte UaiPertim',
        message: 'Olá, Carlos! Parabéns pela excelente marca de pedidos. Sua solicitação de redução da taxa foi encaminhada ao nosso setor financeiro para análise especial. Retornaremos em breve!',
        date: '2026-07-10T16:15:00Z'
      }
    ]
  },
  {
    id: 'T-1003',
    sender: 'Renata Souza (Cliente)',
    type: 'cliente',
    subject: 'Dúvida sobre cupom de desconto',
    description: 'Tentei utilizar o cupom PEDENOVO e deu como expirado, mas sou nova na plataforma. Conseguem me ajudar?',
    priority: 'baixa',
    status: 'aberto',
    date: '2026-07-11T16:10:00Z',
    replies: []
  },
  {
    id: 'T-1004',
    sender: 'Burger 17 (Estabelecimento)',
    type: 'estabelecimento',
    subject: 'Problemas de conexão na impressora térmica',
    description: 'O aplicativo do painel do estabelecimento está tendo dificuldades para enviar a via do motoboy de forma automática. Conseguem fornecer auxílio técnico?',
    priority: 'alta',
    status: 'aberto',
    date: '2026-07-11T17:01:00Z',
    replies: []
  }
];

export const INITIAL_FEEDBACKS: Feedback[] = [
  {
    id: 'F-1',
    customerName: 'Aline Vieira',
    establishmentName: 'Pizzaria da Praça',
    rating: 5,
    comment: 'A pizza de calabresa chegou super crocante e quente! Com certeza pedirei de novo, o UaiPertim é muito prático.',
    date: '2026-07-09T21:44:00Z',
    approved: true
  },
  {
    id: 'F-2',
    customerName: 'José Camargo',
    establishmentName: 'Burger 17',
    rating: 4,
    comment: 'Hambúrguer de bacon sensacional, só atrasou um pouquinho por conta da chuva intensa, mas o atendimento foi impecável.',
    date: '2026-07-10T20:15:00Z',
    approved: true
  },
  {
    id: 'F-3',
    customerName: 'Mariana Lima',
    establishmentName: 'Pizzaria da Praça',
    rating: 5,
    comment: 'O melhor combo de fim de semana! Chega muito rápido e as bordas de Catupiry são incríveis.',
    date: '2026-07-11T15:20:00Z',
    approved: true
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: '#PL-7301',
    createdAt: '2026-07-11T15:10:00Z',
    customerName: 'Ana Beatriz Mendes',
    customerPhone: '(35) 99876-5432',
    customerAddress: {
      street: 'Rua das Palmeiras',
      number: '142',
      bairro: 'Jardim Planalto',
      complement: 'Apt 22, Bloco B'
    },
    items: [
      {
        product: {
          id: 'p-1',
          name: 'Pizza Calabresa',
          description: 'Molho de tomate artesanal da casa, muçarela de primeira qualidade, calabresa fatiada crocante, cebola roxa em rodelas finas e orégano.',
          price: 49.90,
          category: 'Pizzas tradicionais',
          available: true
        },
        quantity: 1,
        selectedSize: 'Grande',
        selectedBorder: 'Borda de Catupiry',
        selectedExtras: [
          { name: 'Dobro de Queijo', price: 8.00 }
        ],
        notes: 'Sem cebola em uma das metades por favor.'
      }
    ],
    subtotal: 57.90,
    deliveryFee: 7.00,
    discount: 5.00,
    total: 59.90,
    paymentMethod: 'pix',
    paymentStatus: 'paid',
    deliveryType: 'entrega',
    notes: 'Entregar na portaria',
    establishmentId: 'pizzaria-da-praca',
    establishmentName: 'Pizzaria da Praça',
    cityId: 'sao-joao-batista-do-gloria-mg',
    cityName: 'São João Batista do Glória',
    state: 'MG',
    status: 'concluido'
  },
  {
    id: '#PL-7302',
    createdAt: '2026-07-11T16:45:00Z',
    customerName: 'Guilherme Peixoto',
    customerPhone: '(35) 98112-3456',
    customerAddress: {
      street: 'Av. Getúlio Vargas',
      number: '920',
      bairro: 'Centro'
    },
    items: [
      {
        product: {
          id: 'p-5',
          name: 'Combo Família',
          description: '1 Pizza Grande Tradicional (Calabresa, Frango ou Portuguesa) + 1 Refrigerante de 2 Litros bem gelado + Borda de Catupiry grátis.',
          price: 69.90,
          category: 'Combos',
          available: true
        },
        quantity: 1,
        selectedSize: 'Grande',
        selectedBorder: 'Borda de Catupiry',
        selectedExtras: [],
        notes: 'Pizza de Frango com Catupiry no combo'
      }
    ],
    subtotal: 69.90,
    deliveryFee: 5.00,
    discount: 0,
    total: 74.90,
    paymentMethod: 'entrega_cartao',
    paymentStatus: 'pending',
    deliveryType: 'entrega',
    establishmentId: 'pizzaria-da-praca',
    establishmentName: 'Pizzaria da Praça',
    cityId: 'sao-joao-batista-do-gloria-mg',
    cityName: 'São João Batista do Glória',
    state: 'MG',
    status: 'em_preparacao'
  }
];
