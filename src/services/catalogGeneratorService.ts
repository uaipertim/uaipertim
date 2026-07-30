import { db } from "../lib/firebase";
import { collection, doc, writeBatch, getDocs, query, where } from "firebase/firestore";
import { Product, MenuCategory, Establishment, OptionGroup } from "../types";
import { INITIAL_PRODUCTS } from "../initialData";

export interface GeneratorAnalysis {
  activeSource: "local" | "firestore";
  totalEstablishments: number;
  emptyEstablishments: { id: string; name: string; category: string }[];
  filledEstablishments: { id: string; name: string; category: string; productCount: number }[];
}

export interface GeneratorPreview {
  activeSource: "local" | "firestore";
  establishmentsCount: number;
  categoriesToCreate: { establishmentId: string; name: string; sortOrder: number }[];
  productsToCreate: { establishmentId: string; name: string; categoryName: string; price: number; isFeatured: boolean }[];
}

export interface GenerationResult {
  success: boolean;
  message: string;
  createdCategoriesCount: number;
  createdProductsCount: number;
  // For local mode updates
  localProducts?: Record<string, Product[]>;
  localCategories?: Record<string, MenuCategory[]>;
}

export interface CatalogInventorySummary {
  establishmentId: string;
  totalProducts: number;
  realProducts: number;
  demoProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  productIds: string[];
  source: "firestore";
  databaseId: string;
}

export type CatalogStatus = 
  | "SEM_CATALOGO"
  | "CATALOGO_REAL"
  | "CATALOGO_DEMONSTRATIVO"
  | "CATALOGO_MISTO"
  | "REVISAO_NECESSARIA";

export interface CatalogEligibility {
  isEligible: boolean;
  status:
    | "empty"
    | "real_catalog"
    | "demo_catalog"
    | "mixed_catalog"
    | "review_required"
    | "inventory_error";
  reason: string | null;
  totalProducts: number;
  realProducts: number;
  demoProducts: number;
  mappedSegment: string | null;
  templateId: string | null;
}

export function calculateCatalogEligibility(
  est: Establishment | any,
  inventory: CatalogInventorySummary,
  dataSource: "local" | "firestore"
): CatalogEligibility {
  const segment = mapEstablishmentCategoryToSegment(est);
  const isCompatible = segment !== "revisao_necessaria";
  const templateId = isCompatible ? segment : null;

  const mapping = {
    status: isCompatible ? ("compatible" as const) : ("incompatible" as const),
    segment: segment,
    templateId: templateId,
  };

  const databaseId = inventory.databaseId;

  const isCatalogEmpty =
    inventory.totalProducts === 0 &&
    inventory.realProducts === 0 &&
    inventory.demoProducts === 0;

  const hasCompatibleTemplate =
    mapping.status === "compatible" &&
    mapping.segment !== "revisao_necessaria" &&
    Boolean(mapping.templateId);

  const hasValidSource =
    (dataSource === "firestore" && Boolean(databaseId)) ||
    dataSource === "local";

  const isEligible =
    isCatalogEmpty &&
    hasCompatibleTemplate &&
    hasValidSource;

  let status: CatalogEligibility["status"] = "empty";
  let reason = "Estabelecimento sem catálogo e elegível para geração.";

  if (!hasCompatibleTemplate) {
    status = "review_required";
    reason = "Defina ou revise a categoria do estabelecimento antes de gerar o catálogo.";
  } else if (!hasValidSource) {
    status = "inventory_error";
    reason = "Não foi possível confirmar o catálogo deste estabelecimento. Tente novamente.";
  } else if (inventory.realProducts > 0 && inventory.demoProducts > 0) {
    status = "mixed_catalog";
    reason = "Este estabelecimento possui produtos reais e demonstrativos.";
  } else if (inventory.realProducts > 0) {
    status = "real_catalog";
    reason = "Este estabelecimento já possui produtos reais cadastrados.";
  } else if (inventory.demoProducts > 0) {
    status = "demo_catalog";
    reason = "Este estabelecimento já possui um catálogo demonstrativo.";
  }

  return {
    isEligible: isEligible && status === "empty",
    status,
    reason,
    totalProducts: inventory.totalProducts,
    realProducts: inventory.realProducts,
    demoProducts: inventory.demoProducts,
    mappedSegment: segment,
    templateId,
  };
}

/**
 * Single source of truth for catalog inventory analysis on Cloud Firestore.
 */
export async function getCatalogInventorySummary(
  establishmentId: string
): Promise<CatalogInventorySummary> {
  const FIRESTORE_DATABASE_ID = "ai-studio-uaipertim-1ec226bc-5361-4d8f-93aa-92f62786acfe";
  const prodsColl = collection(db, "products");
  const q = query(prodsColl, where("establishmentId", "==", establishmentId));
  const snapshot = await getDocs(q);

  let realProducts = 0;
  let demoProducts = 0;
  let activeProducts = 0;
  let inactiveProducts = 0;
  const productIds: string[] = [];

  snapshot.forEach((docSnap) => {
    const p = docSnap.data();
    productIds.push(docSnap.id);

    // Rule 6: isDemo === true && demoSource === "automatic-catalog-generator"
    const isGeneratedDemoProduct =
      p.isDemo === true &&
      p.demoSource === "automatic-catalog-generator";

    if (isGeneratedDemoProduct) {
      demoProducts++;
    } else {
      realProducts++;
    }

    if (p.active !== false) {
      activeProducts++;
    } else {
      inactiveProducts++;
    }
  });

  return {
    establishmentId,
    totalProducts: snapshot.size,
    realProducts,
    demoProducts,
    activeProducts,
    inactiveProducts,
    productIds,
    source: "firestore",
    databaseId: FIRESTORE_DATABASE_ID,
  };
}

export function getCatalogStatus(summary: CatalogInventorySummary | null, err?: any): CatalogStatus {
  if (err || !summary) return "REVISAO_NECESSARIA";
  if (summary.totalProducts === 0) return "SEM_CATALOGO";
  if (summary.realProducts > 0 && summary.demoProducts > 0) return "CATALOGO_MISTO";
  if (summary.realProducts > 0) return "CATALOGO_REAL";
  if (summary.demoProducts > 0) return "CATALOGO_DEMONSTRATIVO";
  return "REVISAO_NECESSARIA";
}

// Map Unsplash images to segment topics for beautiful presentation
export const PLACEHOLDER_IMAGES: Record<string, string[]> = {
  pizzaria: [
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1571066811602-71683a3f680d?w=500&auto=format&fit=crop&q=80",
  ],
  hamburgueria: [
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1550547660-d9450f859349?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=500&auto=format&fit=crop&q=80",
  ],
  restaurante: [
    "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1554502078-ef0fc409efce?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop&q=80",
  ],
  padaria: [
    "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500&auto=format&fit=crop&q=80",
  ],
  mercado: [
    "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1583258292688-d0213df4a3a8?w=500&auto=format&fit=crop&q=80",
  ],
  farmacia: [
    "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1631549916768-4119cb210140?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1607619056574-7b8d304f3c6f?w=500&auto=format&fit=crop&q=80",
  ],
  petshop: [
    "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=500&auto=format&fit=crop&q=80",
  ],
  agropecuaria: [
    "https://images.unsplash.com/photo-1589923188900-85dae523342b?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=500&auto=format&fit=crop&q=80",
  ],
  acai: [
    "https://images.unsplash.com/photo-1590301157890-4810ed352733?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500&auto=format&fit=crop&q=80",
  ],
  floricultura: [
    "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1596436889106-be35e843f974?w=500&auto=format&fit=crop&q=80",
  ],
  papelaria: [
    "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=500&auto=format&fit=crop&q=80",
  ],
  construcao: [
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?w=500&auto=format&fit=crop&q=80",
  ],
  utilidades: [
    "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1610701596007-11502861affa?w=500&auto=format&fit=crop&q=80",
  ],
  japonesa: [
    "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1553621042-f6e147245754?w=500&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1583623025817-d180a2221d0a?w=500&auto=format&fit=crop&q=80",
  ],
};

const DEFAULT_IMAGES = [
  "https://images.unsplash.com/photo-1470304780262-fa461dbe0574?w=500&auto=format&fit=crop&q=80"
];

function getRandomImage(segment: string, index: number): string {
  const list = PLACEHOLDER_IMAGES[segment] || DEFAULT_IMAGES;
  return list[index % list.length];
}

// Internal template interface
interface ItemTemplate {
  name: string;
  description: string;
  price: number;
  categoryName: string;
  isFeatured?: boolean;
  sizes?: string[];
  borders?: string[];
  extras?: { name: string; price: number }[];
  optionGroups?: OptionGroup[];
  preparedToOrder?: boolean;
  freshIngredients?: boolean;
}

export const SEGMENT_TEMPLATES: Record<string, ItemTemplate[]> = {
  pizzaria: [
    {
      name: "Pizza Calabresa Clássica",
      description: "Molho de tomate artesanal, muçarela, calabresa fatiada crocante, cebola roxa e orégano chileno.",
      price: 49.90,
      categoryName: "Pizzas Tradicionais",
      isFeatured: true,
      sizes: ["Pequena", "Média", "Grande"],
      borders: ["Sem borda", "Catupiry", "Cheddar"],
      extras: [{ name: "Queijo Extra", price: 7.50 }, { name: "Bacon Extra", price: 6.00 }]
    },
    {
      name: "Pizza Margherita Speciale",
      description: "Molho de tomate fresco, muçarela de búfala fatiada, tomate cereja confitado e manjericão fresco gigante.",
      price: 45.90,
      categoryName: "Pizzas Tradicionais",
      sizes: ["Pequena", "Média", "Grande"],
      borders: ["Sem borda", "Catupiry"],
    },
    {
      name: "Pizza Quatro Queijos Nobres",
      description: "Combinação harmoniosa de queijo muçarela, provolone defumado, gorgonzola Dolce e requeijão cremoso da Canastra.",
      price: 54.90,
      categoryName: "Pizzas Tradicionais",
      isFeatured: true,
      sizes: ["Pequena", "Média", "Grande"],
      borders: ["Sem borda", "Catupiry", "Cheddar"],
    },
    {
      name: "Pizza Frango Caipira com Catupiry",
      description: "Frango caipira desfiado e temperado na chapa, muçarela fatiada e o legítimo requeijão cremoso Catupiry.",
      price: 52.90,
      categoryName: "Pizzas Tradicionais",
      sizes: ["Pequena", "Média", "Grande"],
      borders: ["Sem borda", "Catupiry", "Cheddar"],
    },
    {
      name: "Pizza Suprema de Parma",
      description: "Molho rústico de tomate, muçarela especial, fatias finas de presunto Parma curado, rúcula selvática fresca e lascas de parmesão.",
      price: 69.90,
      categoryName: "Pizzas Especiais",
      isFeatured: true,
      sizes: ["Média", "Grande"],
      borders: ["Sem borda", "Catupiry"],
    },
    {
      name: "Pizza Shiitake com Alho Poró",
      description: "Cogumelos shiitake salteados na manteiga de ervas, alho poró confitado, muçarela e sal salpicado.",
      price: 64.90,
      categoryName: "Pizzas Especiais",
      sizes: ["Média", "Grande"],
      borders: ["Sem borda"],
    },
    {
      name: "Pizza Doce de Nutella com Morangos",
      description: "Creme artesanal de Nutella com fatias generosas de morangos frescos colhidos no dia e raspas de chocolate branco.",
      price: 44.90,
      categoryName: "Pizzas Doces",
      sizes: ["Pequena", "Média"],
      borders: ["Sem borda"],
    },
    {
      name: "Pizza Banoffee Especial",
      description: "Doce de leite cremoso caseiro, bananas caramelizadas fatiadas, pitadas de canela em pó e chantilly leve.",
      price: 42.90,
      categoryName: "Pizzas Doces",
      sizes: ["Pequena", "Média"],
      borders: ["Sem borda"],
    },
    {
      name: "Refrigerante Coca-Cola Lata 350ml",
      description: "Lata bem gelada de refrigerante Coca-Cola.",
      price: 6.00,
      categoryName: "Bebidas",
    },
    {
      name: "Guaraná Antarctica Lata 350ml",
      description: "Lata bem gelada de Guaraná Antarctica.",
      price: 6.00,
      categoryName: "Bebidas",
    },
    {
      name: "Água Mineral Sem Gás 500ml",
      description: "Água mineral da fonte natural bem gelada.",
      price: 4.00,
      categoryName: "Bebidas",
    }
  ],
  hamburgueria: [
    {
      name: "X-Salada Premium",
      description: "Blend de carne de 150g, queijo muçarela derretido, alface crespa fatiada, tomate fresco, maionese artesanal verde e pão de brioche tostado.",
      price: 24.90,
      categoryName: "Hambúrgueres Artesanais",
      extras: [{ name: "Carne Extra 150g", price: 8.00 }, { name: "Bacon Extra", price: 5.00 }, { name: "Queijo Cheddar Extra", price: 4.00 }],
      preparedToOrder: true,
      freshIngredients: true,
    },
    {
      name: "Double Smash Bacon Cheddar",
      description: "Dois blends smash de 80g ultra prensados com casquinha crocante, muito bacon fatiado crocante, queijo cheddar cremoso e pão brioche selado.",
      price: 32.90,
      categoryName: "Hambúrgueres Artesanais",
      isFeatured: true,
      extras: [{ name: "Carne Extra 80g", price: 5.00 }, { name: "Queijo Cheddar Extra", price: 4.00 }],
      preparedToOrder: true,
      freshIngredients: false,
    },
    {
      name: "Monster Burger Duplo",
      description: "Dois blends suculentos de 150g cada, queijo cheddar derretido em camadas, cebola caramelizada na chapa, bacon em tiras e molho barbecue.",
      price: 38.90,
      categoryName: "Hambúrgueres Artesanais",
      isFeatured: true,
    },
    {
      name: "Burguer Vegetariano de Grão de Bico",
      description: "Hambúrguer crocante de grão de bico 150g temperado com ervas finas, maionese vegana, alface, tomate fresco e pão australiano macio.",
      price: 26.90,
      categoryName: "Hambúrgueres Artesanais",
    },
    {
      name: "Combo Individual Completo",
      description: "Acompanha o X-Salada Premium, uma porção individual de batata frita ondulada rústica e um Refrigerante Lata 350ml bem gelado.",
      price: 42.90,
      categoryName: "Combos e Ofertas",
      isFeatured: true,
    },
    {
      name: "Combo Família Monstros",
      description: "Acompanha 2 Double Smash Bacon Cheddar, uma porção grande de batata frita especial e um Refrigerante Coca-Cola de 2 Litros.",
      price: 74.90,
      categoryName: "Combos e Ofertas",
    },
    {
      name: "Batata Frita Ondulada com Cheddar e Bacon",
      description: "Porção generosa de batatas fritas onduladas crocantes, cobertas com calda cremosa de cheddar quente e salpicadas de bacon triturado.",
      price: 22.90,
      categoryName: "Porções Crocantes",
    },
    {
      name: "Onion Rings Crocantes Extra",
      description: "Anéis gigantes de cebola empanados em farinha Panko ultra crocantes, servidos com pote de molho barbecue defumado especial.",
      price: 18.90,
      categoryName: "Porções Crocantes",
    },
    {
      name: "Refrigerante Lata 350ml",
      description: "Refrigerante em lata bem gelado à sua escolha.",
      price: 6.00,
      categoryName: "Bebidas",
    },
    {
      name: "Suco Natural de Polpa de Maracujá",
      description: "Suco natural de maracujá preparado na hora com água mineral gelada.",
      price: 8.00,
      categoryName: "Bebidas",
    }
  ],
  restaurante: [
    {
      name: "Prato Feito Caipira",
      description: "Arroz soltinho branco, feijão carioquinha cozido no dia, ovo frito com gema mole, bife acebolado de alcatra na chapa e salada simples.",
      price: 25.90,
      categoryName: "Pratos Executivos",
      extras: [{ name: "Ovo Frito Extra", price: 2.50 }, { name: "Bife Acebolado Extra", price: 10.00 }]
    },
    {
      name: "Feijoada Completa Individual",
      description: "Nossa feijoada cozida em panela de barro com carnes nobres (bacon, paio, costelinha e lombo), acompanhada de arroz, couve refogada, farofa e laranja.",
      price: 39.90,
      categoryName: "Pratos Executivos",
      isFeatured: true,
      extras: [{ name: "Torresmo Pururuca Extra", price: 6.00 }]
    },
    {
      name: "Frango com Quiabo à Moda Mineira",
      description: "Frango caipira cozido lentamente no molho pardo rústico com quiabo sem baba fresco e ervas, acompanhado de arroz e angu de milho verde.",
      price: 34.90,
      categoryName: "Pratos Executivos",
    },
    {
      name: "Tutu de Feijão com Bisteca Grelhada",
      description: "Tutu de feijão cremoso batido com bacon e linguiça, acompanhado de arroz branco, bisteca de porco grelhada na chapa e couve fatiada fininha.",
      price: 36.90,
      categoryName: "Pratos Executivos",
      isFeatured: true,
    },
    {
      name: "Porção de Mandioca Frita Macia",
      description: "Mandioca cozida até ficar derretendo por dentro e frita em óleo limpo até obter uma casquinha dourada crocante por fora.",
      price: 19.90,
      categoryName: "Porções e Entradas",
    },
    {
      name: "Porção de Torresmo à Pururuca",
      description: "Torresmo de rolo cortado em fatias e frito sob altíssima temperatura até estourar a pururuca perfeita, super crocante.",
      price: 24.90,
      categoryName: "Porções e Entradas",
      isFeatured: true,
    },
    {
      name: "Sobremesa Doce de Leite com Queijo Canastra",
      description: "Fatia generosa do tradicional doce de leite pastoso artesanal mineiro acompanhada de queijo meia cura artesanal da Canastra.",
      price: 12.00,
      categoryName: "Sobremesas Artesanais",
    },
    {
      name: "Pudim Cremoso de Leite Condensado",
      description: "Fatia generosa de pudim de leite condensado tradicional com calda dourada brilhante de caramelo rústico e textura aveludada.",
      price: 8.00,
      categoryName: "Sobremesas Artesanais",
    },
    {
      name: "Suco Natural de Laranja 500ml",
      description: "Suco de laranja espremido na hora da fruta bem doce gelado, sem adição de água ou açúcar.",
      price: 8.50,
      categoryName: "Bebidas",
    },
    {
      name: "Refrigerante Lata 350ml",
      description: "Refrigerante lata bem gelado para acompanhar sua refeição.",
      price: 6.00,
      categoryName: "Bebidas",
    }
  ],
  padaria: [
    {
      name: "Pão de Queijo Mineiro Tradicional (unidade)",
      description: "O legítimo pão de queijo preparado com polvilho azedo artesanal, queijo meia cura ralado e muito amor, assado na hora.",
      price: 1.50,
      categoryName: "Pães e Quitandas",
      isFeatured: true,
    },
    {
      name: "Pão de Queijo Recheado com Pernil",
      description: "Nosso pão de queijo gigante recheado com pernil suíno assado lentamente por 6 horas e desfiado na chapa com cebola roxa.",
      price: 14.95,
      categoryName: "Salgados Assados",
      isFeatured: true,
      extras: [{ name: "Pernil Extra", price: 5.00 }, { name: "Requeijão Extra", price: 3.00 }]
    },
    {
      name: "Pão Francês Crocante Quentinho (unidade)",
      description: "Pão francês de casquinha dourada crocante e miolo super macio, assado em fornadas de hora em hora.",
      price: 0.75,
      categoryName: "Pães e Quitandas",
    },
    {
      name: "Broa de Fubá com Erva-Doce",
      description: "Broa tradicional assada no forno de pedra, com fubá moido d'água e sementes selecionadas de erva-doce.",
      price: 4.50,
      categoryName: "Pães e Quitandas",
    },
    {
      name: "Coxinha Gigante de Frango com Requeijão",
      description: "Coxinha artesanal de massa de batata ultra leve, recheada com peito de frango desfiado temperado e requeijão cremoso.",
      price: 7.50,
      categoryName: "Salgados Assados",
    },
    {
      name: "Empada Caseira de Palmito e Queijo",
      description: "Empada de massa podre que derrete na boca, recheada com creme aveludado de palmito real e queijo derretido.",
      price: 6.50,
      categoryName: "Salgados Assados",
    },
    {
      name: "Bolo Inteiro de Cenoura com Calda de Chocolate",
      description: "Bolo de cenoura fofinho de tamanho médio, coberto com calda rústica brilhante de chocolate belga meio amargo.",
      price: 18.90,
      categoryName: "Bolos e Doces",
      isFeatured: true,
    },
    {
      name: "Fatia de Bolo de Fubá Cremoso",
      description: "Uma fatia generosa de bolo de fubá cremoso bem úmido por dentro, perfeito para acompanhar um café coado quente.",
      price: 5.50,
      categoryName: "Bolos e Doces",
    },
    {
      name: "Café Espresso Coado Quente",
      description: "Xícara do nosso café especial plantado no sul de Minas, coado em filtro de pano individual na hora do seu pedido.",
      price: 3.50,
      categoryName: "Cafeteria Quente",
    },
    {
      name: "Capuccino Italiano com Canela e Cacau",
      description: "Bebida cremosa de café espresso com leite vaporizado, cacau em pó selecionado e canela salpicada por cima.",
      price: 7.50,
      categoryName: "Cafeteria Quente",
    },
    {
      name: "Rosca Rainha de Coco e Leite Condensado",
      description: "Rosca doce trançada super fofinha, coberta com calda generosa de leite condensado e coco ralado úmido.",
      price: 15.00,
      categoryName: "Pães e Quitandas",
    },
    {
      name: "Quiche de Alho Poró Especial",
      description: "Quiche de massa amanteigada recheada com alho poró salteado e creme de queijo canastra suave.",
      price: 9.50,
      categoryName: "Salgados Assados",
    },
    {
      name: "Bolo Inteiro de Fubá Cremoso Caseiro",
      description: "Bolo tradicional de fubá bem cremoso no meio, assado com carinho, tamanho médio para compartilhar.",
      price: 16.90,
      categoryName: "Bolos e Doces",
    },
    {
      name: "Suco de Laranja Natural Garrafa 300ml",
      description: "Suco de laranja 100% natural espremido na hora, gelado e sem adição de açúcares.",
      price: 6.50,
      categoryName: "Bebidas",
    }
  ],
  mercado: [
    {
      name: "Arroz Tipo 1 - Pacote de 5kg",
      description: "Arroz branco agulhinha tipo 1, grãos selecionados e soltinho. Marca tradicional nacional de alta qualidade.",
      price: 28.90,
      categoryName: "Mercearia e Grãos",
    },
    {
      name: "Feijão Carioca Tipo 1 - Pacote de 1kg",
      description: "Feijão carioca selecionado novo de cozimento rápido, produz caldo grosso e saboroso.",
      price: 8.90,
      categoryName: "Mercearia e Grãos",
    },
    {
      name: "Café Torrado e Moído Tradicional 500g",
      description: "Café moído de torra média escura, aroma intenso e sabor marcante da nossa região.",
      price: 16.90,
      categoryName: "Mercearia e Grãos",
      isFeatured: true,
    },
    {
      name: "Açúcar Refinado Especial 1kg",
      description: "Açúcar refinado extra fino, ideal para adoçar suas bebidas diárias e receitas culinárias.",
      price: 4.80,
      categoryName: "Mercearia e Grãos",
    },
    {
      name: "Leite Integral UHT Caixinha 1L",
      description: "Leite integral homogeneizado enriquecido de cálcio de fazendas produtoras parceiras do município.",
      price: 5.49,
      categoryName: "Frios e Laticínios",
      isFeatured: true,
    },
    {
      name: "Manteiga de Primeira com Sal 200g",
      description: "Manteiga de creme de leite com sal, de textura macia e sabor natural marcante de fazenda.",
      price: 9.90,
      categoryName: "Frios e Laticínios",
    },
    {
      name: "Banana Prata Clássica (Kg)",
      description: "Bananas prata selecionadas e colhidas no ponto certo, perfeitas para o consumo diário da família.",
      price: 5.99,
      categoryName: "Hortifruti Fresco",
    },
    {
      name: "Tomate Italiano maduro (Kg)",
      description: "Tomates italianos alongados vermelhos e firmes, excelentes para saladas frescas e molhos encorpados.",
      price: 8.90,
      categoryName: "Hortifruti Fresco",
    },
    {
      name: "Refrigerante Coca-Cola Garrafa 2 Litros",
      description: "Garrafa pet de Coca-Cola bem gelada de tamanho grande para dividir com todos.",
      price: 9.90,
      categoryName: "Bebidas",
      isFeatured: true,
    },
    {
      name: "Cerveja Pilsen Lata 350ml",
      description: "Lata bem gelada de cerveja pilsen nacional, ideal para descontrair.",
      price: 3.89,
      categoryName: "Bebidas",
    }
  ],
  farmacia: [
    {
      name: "Dipirona Monoidratada 500mg - 10 Comprimidos",
      description: "Medicamento genérico analgésico e antipirético indicado para dores de cabeça, febres e mal estar geral.",
      price: 4.90,
      categoryName: "Medicamentos Isentos",
    },
    {
      name: "Paracetamol 750mg - 20 Comprimidos",
      description: "Analgésico potente indicado para o alívio rápido de dores de cabeça, dores musculares e redução da febre.",
      price: 8.90,
      categoryName: "Medicamentos Isentos",
      isFeatured: true,
    },
    {
      name: "Creme Dental Tripla Ação Menta Gel 90g",
      description: "Oferece proteção anticárie com flúor ativo, dentes visivelmente mais brancos e hálito refrescante de menta.",
      price: 5.50,
      categoryName: "Higiene Pessoal",
    },
    {
      name: "Shampoo Suave de Nutrição Diária 350ml",
      description: "Shampoo neutro para todos os tipos de cabelo, limpa suavemente sem ressecar e deixa fragrância suave.",
      price: 12.90,
      categoryName: "Higiene Pessoal",
    },
    {
      name: "Protetor Solar Toque Seco FPS 50 - 120ml",
      description: "Alta proteção UVA/UVB com fórmula oil-free resistente à água e de rápida absorção ideal para o rosto e corpo.",
      price: 49.90,
      categoryName: "Cuidados com a Pele",
      isFeatured: true,
    },
    {
      name: "Sabonete Líquido Neutro Facial 150ml",
      description: "Sabonete suave com extrato de camomila que higieniza os poros suavemente removendo oleosidades extras.",
      price: 22.90,
      categoryName: "Cuidados com a Pele",
    },
    {
      name: "Curativo Adesivo Flexível Antisséptico - 30 Unidades",
      description: "Tiras adesivas respiráveis com microporos e barreira protetora contra germes e sujidades.",
      price: 7.90,
      categoryName: "Primeiros Socorros",
    },
    {
      name: "Álcool em Gel Antisséptico 70% com Hidratante 500g",
      description: "Higieniza as mãos rapidamente eliminando 99.9% de bactérias sem ressecar a pele devido ao extrato de Aloe Vera.",
      price: 9.50,
      categoryName: "Primeiros Socorros",
      isFeatured: true,
    },
    {
      name: "Algodão Hidrófilo Macio Pacote 50g",
      description: "Fibras de algodão puro macias, absorventes e indicadas para higiene da pele e aplicação de cosméticos.",
      price: 4.50,
      categoryName: "Primeiros Socorros",
    },
    {
      name: "Soro Fisiológico 0,9% Líquido Estéril 500ml",
      description: "Soro fisiológico indicado para limpeza de ferimentos, lavagens de olhos e inalações gerais.",
      price: 6.90,
      categoryName: "Primeiros Socorros",
    }
  ],
  petshop: [
    {
      name: "Ração Premium Cães Adultos Frango 10kg",
      description: "Ração seca premium balanceada, rica em vitaminas, proteínas e fibras que garantem pelos fortes e brilhantes.",
      price: 129.90,
      categoryName: "Rações e Nutrição",
      isFeatured: true,
    },
    {
      name: "Sachê de Ração Úmida Gatos Sabor Carne Gourmet",
      description: "Alimento úmido premium completo em molho delicioso, auxilia no sistema urinário dos felinos e melhora a hidratação.",
      price: 3.20,
      categoryName: "Rações e Nutrição",
    },
    {
      name: "Petisco Bifinho Crocante Sabores Chapa 60g",
      description: "Bifinho de carne semi-úmido com aroma irresistível de churrasco, ideal para adestramento e agrado do seu cão.",
      price: 7.90,
      categoryName: "Petiscos e Recompensas",
    },
    {
      name: "Osso de Nó Mastigável Saudável Médio",
      description: "Brinquedo mastigável de raspa de couro natural que auxilia na limpeza do tártaro e massageia as gengivas dos cães.",
      price: 9.50,
      categoryName: "Petiscos e Recompensas",
    },
    {
      name: "Shampoo Neutro Hipoalergênico Pet 500ml",
      description: "Shampoo formulado com extrato de aveia para evitar alergias e coceiras em peles sensíveis de cães e gatos.",
      price: 22.90,
      categoryName: "Higiene e Banho",
      isFeatured: true,
    },
    {
      name: "Educador Sanitário Pipi Pode Spray 30ml",
      description: "Spray cientificamente formulado para atrair e condicionar filhotes e cães adultos a realizarem as necessidades no tapete.",
      price: 18.90,
      categoryName: "Higiene e Banho",
    },
    {
      name: "Bolinha de Borracha Resistente com Som",
      description: "Bolinha maciça de borracha atóxica que emite som ao ser pressionada, estimulando as brincadeiras ativas e exercícios.",
      price: 12.50,
      categoryName: "Brinquedos Pet",
    },
    {
      name: "Arranhador de Rampa em Papelão para Gatos",
      description: "Rampa com papelão ondulado rústico e sachê de catnip para satisfazer o instinto natural dos gatos de arranhar móveis.",
      price: 34.90,
      categoryName: "Brinquedos Pet",
      isFeatured: true,
    },
    {
      name: "Coleira Antipulgas e Carrapatos Eficaz",
      description: "Proteção de até 4 meses contra infestações de pulgas e carrapatos para cães de médio e pequeno porte.",
      price: 69.90,
      categoryName: "Higiene e Banho",
    },
    {
      name: "Brinquedo Mordedor Osso de Nylon Durável",
      description: "Brinquedo de roer feito em nylon resistente que não solta lascas, ideal para cães de mordida forte e destruidores.",
      price: 16.90,
      categoryName: "Brinquedos Pet",
    }
  ],
  agropecuaria: [
    {
      name: "Ração Farelada Cavalos Atletas 20kg",
      description: "Ração farelada concentrada de alta digestibilidade enriquecida de melaço para dar energia aos animais de trabalho.",
      price: 78.90,
      categoryName: "Nutrição Animal e Pasto",
      isFeatured: true,
    },
    {
      name: "Sal Mineral Bovinos Suplemento Seco 25kg",
      description: "Fórmula de macro e micro minerais de alta qualidade indicada para pastagens normais, auxiliando na engorda bovina.",
      price: 64.90,
      categoryName: "Nutrição Animal e Pasto",
    },
    {
      name: "Vermífugo Oral Líquido de Amplo Espectro Bovinos 100ml",
      description: "Vermífugo concentrado altamente eficaz contra parasitas gastrointestinais e pulmonares em rebanhos bovinos.",
      price: 24.50,
      categoryName: "Medicamentos e Saúde",
    },
    {
      name: "Antiparasitário Líquido Spray Forte 500ml",
      description: "Spray indicado para prevenção e tratamento de bicheiras e feridas de pele em animais de fazenda de grande porte.",
      price: 38.90,
      categoryName: "Medicamentos e Saúde",
      isFeatured: true,
    },
    {
      name: "Enxada de Aço Forjado Sem Cabo Tramontina",
      description: "Enxada de aço carbono forjado altamente resistente com lâmina afiada para capinas em hortas e lavouras rurais.",
      price: 29.90,
      categoryName: "Ferramentas Agro",
    },
    {
      name: "Pulverizador de Compressão Manual de 1.5L",
      description: "Pulverizador manual prático com bico regulador de bronze para aplicação de defensivos e regas delicadas.",
      price: 39.90,
      categoryName: "Ferramentas Agro",
    },
    {
      name: "Terra Vegetal Orgânica Adubada Saco 10kg",
      description: "Substrato orgânico adubado com esterco bovino e humus de minhoca, pronto para hortas e jardins floridos.",
      price: 12.50,
      categoryName: "Jardim e Plantio",
    },
    {
      name: "Sementes de Capim Mombaça Alta Pureza 5kg",
      description: "Sementes selecionadas de capim Mombaça indicadas para criação de pastagens de engorda bovina intensiva.",
      price: 110.00,
      categoryName: "Jardim e Plantio",
      isFeatured: true,
    },
    {
      name: "Fertilizante NPK 10-10-10 Saco Rápido 1kg",
      description: "Nutrição balanceada completa para folhagens, árvores frutíferas e jardins domésticos com absorção rápida.",
      price: 16.90,
      categoryName: "Jardim e Plantio",
    },
    {
      name: "Rastelo Plástico Reforçado com Cabo de Madeira",
      description: "Rastelo de plástico ultra resistente indicado para recolher gramas cortadas e folhas caídas no pátio e jardim.",
      price: 22.90,
      categoryName: "Ferramentas Agro",
    }
  ],
  acai: [
    {
      name: "Copo de Açaí 300ml Tradicional",
      description: "Açaí cremoso batido na hora, acompanha leite condensado e granola crocante já inclusos no copo.",
      price: 14.00,
      categoryName: "Copos de Açaí",
      sizes: ["300ml", "500ml", "700ml"],
    },
    {
      name: "Copo de Açaí 500ml Super Completo",
      description: "Copo grande com camadas de açaí cremoso premium, fatias de banana fresca, leite em pó Ninho e calda por cima.",
      price: 19.00,
      categoryName: "Copos de Açaí",
      isFeatured: true,
      sizes: ["300ml", "500ml", "700ml"],
    },
    {
      name: "Copo de Açaí Gigante 700ml",
      description: "Copo super gigante de açaí artesanal para os verdadeiros amantes de açaí, com morango picado e leite condensado.",
      price: 24.00,
      categoryName: "Copos de Açaí",
      sizes: ["300ml", "500ml", "700ml"],
    },
    {
      name: "Barca de Açaí Especial Casal",
      description: "Uma barca decorada repleta de açaí cremoso, bananas, morangos frescos picados, leite condensado, leite Ninho e Ovomaltine.",
      price: 38.00,
      categoryName: "Barcas de Açaí",
      isFeatured: true,
    },
    {
      name: "Barca de Açaí Família Super",
      description: "Nossa maior barca de açaí, serve até 4 pessoas. Acompanha morangos, bananas, Nutella, doce de leite e granola.",
      price: 55.00,
      categoryName: "Barcas de Açaí",
    },
    {
      name: "Suco de Açaí Energético Gelado 500ml",
      description: "Suco natural de açaí batido com xarope de guaraná natural e água bem gelada, ideal para renovar as energias.",
      price: 11.00,
      categoryName: "Bebidas Geladas",
    },
    {
      name: "Água de Coco Integral de Copo 500ml",
      description: "Água de coco integral super doce e gelada colhida no dia das melhores fazendas de coco.",
      price: 8.00,
      categoryName: "Bebidas Geladas",
    },
    {
      name: "Adicional de Nutella Legítima Extra",
      description: "Adicione uma camada extra do legítimo creme de avelã Nutella ao seu copo ou barca de açaí.",
      price: 5.00,
      categoryName: "Adicionais e Toppings",
    },
    {
      name: "Adicional de Leite Ninho Pó Extra",
      description: "Adicione duas colheres extras de leite em pó integral Ninho.",
      price: 3.00,
      categoryName: "Adicionais e Toppings",
    },
    {
      name: "Adicional de Morangos Picados Frescos",
      description: "Porção de morangos picados frescos colhidos no mesmo dia para refrescar seu açaí.",
      price: 4.00,
      categoryName: "Adicionais e Toppings",
      isFeatured: true,
    }
  ],
  floricultura: [
    {
      name: "Buquê de Rosas Vermelhas Clássico",
      description: "Elegante arranjo de 12 rosas vermelhas importadas selecionadas de botões firmes, envolto em papel kraft rústico chic.",
      price: 89.90,
      categoryName: "Buquês de Flores",
      isFeatured: true,
    },
    {
      name: "Buquê Mix Flores do Campo Coloridas",
      description: "Buquê alegre e vibrante composto por margaridas, gérberas, alstromérias e folhagens tropicais perfumadas.",
      price: 75.00,
      categoryName: "Buquês de Flores",
    },
    {
      name: "Arranjo de Orquídea Phalaenopsis Vaso",
      description: "Bela orquídea Phalaenopsis lilás de duas hastes floridas plantada em vaso de cerâmica branca decorado rústico.",
      price: 110.00,
      categoryName: "Arranjos de Mesa",
      isFeatured: true,
    },
    {
      name: "Arranjo de Lírios Brancos Especiais",
      description: "Vaso de vidro com lírios brancos perfumados abertos e botões por abrir, decorado com fita de cetim elegante.",
      price: 85.00,
      categoryName: "Arranjos de Mesa",
    },
    {
      name: "Cesta de Café da Manhã Completa",
      description: "Cesta de vime artesanal contendo pães de queijo, bolo de pote, geleia, torrada, frutas da estação, café e caneca decorativa.",
      price: 150.00,
      categoryName: "Cestas Especiais",
      isFeatured: true,
    },
    {
      name: "Cesta de Chocolates Finos com Pelúcia",
      description: "Cesta romântica decorada com caixa de bombons finos artesanais, trufas variadas e um urso de pelúcia médio macio.",
      price: 120.00,
      categoryName: "Cestas Especiais",
    },
    {
      name: "Cartão de Mensagem Personalizado",
      description: "Cartão de papel off-white texturizado impresso em envelope selado para enviar seus sentimentos sinceros.",
      price: 5.00,
      categoryName: "Acessórios e Mimos",
    },
    {
      name: "Vaso de Vidro Transparente Luxo",
      description: "Vaso de vidro grosso cilíndrico transparente, ideal para acomodar buquês de médio e grande porte em mesas.",
      price: 35.00,
      categoryName: "Acessórios e Mimos",
    },
    {
      name: "Caixa de Bombons Finos Sortidos",
      description: "Caixa de presente com 12 bombons de chocolate ao leite e meio amargo recheados de licores e trufas artesanais.",
      price: 45.00,
      categoryName: "Acessórios e Mimos",
    },
    {
      name: "Urso de Pelúcia Médio Super Macio",
      description: "Urso de pelúcia marrom claro antialérgico segurando um pequeno coração vermelho bordado 'Com Amor'.",
      price: 59.90,
      categoryName: "Acessórios e Mimos",
    }
  ],
  papelaria: [
    {
      name: "Caneta Esferográfica Bic Azul (Unidade)",
      description: "A clássica caneta esferográfica de escrita macia ponta média 1.0mm. Escrita contínua sem falhas.",
      price: 1.50,
      categoryName: "Escrita e Desenho",
    },
    {
      name: "Estojo de Canetas Stabilo Point - 10 Cores",
      description: "Canetas de ponta extra fina de metal 0.4mm, ideais para desenhos técnicos, caligrafias artísticas e resumos coloridos.",
      price: 79.90,
      categoryName: "Escrita e Desenho",
      isFeatured: true,
    },
    {
      name: "Caderno Universitário Espiral 10 Matérias",
      description: "Caderno de capa dura decorada rústica com 160 folhas pautadas brancas de alta gramatura e bolsa interna de papel.",
      price: 24.90,
      categoryName: "Cadernos e Papéis",
      isFeatured: true,
    },
    {
      name: "Bloco de Notas Adesivas Amarelo Post-it",
      description: "Bloco de notas autoadesivas amarelas de tamanho padrão, excelente para lembretes rápidos em monitores e cadernos.",
      price: 8.90,
      categoryName: "Cadernos e Papéis",
    },
    {
      name: "Grampeador de Mesa Compacto Metal",
      description: "Grampeador de mesa durável feito inteiramente de aço, capacidade para grampear até 20 folhas de papel de uma vez.",
      price: 18.90,
      categoryName: "Organização e Escritório",
    },
    {
      name: "Organizador de Documentos Triplo Metal",
      description: "Organizador organizador triplo vertical feito de metal preto aramado, ideal para separar papéis, pastas e correspondências.",
      price: 32.90,
      categoryName: "Organização e Escritório",
    },
    {
      name: "Pendrive Ultra Fast USB 32GB Sandisk",
      description: "Dispositivo de memória flash portátil com porta USB 3.0 super veloz para armazenamento seguro de arquivos e fotos.",
      price: 34.90,
      categoryName: "Acessórios de Informática",
      isFeatured: true,
    },
    {
      name: "Mouse Óptico Sem Fio Ergonômico Preto",
      description: "Mouse sem fio confortável de conexão rápida via receptor USB Nano, com ajuste inteligente de DPI e bateria de longa duração.",
      price: 49.90,
      categoryName: "Acessórios de Informática",
    },
    {
      name: "Lápis de Cor Premium Faber Castell 24 Cores",
      description: "EcoLápis de madeira reflorestada de mina macia super resistente, cores ultra intensas e fácil de apontar.",
      price: 29.90,
      categoryName: "Escrita e Desenho",
    },
    {
      name: "Resma de Papel Chamex A4 500 Folhas",
      description: "Papel sulfite branco de tamanho A4 e gramatura 75g/m² de excelente opacidade ideal para impressões e fotocópias.",
      price: 28.50,
      categoryName: "Cadernos e Papéis",
    }
  ],
  construcao: [
    {
      name: "Martelo de Unha 29mm Cabo de Madeira",
      description: "Martelo de aço carbono forjado polido de altíssima resistência com cabo anatômico de madeira tratada seca.",
      price: 24.90,
      categoryName: "Ferramentas Manuais",
    },
    {
      name: "Jogo de Chaves de Fenda e Phillips - 6 peças",
      description: "Conjunto profissional de chaves com hastes em cromo vanádio imantadas e cabos de borracha ergonômicos antiaderentes.",
      price: 45.00,
      categoryName: "Ferramentas Manuais",
      isFeatured: true,
    },
    {
      name: "Lâmpada LED 9W Branca Bivolt Econômica",
      description: "Lâmpada LED de luz branca fria, substitui lâmpadas incandescentes de 60W economizando até 85% de energia elétrica.",
      price: 6.50,
      categoryName: "Iluminação e Elétrica",
    },
    {
      name: "Fita Isolante Profissional PVC Premium 20m",
      description: "Fita isolante preta com alta flexibilidade e excelente isolamento elétrico sob alta voltagem em fios encapados.",
      price: 7.90,
      categoryName: "Iluminação e Elétrica",
    },
    {
      name: "Trincha Plana Cerdas Escuras 2 Polegadas",
      description: "Pincel de pintura largo indicado para aplicação de vernizes, tintas a óleo e esmaltes em madeiras e portões.",
      price: 8.50,
      categoryName: "Tintas e Pintura",
    },
    {
      name: "Rolo de Lã para Pintura Antigota Profissional",
      description: "Rolo de lã de carneiro sintética tecida especial para reter tinta sem respingar, cobrindo superfícies com acabamento liso.",
      price: 18.90,
      categoryName: "Tintas e Pintura",
    },
    {
      name: "Tinta Acrílica Fosca Branca Lata 3.6 Litros",
      description: "Tinta látex acrílica de excelente cobertura de paredes internas, de acabamento fosco aveludado e baixo odor.",
      price: 89.90,
      categoryName: "Tintas e Pintura",
      isFeatured: true,
    },
    {
      name: "Fita Veda Rosca Prática PTFE 10 metros",
      description: "Fita de teflon veda rosca de fácil aplicação, ideal para conexões de PVC ou metal de torneiras e canos de água fria.",
      price: 3.50,
      categoryName: "Ferragens e Conexões",
    },
    {
      name: "Caixa de Parafusos com Buchas Plásticas 8mm",
      description: "Kit contendo 50 parafusos philips de aço zincado e 50 buchas plásticas de nylon com asas expansivas anti-giro.",
      price: 14.90,
      categoryName: "Ferragens e Conexões",
    },
    {
      name: "Trena de Aço Métrica Antimpacto com Trava 5m",
      description: "Trena com estojo de borracha resistente a quedas, fita metálica de numeração nítida com trava e presilha metálica.",
      price: 15.90,
      categoryName: "Ferramentas Manuais",
      isFeatured: true,
    }
  ],
  utilidades: [
    {
      name: "Jogo de Pratos Rasos de Vidro - 6 Peças",
      description: "Conjunto de pratos de vidro temperado translúcido rústico de alta resistência térmica e mecânica, fáceis de higienizar.",
      price: 48.90,
      categoryName: "Cozinha e Copa",
      isFeatured: true,
    },
    {
      name: "Conjunto de Talheres em Inox - 24 Peças",
      description: "Talheres de mesa completos feitos de aço inox durável que não oxidam na lava louças, com facas de fio afiado.",
      price: 59.90,
      categoryName: "Cozinha e Copa",
    },
    {
      name: "Pote Hermético Quadrado Vidro Borossilicato",
      description: "Pote de vidro ultra resistente com tampa plástica hermética dotada de borracha de silicone que estanca totalmente líquidos.",
      price: 18.50,
      categoryName: "Cozinha e Copa",
    },
    {
      name: "Caixa Organizadora Plástica Grande 20L",
      description: "Caixa organizadora de plástico transparente rígido com travas laterais nas alças e tampa protetora empilhável.",
      price: 24.90,
      categoryName: "Organização Doméstica",
      isFeatured: true,
    },
    {
      name: "Cesto de Roupa Suja Retangular Telado",
      description: "Cesto plástico retangular de tamanho médio com furos de ventilação para impedir umidades e odores em roupas usadas.",
      price: 29.90,
      categoryName: "Organização Doméstica",
    },
    {
      name: "Mop Giratório Balde Espremedor Centrífugo",
      description: "Balde plástico resistente com espremedor centrífugo giratório de aço inox e esfregão de microfibra de cabo regulável.",
      price: 79.90,
      categoryName: "Limpeza e Praticidade",
      isFeatured: true,
    },
    {
      name: "Varal de Chão Dobrável Aço Reforçado",
      description: "Varal compacto de metal esmaltado dobrável de fácil armazenamento, suporta até 12kg de roupas úmidas penduradas.",
      price: 45.00,
      categoryName: "Limpeza e Praticidade",
    },
    {
      name: "Porta Escova de Dentes e Creme sobre Pia",
      description: "Suporte organizador de cerâmica com divisórias internas para organizar escovas e tubo de creme dental.",
      price: 12.90,
      categoryName: "Utilidades de Banheiro",
    },
    {
      name: "Tapete Antiderrapante Macio Banheiro",
      description: "Tapete de algodão felpudo ultra absorvente com revestimento traseiro de silicone aderente de segurança pós banho.",
      price: 16.90,
      categoryName: "Utilidades de Banheiro",
    },
    {
      name: "Cabides de Plástico Reforçados - 10 Unidades",
      description: "Conjunto de cabides pretos de alta espessura com cavas nos ombros para segurar alças delicadas sem escorregar.",
      price: 14.50,
      categoryName: "Organização Doméstica",
    }
  ],
  japonesa: [
    {
      name: "Combinado Tradicional (16 peças)",
      description: "Seleção clássica do sushiman: 4 sashimis de salmão, 4 niguiris de salmão, 4 uramakis filadélfia e 4 hossomakis de salmão.",
      price: 59.90,
      categoryName: "Combinados",
      isFeatured: true,
      preparedToOrder: true,
      freshIngredients: true,
    },
    {
      name: "Combinado Especial (32 peças)",
      description: "Uma experiência completa: 8 sashimis variados, 8 niguiris, 8 uramakis especiais com geleia de pimenta e 8 hot rolls crocantes.",
      price: 110.00,
      categoryName: "Combinados",
      isFeatured: true,
      preparedToOrder: true,
      freshIngredients: true,
    },
    {
      name: "Combinado Salmão (20 peças)",
      description: "Exclusivo para amantes de salmão: 6 sashimis de salmão, 4 niguiris, 4 uramakis filadélfia, 4 hossomakis e 2 dyo de salmão.",
      price: 75.00,
      categoryName: "Combinados",
      preparedToOrder: true,
      freshIngredients: true,
    },
    {
      name: "Sashimi de Salmão (10 fatias)",
      description: "Fatias frescas de salmão premium selecionado pelo sushiman, corte preciso acompanhado de nabo ralado e wasabi.",
      price: 38.00,
      categoryName: "Sushis e Sashimis",
      isFeatured: true,
      preparedToOrder: true,
      freshIngredients: true,
    },
    {
      name: "Nigiri de Salmão (6 unidades)",
      description: "Bolinhos de arroz temperado cobertos com fatias finas e frescas de salmão selecionado.",
      price: 24.00,
      categoryName: "Sushis e Sashimis",
    },
    {
      name: "Uramaki Filadélfia (8 unidades)",
      description: "Arroz por fora salpicado com gergelim, recheado com salmão fresco de alta qualidade e cream cheese importado.",
      price: 26.00,
      categoryName: "Sushis e Sashimis",
    },
    {
      name: "Temaki de Salmão",
      description: "Cone de alga crocante nori recheado com salmão fresco picado e cebolinha fresca.",
      price: 28.00,
      categoryName: "Temakis",
    },
    {
      name: "Temaki Filadélfia",
      description: "Cone de alga crocante nori generosamente recheado com salmão fresco picado, cream cheese cremoso e cebolinha.",
      price: 32.00,
      categoryName: "Temakis",
      isFeatured: true,
    },
    {
      name: "Temaki Hot",
      description: "Temaki empanado em farinha panko ultra crocante, recheado com salmão cozido e cream cheese, finalizado com molho tarê caseiro.",
      price: 34.00,
      categoryName: "Temakis",
    },
    {
      name: "Hot Filadélfia (8 unidades)",
      description: "Roll de salmão com cream cheese empanado em farinha panko e frito até dourar, finalizado com molho tarê e cebolinha.",
      price: 28.00,
      categoryName: "Hot Rolls",
      isFeatured: true,
    },
    {
      name: "Hot Salmão e Grelhado",
      description: "Roll de salmão grelhado temperado, cream cheese, empanado na farinha panko, coberto com couve crispy e tarê artesanal.",
      price: 29.90,
      categoryName: "Hot Rolls",
    },
    {
      name: "Hot Especial Shimeji",
      description: "Roll especial recheado com cogumelos shimeji salteados na manteiga e cream cheese, empanado em panko crocante.",
      price: 32.00,
      categoryName: "Hot Rolls",
    },
    {
      name: "Sunomono Tradicional",
      description: "Salada refrescante de pepino japonês finamente fatiado, conservado em molho agridoce de vinagre de arroz com sementes de gergelim.",
      price: 15.00,
      categoryName: "Entradas",
    },
    {
      name: "Guioza de Carne Suína (5 unidades)",
      description: "Pastéis típicos japoneses recheados com lombo suíno temperado e legumes, grelhados no vapor e acompanhados de molho ponzu.",
      price: 22.00,
      categoryName: "Entradas",
      isFeatured: true,
    },
    {
      name: "Harumaki de Queijo (4 unidades)",
      description: "Rolinhos primavera super crocantes recheados com muçarela derretida, servidos bem quentes.",
      price: 18.00,
      categoryName: "Entradas",
    },
    {
      name: "Refrigerante Coca-Cola Lata 350ml",
      description: "Lata de refrigerante Coca-Cola bem gelada.",
      price: 6.00,
      categoryName: "Bebidas",
    },
    {
      name: "Água Mineral Sem Gás 500ml",
      description: "Garrafa de água mineral natural gelada.",
      price: 4.00,
      categoryName: "Bebidas",
    }
  ]
};

// Map primary categories to internal template segment names using priorities and commercial fallback
export function mapEstablishmentCategoryToSegment(input: string | any): string {
  if (!input) return "revisao_necessaria";

  let est: any;
  if (typeof input === "string") {
    est = {
      category: input,
      categoryName: input,
    };
  } else {
    est = input;
  }

  const normalizeCategory = (value: unknown): string => {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  };

  // Build the list of official category candidates in order of priority:
  // 1. primaryCategory válida;
  // 2. categoryIds válidos;
  // 3. categoryId válida;
  // 4. category válida;
  // 5. subcategory válida;
  // 6. businessType ou segment explicitamente cadastrado;
  const officialCategoryCandidates = [
    est.primaryCategory,
    ...(Array.isArray(est.categoryIds) ? est.categoryIds : []),
    est.categoryId,
    est.category,
    est.subcategory,
    est.businessType,
    est.segment,
  ];

  const officialText = officialCategoryCandidates
    .map(normalizeCategory)
    .filter(Boolean)
    .join(" ");

  // Normalization checks on official categories first
  if (
    officialText.includes("padar") ||
    officialText.includes("panific") ||
    officialText.includes("pao de queijo") ||
    officialText.includes("confeit") ||
    officialText.includes("quitanda") ||
    officialText.includes("pao") ||
    officialText.includes("bakery") ||
    officialText.includes("bakeries")
  ) {
    return "padaria";
  }

  if (officialText.includes("pizza")) {
    return "pizzaria";
  }

  if (
    officialText.includes("lanche") ||
    officialText.includes("hamburguer") ||
    officialText.includes("burguer")
  ) {
    return "hamburgueria";
  }

  if (officialText.includes("japon")) {
    return "japonesa";
  }

  if (
    officialText.includes("mercado") ||
    officialText.includes("mercearia") ||
    officialText.includes("conveni") ||
    officialText.includes("supermercado") ||
    officialText.includes("horti") ||
    officialText.includes("grocery") ||
    officialText.includes("produce") ||
    officialText.includes("market")
  ) {
    return "mercado";
  }

  if (officialText.includes("farmac") || officialText.includes("drog")) {
    return "farmacia";
  }

  if (officialText.includes("pet") || officialText.includes("veterin")) {
    return "petshop";
  }

  if (
    officialText.includes("agro") ||
    officialText.includes("rural") ||
    officialText.includes("pecu") ||
    officialText.includes("agricult")
  ) {
    return "agropecuaria";
  }

  if (
    officialText.includes("aca") ||
    officialText.includes("doce") ||
    officialText.includes("sorv")
  ) {
    return "acai";
  }

  if (officialText.includes("bebid") || officialText.includes("beverag")) {
    return "bebidas";
  }

  if (officialText.includes("papel") || officialText.includes("statione")) {
    return "papelaria";
  }

  if (officialText.includes("flor") || officialText.includes("orquid")) {
    return "floricultura";
  }

  if (
    officialText.includes("constru") ||
    officialText.includes("ferramen") ||
    officialText.includes("martelo")
  ) {
    return "construcao";
  }

  if (
    officialText.includes("utilidad") ||
    officialText.includes("domes") ||
    officialText.includes("casa")
  ) {
    return "utilidades";
  }

  if (
    officialText.includes("comida mineira") ||
    officialText.includes("culinaria mineira") ||
    officialText.includes("restaurante mineiro") ||
    officialText.includes("mineira") ||
    officialText.includes("refei") ||
    officialText.includes("restaurante") ||
    officialText.includes("churrasco") ||
    officialText.includes("brasileira")
  ) {
    return "restaurante";
  }

  // 7. Nome comercial somente como último recurso.
  if (est.name) {
    const normalizedName = normalizeCategory(est.name);
    const commercialSegment = mapByCommercialNameFallback(normalizedName);
    if (commercialSegment) {
      return commercialSegment;
    }
  }

  // Fallback: revisão manual necessária
  return "revisao_necessaria";
}

function mapByCommercialNameFallback(normalizedName: string): string | null {
  if (normalizedName.includes("pizza")) return "pizzaria";
  if (
    normalizedName.includes("lanche") ||
    normalizedName.includes("hamburguer") ||
    normalizedName.includes("burguer")
  ) {
    return "hamburgueria";
  }
  if (normalizedName.includes("japon")) return "japonesa";
  if (
    normalizedName.includes("padar") ||
    normalizedName.includes("pao de queijo") ||
    normalizedName.includes("panific")
  ) {
    return "padaria";
  }
  if (
    normalizedName.includes("mercado") ||
    normalizedName.includes("mercearia") ||
    normalizedName.includes("conveni") ||
    normalizedName.includes("supermercado")
  ) {
    return "mercado";
  }
  if (normalizedName.includes("farmac") || normalizedName.includes("drog")) {
    return "farmacia";
  }
  if (normalizedName.includes("pet") || normalizedName.includes("veterin")) {
    return "petshop";
  }
  if (
    normalizedName.includes("agro") ||
    normalizedName.includes("rural") ||
    normalizedName.includes("pecu")
  ) {
    return "agropecuaria";
  }
  if (
    normalizedName.includes("aca") ||
    normalizedName.includes("doce") ||
    normalizedName.includes("sorv")
  ) {
    return "acai";
  }
  if (normalizedName.includes("bebid")) return "bebidas";
  if (normalizedName.includes("papel")) return "papelaria";
  if (normalizedName.includes("flor") || normalizedName.includes("orquid")) {
    return "floricultura";
  }
  if (normalizedName.includes("constru") || normalizedName.includes("ferramen")) {
    return "construcao";
  }
  if (normalizedName.includes("utilidad") || normalizedName.includes("casa")) {
    return "utilidades";
  }

  if (
    normalizedName.includes("restaurante") ||
    normalizedName.includes("churrasco") ||
    normalizedName.includes("grelhad") ||
    normalizedName.includes("refeicao")
  ) {
    return "restaurante";
  }

  return null;
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-"); // Replace multiple - with single -
}

export const catalogGeneratorService = {
  /**
   * Analyze establishments and find out which have 0 products in the selected data source.
   */
  async analyzeEstablishments(
    activeSource: "local" | "firestore",
    establishments: Establishment[],
    products: Record<string, Product[]>
  ): Promise<GeneratorAnalysis> {
    const emptyEstablishments: GeneratorAnalysis["emptyEstablishments"] = [];
    const filledEstablishments: GeneratorAnalysis["filledEstablishments"] = [];

    establishments.forEach((est) => {
      const prodsList = products[est.id] || [];
      const productCount = prodsList.length;

      const info = {
        id: est.id,
        name: est.name,
        category: est.category || "Geral",
      };

      if (productCount === 0) {
        emptyEstablishments.push(info);
      } else {
        filledEstablishments.push({
          ...info,
          productCount,
        });
      }
    });

    return {
      activeSource,
      totalEstablishments: establishments.length,
      emptyEstablishments,
      filledEstablishments,
    };
  },

  /**
   * Generate a dry-run preview of what will be created.
   */
  generatePreview(
    activeSource: "local" | "firestore",
    establishments: Establishment[],
    targetEstIds: string[]
  ): GeneratorPreview {
    const categoriesToCreate: GeneratorPreview["categoriesToCreate"] = [];
    const productsToCreate: GeneratorPreview["productsToCreate"] = [];
    const diagnostics: any[] = [];

    const selectedEsts = establishments.filter((e) => targetEstIds.includes(e.id));

    selectedEsts.forEach((est) => {
      const segment = mapEstablishmentCategoryToSegment(est);
      const isCompatible = segment !== "revisao_necessaria";
      const hasTemplate = isCompatible && !!SEGMENT_TEMPLATES[segment];
      const templates = hasTemplate ? SEGMENT_TEMPLATES[segment] : [];

      const reason = isCompatible 
        ? "Compatível" 
        : "Incompatível — O segmento não pôde ser identificado a partir das categorias oficiais ou do nome.";

      const diagnosticEntry: any = {
        establishmentId: est.id,
        establishmentName: est.name,
        detectedCategory: est.category || "Não definida",
        detectedSegment: segment === "revisao_necessaria" ? "Revisão manual necessária" : segment,
        templateId: segment,
        isCompatible,
        reason,
        // Detailed document fields
        documentId: est.id,
        name: est.name || "",
        primaryCategory: (est as any).primaryCategory || "",
        category: est.category || "",
        categoryId: (est as any).categoryId || "",
        categoryIds: (est as any).categoryIds || [],
        subcategory: (est as any).subcategory || "",
        segment: (est as any).segment || "",
        businessType: (est as any).businessType || "",
        slug: (est as any).slug || est.id || "",
        aboutDescription: (est as any).aboutDescription || "",
      };

      // CATALOG_PREVIEW_TEMPLATE_DIAGNOSTIC
      const uniqueCategoryNamesForDiag = hasTemplate ? Array.from(new Set(templates.map((t) => t.categoryName))) : [];
      const templateCategoriesBeforeValidation = uniqueCategoryNamesForDiag.length;
      const templateProductsBeforeValidation = templates.length;
      const categoriesAfterValidation = hasTemplate ? uniqueCategoryNamesForDiag.length : 0;
      const productsAfterValidation = hasTemplate ? templates.length : 0;
      const removedCategoryReasons = !hasTemplate ? [!isCompatible ? "Segmento incompatível" : `Template ausente para a chave ${segment}`] : [];
      const removedProductReasons = !hasTemplate ? [!isCompatible ? "Segmento incompatível" : `Template ausente para a chave ${segment}`] : [];

      const previewDiagnostic = {
        event: "CATALOG_PREVIEW_TEMPLATE_DIAGNOSTIC",
        establishmentId: est.id,
        detectedCategory: est.category || "restaurants",
        detectedSegment: segment,
        resolvedTemplateKey: segment,
        templateFound: hasTemplate,
        templateCategoriesBeforeValidation,
        templateProductsBeforeValidation,
        categoriesAfterValidation,
        productsAfterValidation,
        removedCategoryReasons,
        removedProductReasons
      };

      console.log("CATALOG_PREVIEW_TEMPLATE_DIAGNOSTIC:", JSON.stringify(previewDiagnostic, null, 2));
      diagnosticEntry.previewTemplateDiagnostic = previewDiagnostic;

      diagnostics.push(diagnosticEntry);

      if (hasTemplate) {
        // Extract unique categories in order of appearance
        const uniqueCategoryNames = Array.from(new Set(templates.map((t) => t.categoryName)));

        uniqueCategoryNames.forEach((catName, idx) => {
          categoriesToCreate.push({
            establishmentId: est.id,
            name: catName,
            sortOrder: idx + 1,
          });
        });

        templates.forEach((temp) => {
          productsToCreate.push({
            establishmentId: est.id,
            name: temp.name,
            categoryName: temp.categoryName,
            price: temp.price,
            isFeatured: !!temp.isFeatured,
          });
        });
      }
    });

    return {
      activeSource,
      establishmentsCount: selectedEsts.length,
      categoriesToCreate,
      productsToCreate,
      diagnostics,
    } as any;
  },

  /**
   * Run the actual creation. Supports Firestore (with batches) and Local (via returned states).
   */
  async executeGeneration(
    activeSource: "local" | "firestore",
    establishments: Establishment[],
    targetEstIds: string[],
    currentProductsState: Record<string, Product[]>,
    currentCategoriesState: Record<string, MenuCategory[]>,
    onProgress: (msg: string) => void
  ): Promise<GenerationResult> {
    const selectedEsts = establishments.filter((e) => targetEstIds.includes(e.id));
    if (selectedEsts.length === 0) {
      return { success: false, message: "Nenhum estabelecimento selecionado.", createdCategoriesCount: 0, createdProductsCount: 0 };
    }

    // Validate segments first - block if any require manual review
    for (const est of selectedEsts) {
      const segment = mapEstablishmentCategoryToSegment(est);
      if (segment === "revisao_necessaria") {
        return {
          success: false,
          message: `Geração suspensa: O estabelecimento "${est.name}" requer revisão manual (segmento não identificado).`,
          createdCategoriesCount: 0,
          createdProductsCount: 0
        };
      }
    }

    onProgress(`Iniciando geração de catálogo para ${selectedEsts.length} estabelecimento(s) no modo ${activeSource === "firestore" ? "Cloud Firestore" : "Demo local"}.`);

    let totalCats = 0;
    let totalProds = 0;

    if (activeSource === "firestore") {
      if (!db) {
        throw new Error("Conexão com Firestore indisponível para gravação.");
      }

      onProgress("Conectado com sucesso ao Firestore. Preparando lotes...");

      // We will perform writes in logical batches of 50 operations to respect firestore limits
      let batch = writeBatch(db);
      let opCount = 0;

      for (let i = 0; i < selectedEsts.length; i++) {
        const est = selectedEsts[i];
        const segment = mapEstablishmentCategoryToSegment(est);
        const templates = SEGMENT_TEMPLATES[segment] || SEGMENT_TEMPLATES.restaurante;

        onProgress(`Processando [${i + 1}/${selectedEsts.length}] ${est.name} (Segmento: ${segment})...`);

        // Create categories
        const uniqueCategoryNames = Array.from(new Set(templates.map((t) => t.categoryName)));
        const catMap: Record<string, MenuCategory> = {};

        for (let idx = 0; idx < uniqueCategoryNames.length; idx++) {
          const catName = uniqueCategoryNames[idx];
          const catSlug = slugify(catName);
          const catId = `demo_${est.id}_${catSlug}`;

          const menuCat: MenuCategory = {
            id: catId,
            establishmentId: est.id,
            name: catName,
            normalizedName: catName.toLowerCase().trim(),
            active: true,
            sortOrder: idx + 1,
            // Custom identifiers as requested
            ...({
              isDemo: true,
              demoSource: "automatic-catalog-generator",
              demoVersion: 1,
              createdForPresentation: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            } as any)
          };

          catMap[catName] = menuCat;

          // Add to firestore batch under subcollection establishments/{estId}/menuCategories
          const catRef = doc(db, "establishments", est.id, "menuCategories", catId);
          batch.set(catRef, menuCat);
          opCount++;
          totalCats++;

          if (opCount >= 45) {
            onProgress(`Gravando lote de categorias no Firestore (Total gravado até agora: ${totalCats} categorias)...`);
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }

        // Create products
        for (let pIdx = 0; pIdx < templates.length; pIdx++) {
          const temp = templates[pIdx];
          const prodSlug = slugify(temp.name);
          const prodId = `demo_${est.id}_${prodSlug}`;

          const matchedCat = catMap[temp.categoryName];

          const product: Product = {
            id: prodId,
            name: temp.name,
            description: temp.description,
            price: temp.price,
            category: temp.categoryName,
            available: true,
            image: getRandomImage(segment, pIdx),
            establishmentId: est.id,
            menuCategoryId: matchedCat?.id,
            menuCategoryName: matchedCat?.name,
            sizes: temp.sizes || undefined,
            borders: temp.borders || undefined,
            extras: temp.extras || undefined,
            optionGroups: temp.optionGroups || undefined,
            preparedToOrder: temp.preparedToOrder ?? false,
            freshIngredients: temp.freshIngredients ?? false,
            // Custom identifier fields as requested
            ...({
              isDemo: true,
              demoSource: "automatic-catalog-generator",
              demoVersion: 1,
              createdForPresentation: true,
              active: true,
              featured: !!temp.isFeatured,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            } as any)
          };

          const prodRef = doc(db, "products", prodId);
          batch.set(prodRef, product);
          opCount++;
          totalProds++;

          if (opCount >= 45) {
            onProgress(`Gravando lote de produtos no Firestore (Total gravado até agora: ${totalProds} produtos)...`);
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      }

      // Commit remaining items
      if (opCount > 0) {
        onProgress("Gravando lote final no Firestore...");
        await batch.commit();
      }

      onProgress(`Geração concluída com sucesso no Cloud Firestore! Foram geradas ${totalCats} categorias e ${totalProds} produtos.`);

      return {
        success: true,
        message: `Geração finalizada! ${totalCats} categorias e ${totalProds} produtos foram criados com sucesso no Cloud Firestore.`,
        createdCategoriesCount: totalCats,
        createdProductsCount: totalProds,
      };

    } else {
      // Local mode generation
      const nextProducts = { ...currentProductsState };
      const nextCategories = { ...currentCategoriesState };

      for (let i = 0; i < selectedEsts.length; i++) {
        const est = selectedEsts[i];
        const segment = mapEstablishmentCategoryToSegment(est);
        const templates = SEGMENT_TEMPLATES[segment] || SEGMENT_TEMPLATES.restaurante;

        onProgress(`Processando [${i + 1}/${selectedEsts.length}] ${est.name} (Modo Local)...`);

        const uniqueCategoryNames = Array.from(new Set(templates.map((t) => t.categoryName)));
        const catMap: Record<string, MenuCategory> = {};
        const estCatsList: MenuCategory[] = [];

        for (let idx = 0; idx < uniqueCategoryNames.length; idx++) {
          const catName = uniqueCategoryNames[idx];
          const catSlug = slugify(catName);
          const catId = `demo_${est.id}_${catSlug}`;

          const menuCat: MenuCategory = {
            id: catId,
            establishmentId: est.id,
            name: catName,
            normalizedName: catName.toLowerCase().trim(),
            active: true,
            sortOrder: idx + 1,
            ...({
              isDemo: true,
              demoSource: "automatic-catalog-generator",
              demoVersion: 1,
              createdForPresentation: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            } as any)
          };

          catMap[catName] = menuCat;
          estCatsList.push(menuCat);
          totalCats++;
        }

        nextCategories[est.id] = estCatsList;

        const estProdsList: Product[] = [];

        for (let pIdx = 0; pIdx < templates.length; pIdx++) {
          const temp = templates[pIdx];
          const prodSlug = slugify(temp.name);
          const prodId = `demo_${est.id}_${prodSlug}`;

          const matchedCat = catMap[temp.categoryName];

          const product: Product = {
            id: prodId,
            name: temp.name,
            description: temp.description,
            price: temp.price,
            category: temp.categoryName,
            available: true,
            image: getRandomImage(segment, pIdx),
            establishmentId: est.id,
            menuCategoryId: matchedCat?.id,
            menuCategoryName: matchedCat?.name,
            sizes: temp.sizes || undefined,
            borders: temp.borders || undefined,
            extras: temp.extras || undefined,
            optionGroups: temp.optionGroups || undefined,
            preparedToOrder: temp.preparedToOrder ?? false,
            freshIngredients: temp.freshIngredients ?? false,
            ...({
              isDemo: true,
              demoSource: "automatic-catalog-generator",
              demoVersion: 1,
              createdForPresentation: true,
              active: true,
              featured: !!temp.isFeatured,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            } as any)
          };

          estProdsList.push(product);
          totalProds++;
        }

        nextProducts[est.id] = estProdsList;
      }

      onProgress(`Geração concluída com sucesso localmente! ${totalCats} categorias e ${totalProds} produtos foram injetados no estado.`);

      return {
        success: true,
        message: `Geração finalizada localmente! ${totalCats} categorias e ${totalProds} produtos foram gerados.`,
        createdCategoriesCount: totalCats,
        createdProductsCount: totalProds,
        localProducts: nextProducts,
        localCategories: nextCategories,
      };
    }
  },

  /**
   * Remove demonstration products generated by this automatic generator safely.
   */
  async removeDemonstrationProducts(
    activeSource: "local" | "firestore",
    establishments: Establishment[],
    currentProductsState: Record<string, Product[]>,
    currentCategoriesState: Record<string, MenuCategory[]>,
    onProgress: (msg: string) => void,
    establishmentId?: string
  ): Promise<GenerationResult> {
    onProgress(`Iniciando remoção de produtos demonstrativos do modo ${activeSource === "firestore" ? "Cloud Firestore" : "Demo local"}...`);

    let removedCatsCount = 0;
    let removedProdsCount = 0;

    if (activeSource === "firestore") {
      if (!db) {
        throw new Error("Conexão com Firestore indisponível para remoção.");
      }

      // We need to query products that are demo products.
      onProgress("Buscando produtos de demonstração cadastrados no Firestore...");
      
      let prodsQuery = query(collection(db, "products"), where("demoSource", "==", "automatic-catalog-generator"));
      if (establishmentId) {
        prodsQuery = query(prodsQuery, where("establishmentId", "==", establishmentId));
      }

      const prodsSnap = await getDocs(prodsQuery);

      onProgress(`Encontrados ${prodsSnap.size} produtos de demonstração para remover.`);

      let batch = writeBatch(db);
      let opCount = 0;

      prodsSnap.forEach((prodDoc) => {
        batch.delete(prodDoc.ref);
        opCount++;
        removedProdsCount++;

        if (opCount >= 45) {
          batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      });

      if (opCount > 0) {
        await batch.commit();
      }

      // Now we must find and remove demo categories.
      onProgress("Removendo categorias de demonstração vinculadas...");
      
      const targetEsts = establishmentId 
        ? establishments.filter(e => e.id === establishmentId) 
        : establishments;

      for (const est of targetEsts) {
        const catSnap = await getDocs(collection(db, "establishments", est.id, "menuCategories"));
        let estBatch = writeBatch(db);
        let estOpCount = 0;

        catSnap.forEach((catDoc) => {
          const data = catDoc.data();
          if (data.demoSource === "automatic-catalog-generator") {
            estBatch.delete(catDoc.ref);
            estOpCount++;
            removedCatsCount++;
          }
        });

        if (estOpCount > 0) {
          await estBatch.commit();
        }
      }

      onProgress(`Remoção concluída! Foram excluídos ${removedProdsCount} produtos e ${removedCatsCount} categorias do Cloud Firestore.`);

      return {
        success: true,
        message: `Remoção finalizada! ${removedProdsCount} produtos e ${removedCatsCount} categorias demonstrativas foram excluídos com sucesso.`,
        createdCategoriesCount: removedCatsCount,
        createdProductsCount: removedProdsCount,
      };

    } else {
      // Local removal
      const nextProducts: Record<string, Product[]> = {};
      const nextCategories: Record<string, MenuCategory[]> = {};

      // Filter products
      Object.keys(currentProductsState).forEach((estId) => {
        const prodsList = currentProductsState[estId] || [];
        
        if (establishmentId && estId !== establishmentId) {
          nextProducts[estId] = prodsList;
          return;
        }

        const filteredProds = prodsList.filter((p) => {
          const isDemoProd = (p as any).isDemo === true && (p as any).demoSource === "automatic-catalog-generator";
          if (isDemoProd) {
            removedProdsCount++;
            return false;
          }
          return true;
        });
        nextProducts[estId] = filteredProds;
      });

      // Filter categories
      Object.keys(currentCategoriesState).forEach((estId) => {
        const catsList = currentCategoriesState[estId] || [];

        if (establishmentId && estId !== establishmentId) {
          nextCategories[estId] = catsList;
          return;
        }

        const filteredCats = catsList.filter((c) => {
          const isDemoCat = (c as any).isDemo === true && (c as any).demoSource === "automatic-catalog-generator";
          if (isDemoCat) {
            removedCatsCount++;
            return false;
          }
          return true;
        });
        nextCategories[estId] = filteredCats;
      });

      onProgress(`Remoção concluída localmente! Foram excluídos ${removedProdsCount} produtos e ${removedCatsCount} categorias do estado.`);

      return {
        success: true,
        message: `Remoção finalizada localmente! ${removedProdsCount} produtos e ${removedCatsCount} categorias demonstrativas foram excluídos com sucesso.`,
        createdCategoriesCount: removedCatsCount,
        createdProductsCount: removedProdsCount,
        localProducts: nextProducts,
        localCategories: nextCategories,
      };
    }
  }
};
