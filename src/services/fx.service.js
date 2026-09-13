/**
 * FX (Foreign Exchange) Rate Service
 * 
 * Provides live exchange rates powered by European Central Bank data via the open
 * Frankfurter API, with in-memory caching and offline static fallbacks.
 */

// In-memory cache for exchange rates: Map<"FROM_TO", { rate: number, expiresAt: number }>
const rateCache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Static base rates against USD (used only when external network API is unreachable)
const BASE_RATES_USD = {
  USD: 1.0,
  EUR: 0.92,
  INR: 83.50,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155.0,
  CHF: 0.90,
  CNY: 7.23,
  SGD: 1.35,
  AED: 3.673,
  SAR: 3.751,
  THB: 36.5,
  PHP: 58.0,
  MYR: 4.70,
  NZD: 1.63,
  HKD: 7.82,
  KRW: 1370.0,
  BRL: 5.25,
  ZAR: 18.5,
  KWD: 0.307,
  BHD: 0.377,
  OMR: 0.385,
  QAR: 3.64
};

/**
 * Computes an offline fallback exchange rate between two currencies.
 * @param {string} from - Source currency code
 * @param {string} to - Target currency code
 * @returns {number}
 */
const getFallbackRate = (from, to) => {
  const fromRate = BASE_RATES_USD[from];
  const toRate = BASE_RATES_USD[to];

  if (fromRate && toRate) {
    return toRate / fromRate;
  }
  return 1.0;
};

/**
 * Retrieves the exchange rate: 1 unit of `from` = X units of `to`.
 * 
 * @param {string} fromCurrency
 * @param {string} toCurrency
 * @returns {Promise<number>}
 */
export const getExchangeRate = async (fromCurrency, toCurrency) => {
  const from = (fromCurrency || 'INR').trim().toUpperCase();
  const to = (toCurrency || 'INR').trim().toUpperCase();

  if (from === to) {
    return 1.0;
  }

  const cacheKey = `${from}_${to}`;
  const cached = rateCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.rate;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const rate = data.rates?.[to];

      if (typeof rate === 'number' && rate > 0) {
        rateCache.set(cacheKey, {
          rate,
          expiresAt: Date.now() + CACHE_TTL_MS
        });

        // Also cache inverse rate
        rateCache.set(`${to}_${from}`, {
          rate: 1 / rate,
          expiresAt: Date.now() + CACHE_TTL_MS
        });

        return rate;
      }
    }
  } catch (err) {
    console.warn(`[FX Service] Failed to fetch live rate for ${from}->${to} (${err.message}). Using fallback rate.`);
  }

  // Fallback to static rate
  const fallback = getFallbackRate(from, to);
  rateCache.set(cacheKey, {
    rate: fallback,
    expiresAt: Date.now() + (30 * 60 * 1000) // retry in 30 mins
  });
  return fallback;
};

/**
 * Converts an amount from one currency to another.
 * 
 * @param {number|string} amount - Source amount
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Destination currency code
 * @param {number|string} [customRate] - Optional manual override rate
 * @returns {Promise<{ convertedAmount: number, exchangeRate: number }>}
 */
export const convertAmount = async (amount, fromCurrency, toCurrency, customRate = null) => {
  const numAmount = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const from = (fromCurrency || 'INR').trim().toUpperCase();
  const to = (toCurrency || 'INR').trim().toUpperCase();

  if (from === to) {
    return {
      convertedAmount: numAmount,
      exchangeRate: 1.0
    };
  }

  let rate = customRate ? (typeof customRate === 'number' ? customRate : parseFloat(customRate)) : null;

  if (!rate || rate <= 0) {
    rate = await getExchangeRate(from, to);
  }

  const convertedAmount = parseFloat((numAmount * rate).toFixed(4));

  return {
    convertedAmount,
    exchangeRate: rate
  };
};
