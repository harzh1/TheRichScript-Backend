/**
 * Currency & Country Utilities (Architecture A: Lean In-Memory Registry)
 * Uses native V8 Unicode CLDR (Intl) for symbols, names, and minor unit decimals.
 */

// Common ISO 4217 Currency Codes
export const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'INR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD',
  'AED', 'SAR', 'MYR', 'NZD', 'HKD', 'KRW', 'BRL', 'ZAR', 'THB', 'PHP',
  'IDR', 'TRY', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'ILS', 'KWD', 'BHD',
  'OMR', 'QAR', 'VND', 'EGP', 'NGN', 'KES', 'PKR', 'BDT', 'LKR', 'NPR'
]);

// Minor unit decimals map for special currencies (CLDR defaults to 2 if not listed)
const SPECIAL_DECIMALS = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, PYG: 0,
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3
};

/**
 * Validates whether a string is a valid 3-letter ISO 4217 currency code.
 * @param {string} code
 * @returns {boolean}
 */
export const isValidCurrency = (code) => {
  if (!code || typeof code !== 'string') return false;
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(upper);
};

/**
 * Validates whether a string is a valid 2-letter ISO 3166-1 country code.
 * @param {string} code
 * @returns {boolean}
 */
export const isValidCountry = (code) => {
  if (!code || typeof code !== 'string') return false;
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper);
};

/**
 * Resolves metadata (symbol, localized name, decimal places) using native Intl API.
 * @param {string} currencyCode - ISO 4217 code (e.g. 'USD', 'INR', 'JPY')
 * @param {string} [locale='en-US']
 * @returns {{ code: string, name: string, symbol: string, decimals: number }}
 */
export const getCurrencyMetadata = (currencyCode, locale = 'en-US') => {
  const code = (currencyCode || 'INR').trim().toUpperCase();
  const decimals = SPECIAL_DECIMALS[code] !== undefined ? SPECIAL_DECIMALS[code] : 2;

  let name = code;
  let symbol = code;

  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'currency' });
    name = displayNames.of(code) || code;
  } catch {
    // Fallback to code if locale/code is unsupported
  }

  try {
    const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: code });
    const parts = formatter.formatToParts(0);
    const currencyPart = parts.find(p => p.type === 'currency');
    if (currencyPart) symbol = currencyPart.value;
  } catch {
    // Fallback to code if symbol lookup fails
  }

  return {
    code,
    name,
    symbol,
    decimals
  };
};

/**
 * Formats a monetary amount with currency symbol and appropriate decimal digits.
 * @param {number|string} amount
 * @param {string} currencyCode
 * @param {string} [locale='en-US']
 * @returns {string}
 */
export const formatCurrency = (amount, currencyCode = 'INR', locale = 'en-US') => {
  const code = currencyCode.toUpperCase();
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const decimals = SPECIAL_DECIMALS[code] !== undefined ? SPECIAL_DECIMALS[code] : 2;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  } catch {
    return `${code} ${num.toFixed(decimals)}`;
  }
};
