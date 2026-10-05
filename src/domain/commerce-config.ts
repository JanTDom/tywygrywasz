export type CommerceOffer = {
  name: string;
  description: string;
  priceGrossPln: number | null;
  billingLabel: string;
  deliveryLabel: string;
};

export type CommerceSeller = {
  name: string;
  address: string;
  taxId: string;
  regon: string;
  email: string;
};

export type PublicCommerceConfig = {
  ready: boolean;
  offer: CommerceOffer;
  seller: CommerceSeller;
  missing: string[];
  paymentMethods: string[];
};

export function normalizePublicCommerceConfig(value: unknown): PublicCommerceConfig | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as { ready?: unknown; missing?: unknown; offer?: { name?: unknown; amount?: unknown; priceGrossPln?: unknown; currency?: unknown; description?: unknown; billingLabel?: unknown; deliveryLabel?: unknown } | null; seller?: { name?: unknown; address?: unknown; taxId?: unknown; regon?: unknown; email?: unknown } | null; paymentMethods?: unknown };
  const amount = typeof input.offer?.amount === 'number' ? input.offer.amount : null;
  const priceGrossPln = typeof input.offer?.priceGrossPln === 'number' ? input.offer.priceGrossPln : null;
  const currency = typeof input.offer?.currency === 'string' ? input.offer.currency : 'PLN';
  return {
    ready: input.ready === true,
    missing: Array.isArray(input.missing) ? input.missing.filter((item): item is string => typeof item === 'string') : [],
    offer: {
      name: typeof input.offer?.name === 'string' ? input.offer.name : DEFAULT_OFFER.name,
      description: typeof input.offer?.description === 'string' ? input.offer.description : DEFAULT_OFFER.description,
      priceGrossPln: priceGrossPln !== null ? priceGrossPln : amount === null ? null : currency === 'PLN' ? amount / 100 : null,
      billingLabel: typeof input.offer?.billingLabel === 'string' ? input.offer.billingLabel : DEFAULT_OFFER.billingLabel,
      deliveryLabel: typeof input.offer?.deliveryLabel === 'string' ? input.offer.deliveryLabel : DEFAULT_OFFER.deliveryLabel,
    },
    seller: {
      name: typeof input.seller?.name === 'string' ? input.seller.name : '',
      address: typeof input.seller?.address === 'string' ? input.seller.address : '',
      taxId: typeof input.seller?.taxId === 'string' ? input.seller.taxId : '',
      regon: typeof input.seller?.regon === 'string' ? input.seller.regon : '',
      email: typeof input.seller?.email === 'string' ? input.seller.email : '',
    },
    paymentMethods: Array.isArray(input.paymentMethods) ? input.paymentMethods.filter((item): item is string => typeof item === 'string') : ['BLIK', 'karty płatnicze', 'szybkie przelewy'],
  };
}

const DEFAULT_OFFER: CommerceOffer = {
  name: 'TyWygrywasz — plan sprawy',
  description: 'Dostęp do narzędzi, które pomagają połączyć dokumenty, instytucje i terminy w jeden plan działania.',
  priceGrossPln: null,
  billingLabel: 'Jednorazowa opłata — cena zostanie podana przed uruchomieniem sprzedaży',
  deliveryLabel: 'Aktywacja po potwierdzeniu płatności',
};

export const DEFAULT_SELLER: CommerceSeller = {
  name: 'Multinewsroom Jan Domaniewski',
  address: 'ul. Barcicka 44, 01-839 Warszawa',
  taxId: '5252189241',
  regon: '147154574',
  email: 'kontakt@tywygrywasz.pl',
};

function env(name: string): string {
  return process.env[name]?.trim() || '';
}

export function getPublicCommerceConfig(): PublicCommerceConfig {
  const configuredAmount = env('COMMERCE_PRICE_GROSS_PLN') || env('P24_AMOUNT_GROSZ');
  const configuredPrice = env('COMMERCE_PRICE_GROSS_PLN') ? Number(configuredAmount) : Number(configuredAmount) / 100;
  const offer: CommerceOffer = {
    name: env('COMMERCE_OFFER_NAME') || env('P24_OFFER_NAME') || DEFAULT_OFFER.name,
    description: env('COMMERCE_OFFER_DESCRIPTION') || DEFAULT_OFFER.description,
    priceGrossPln: Number.isFinite(configuredPrice) && configuredPrice > 0 ? configuredPrice : DEFAULT_OFFER.priceGrossPln,
    billingLabel: env('COMMERCE_BILLING_LABEL') || DEFAULT_OFFER.billingLabel,
    deliveryLabel: env('COMMERCE_DELIVERY_LABEL') || DEFAULT_OFFER.deliveryLabel,
  };
  const seller: CommerceSeller = {
    name: env('COMMERCE_SELLER_NAME') || env('P24_SELLER_NAME') || DEFAULT_SELLER.name,
    address: env('COMMERCE_SELLER_ADDRESS') || env('P24_SELLER_ADDRESS') || DEFAULT_SELLER.address,
    taxId: env('COMMERCE_SELLER_TAX_ID') || env('P24_SELLER_TAX_ID') || DEFAULT_SELLER.taxId,
    regon: env('COMMERCE_SELLER_REGON') || DEFAULT_SELLER.regon,
    email: env('COMMERCE_SELLER_EMAIL') || env('P24_SELLER_EMAIL') || DEFAULT_SELLER.email,
  };
  const missing: string[] = [];
  if (!offer.priceGrossPln || offer.priceGrossPln <= 0) missing.push('cena brutto oferty');
  if (!seller.name) missing.push('pełna nazwa sprzedawcy');
  if (!seller.address) missing.push('adres sprzedawcy');
  if (!seller.taxId) missing.push('NIP sprzedawcy');
  if (!seller.email) missing.push('e-mail sprzedawcy');
  if (!env('P24_MERCHANT_ID') || !env('P24_POS_ID') || !env('P24_CRC') || !env('P24_API_KEY')) missing.push('dane techniczne Przelewy24');
  return {
    ready: missing.length === 0,
    offer,
    seller,
    missing,
    paymentMethods: ['BLIK', 'karty płatnicze', 'szybkie przelewy'],
  };
}

export function formatGrossPrice(value: number | null): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value)
    : 'Cena w przygotowaniu';
}
