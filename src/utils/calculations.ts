import { Asset } from '../types';
import { differenceInMonths, parseISO, isValid } from 'date-fns';

export function calculateDepreciation(asset: Asset, targetDate: Date = new Date()) {
  const acqDate = parseISO(asset.acquisitionDate);
  if (!isValid(acqDate)) return { monthly: 0, accumulated: 0, bookValue: asset.acquisitionValueBRL };

  const monthsPassed = Math.max(0, differenceInMonths(targetDate, acqDate));
  const totalMonths = asset.accountingUsefulLifeYears * 12 + asset.accountingUsefulLifeMonths;
  
  if (totalMonths <= 0) return { monthly: 0, accumulated: 0, bookValue: asset.acquisitionValueBRL };

  const depreciableAmount = asset.acquisitionValueBRL - asset.residualValueBRL;
  const monthlyDepreciation = depreciableAmount / totalMonths;
  const accumulatedDepreciation = Math.min(depreciableAmount, monthlyDepreciation * monthsPassed);
  const bookValue = asset.acquisitionValueBRL - accumulatedDepreciation;

  return {
    monthly: monthlyDepreciation,
    accumulated: accumulatedDepreciation,
    bookValue: bookValue
  };
}

export function formatCurrency(value: number, currency: 'BRL' | 'USD' = 'BRL') {
  return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'en-US', {
    style: 'currency',
    currency: currency
  }).format(value);
}
