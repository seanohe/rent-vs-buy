/**
 * Core rent-vs-buy financial calculator.
 * All monetary values in nominal dollars unless noted.
 */

export const DEFAULTS = {
  homePrice: 1550000,
  downPaymentPct: 20,
  mortgageRate: 6.5,
  loanTermYears: 30,
  propertyTaxRate: 1.25,
  hoaMonthly: 0,
  maintenancePct: 1.5,
  homeInsuranceMonthly: 202,
  buyingClosingCostPct: 2.5,
  sellingClosingCostPct: 6.0,
  homeAppreciationRate: 4.25,
  monthlyRent: 3200,
  rentEscalationRate: 3.5,
  investmentReturnRate: 7.0,
  inflationRate: 3.0,
  marginalTaxRate: 32,
  deductMortgageInterest: true,
  timeHorizonYears: 10,
  pmiRate: 0.5,
  renterSavingsRate: 100,
};

// Fields with researched Berkeley/CA-specific values (June 2026).
// Fields absent from this map use standard industry assumptions.
export const RESEARCHED = {
  homePrice:             'Berkeley median sale price — Redfin/Houzeo, Apr 2026',
  mortgageRate:          'CA 30-yr fixed rate — Bankrate/NerdWallet, Jun 2026',
  propertyTaxRate:       'Alameda County: 1% base + Berkeley bonds/assessments (~1.1–1.4% TRA range)',
  homeInsuranceMonthly:  'Berkeley avg ~$2,432/yr — insurancecostin.com, 2026',
  buyingClosingCostPct:  'CA buyer closing costs: typically 2–4%',
  sellingClosingCostPct: 'CA seller costs: ~5–7% (agent commissions + transfer tax)',
  homeAppreciationRate:  'Berkeley 10-yr annualized: 4.28% — NeighborhoodScout',
  monthlyRent:           'Berkeley 2BR market avg — Zillow/Zumper, May 2026',
  rentEscalationRate:    'Between Berkeley rent-controlled cap (~3%) and market rate (~3.9% YoY)',
  marginalTaxRate:       'Federal bracket for typical Bay Area professional income',
};

function monthlyPayment(principal, annualRate, termYears) {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * Returns an array of yearly snapshots (year 0 through N) for both buy and rent
 * scenarios, plus a summary object. Year 0 is the moment of purchase/decision.
 */
export function calculate(inputs) {
  const {
    homePrice,
    downPaymentPct,
    mortgageRate,
    loanTermYears,
    propertyTaxRate,
    hoaMonthly,
    maintenancePct,
    homeInsuranceMonthly,
    buyingClosingCostPct,
    sellingClosingCostPct,
    homeAppreciationRate,
    monthlyRent,
    rentEscalationRate,
    investmentReturnRate,
    marginalTaxRate,
    deductMortgageInterest,
    timeHorizonYears,
    pmiRate,
    renterSavingsRate,
  } = inputs;

  const downPayment = homePrice * (downPaymentPct / 100);
  const loanAmount = homePrice - downPayment;
  const buyingClosingCosts = homePrice * (buyingClosingCostPct / 100);
  const monthlyMortgage = monthlyPayment(loanAmount, mortgageRate, loanTermYears);
  const monthlyRate = mortgageRate / 100 / 12;

  // Representative (month 1) monthly carrying cost for the dashboard tile.
  // Includes P&I + property tax + HOA + insurance + PMI — but NOT maintenance
  // (maintenance is a budgeted reserve, not a fixed bill, so it's shown only in
  // the costs-breakdown chart, not the headline "monthly payment").
  const initialMonthlyPMI =
    loanAmount / homePrice > 0.8 ? (loanAmount * (pmiRate / 100)) / 12 : 0;
  const monthlyCarryingCost =
    monthlyMortgage +
    (homePrice * (propertyTaxRate / 100)) / 12 +
    hoaMonthly +
    homeInsuranceMonthly +
    initialMonthlyPMI;
  const savingsFraction = (renterSavingsRate ?? 100) / 100;

  // Renter invests the down payment + closing costs the buyer spends upfront.
  const renterStartingCapital = downPayment + buyingClosingCosts;
  const monthlyInvestmentReturn = investmentReturnRate / 100 / 12;

  // Year 0: the moment of decision (no time elapsed).
  // Buyer equity = down payment; buyer walkaway = equity − immediate selling costs.
  // Renter portfolio = starting capital invested (down payment + closing costs).
  // The gap here is the immediate cost-of-entry the buyer must overcome:
  //   closingCosts (paid to buy) + sellingCosts (owed if immediately sold).
  const year0SellingCosts = homePrice * (sellingClosingCostPct / 100);
  const years = [
    {
      year: 0,
      homeValue: homePrice,
      mortgageBalance: loanAmount,
      equity: downPayment,
      buyerNetWorth: downPayment - year0SellingCosts,
      renterNetWorth: renterStartingCapital,
      netWorthDiff: (downPayment - year0SellingCosts) - renterStartingCapital,
      yearlyInterest: 0,
      yearlyPrincipal: 0,
      yearlyPMI: 0,
      yearlyTaxSaving: 0,
      annualRent: monthlyRent * 12,
      cumulativeBuyerCost: downPayment + buyingClosingCosts,
      cumulativeRenterCost: 0,
    },
  ];

  let balance = loanAmount;
  let currentRent = monthlyRent;
  let cumulativeBuyerCost = downPayment + buyingClosingCosts;
  let cumulativeRenterCost = 0;
  let renterPortfolioMonthly = renterStartingCapital;

  for (let year = 1; year <= timeHorizonYears; year++) {
    let yearlyInterest = 0;
    let yearlyPrincipal = 0;
    let yearlyPMI = 0;
    let renterYearlyCost = 0;
    let annualGrossSurplus = 0; // total monthly surplus before savings rate, when renting is cheaper
    const monthsElapsed = (year - 1) * 12;

    for (let m = 1; m <= 12; m++) {
      const absoluteMonth = monthsElapsed + m;

      // Mortgage amortization
      const interestPayment = balance * monthlyRate;
      const principalPayment = Math.min(monthlyMortgage - interestPayment, balance);
      balance = Math.max(0, balance - principalPayment);
      yearlyInterest += interestPayment;
      yearlyPrincipal += principalPayment;

      // PMI: charged when balance > 80% of current home value
      const currentHomeValueMonth = homePrice * Math.pow(1 + homeAppreciationRate / 100, absoluteMonth / 12);
      if (balance / currentHomeValueMonth > 0.8) {
        yearlyPMI += (loanAmount * (pmiRate / 100)) / 12;
      }

      renterYearlyCost += currentRent;

      // Total buyer monthly cash outflow (mortgage + taxes + HOA + maintenance + insurance + PMI).
      // Use the actual P&I paid this month (interest + principal), not the fixed nominal
      // payment: this naturally drops to $0 once the loan is paid off, so the buyer
      // correctly enjoys no mortgage payment after the loan term ends.
      const monthlyMortgagePaid = interestPayment + principalPayment;
      const monthlyPropertyTax = (homePrice * (propertyTaxRate / 100)) / 12;
      const monthlyMaintenance = (homePrice * (maintenancePct / 100)) / 12;
      const buyerMonthlyCash =
        monthlyMortgagePaid +
        monthlyPropertyTax +
        hoaMonthly +
        monthlyMaintenance +
        homeInsuranceMonthly +
        yearlyPMI / 12;

      const monthlyTaxSaving = deductMortgageInterest
        ? interestPayment * (marginalTaxRate / 100)
        : 0;

      const buyerNetMonthlyCash = buyerMonthlyCash - monthlyTaxSaving;

      // monthlyDelta > 0: renting is cheaper this month (renter has a surplus to invest)
      // monthlyDelta < 0: buying is cheaper this month (renter pays more in rent than buyer pays total)
      const monthlyDelta = buyerNetMonthlyCash - currentRent;

      if (monthlyDelta > 0) {
        annualGrossSurplus += monthlyDelta;
      }

      renterPortfolioMonthly *= 1 + monthlyInvestmentReturn;

      if (monthlyDelta > 0) {
        // Renting cheaper: invest surplus × savingsFraction; rest is assumed spent
        renterPortfolioMonthly += monthlyDelta * savingsFraction;
      } else {
        // Buying cheaper: renter pays the rent premium out of their portfolio.
        // savingsFraction does not apply here — rent is a real, unavoidable cost.
        renterPortfolioMonthly += monthlyDelta;
      }
    }

    currentRent *= 1 + rentEscalationRate / 100;

    const currentHomeValue = homePrice * Math.pow(1 + homeAppreciationRate / 100, year);
    const equity = currentHomeValue - balance;
    const sellingCosts = currentHomeValue * (sellingClosingCostPct / 100);
    const buyerNetWorth = equity - sellingCosts;
    const renterNetWorth = renterPortfolioMonthly;

    const yearlyTaxSaving = deductMortgageInterest ? yearlyInterest * (marginalTaxRate / 100) : 0;
    const yearlyBuyerCost =
      yearlyInterest + yearlyPrincipal +
      homePrice * (propertyTaxRate / 100) +
      homePrice * (maintenancePct / 100) +
      homeInsuranceMonthly * 12 +
      hoaMonthly * 12 +
      yearlyPMI -
      yearlyTaxSaving;

    cumulativeBuyerCost += yearlyBuyerCost;
    cumulativeRenterCost += renterYearlyCost;
    // annualCashSavings: positive = renting was cheaper this year; negative = buying was cheaper
    const annualCashSavings = yearlyBuyerCost - renterYearlyCost;

    years.push({
      year,
      homeValue: Math.round(currentHomeValue),
      mortgageBalance: Math.round(balance),
      equity: Math.round(equity),
      buyerNetWorth: Math.round(buyerNetWorth),
      renterNetWorth: Math.round(renterNetWorth),
      netWorthDiff: Math.round(buyerNetWorth - renterNetWorth),
      yearlyInterest: Math.round(yearlyInterest),
      yearlyPrincipal: Math.round(yearlyPrincipal),
      yearlyPMI: Math.round(yearlyPMI),
      yearlyTaxSaving: Math.round(yearlyTaxSaving),
      // Ownership cost components (annual) for the cost-breakdown chart.
      annualMortgage: Math.round(yearlyInterest + yearlyPrincipal),
      annualPropertyTax: Math.round(homePrice * (propertyTaxRate / 100)),
      annualMaintenance: Math.round(homePrice * (maintenancePct / 100)),
      annualInsurance: Math.round(homeInsuranceMonthly * 12),
      annualHOA: Math.round(hoaMonthly * 12),
      annualRent: Math.round(currentRent * 12 / (1 + rentEscalationRate / 100)),
      annualBuyerCashCost: Math.round(yearlyBuyerCost),
      annualRenterCost: Math.round(renterYearlyCost),
      annualCashSavings: Math.round(annualCashSavings),
      annualGrossSurplus: Math.round(annualGrossSurplus),
      annualSurplusInvested: Math.round(annualGrossSurplus * savingsFraction),
      annualSurplusUnaccounted: Math.round(annualGrossSurplus * (1 - savingsFraction)),
      monthlyRentThisYear: Math.round(renterYearlyCost / 12),
      cumulativeBuyerCost: Math.round(cumulativeBuyerCost),
      cumulativeRenterCost: Math.round(cumulativeRenterCost),
    });
  }

  const breakEvenYear = years.find((y) => y.year > 0 && y.buyerNetWorth >= y.renterNetWorth)?.year ?? null;

  const finalYear = years[years.length - 1];
  const recommendation =
    breakEvenYear !== null
      ? `Buying breaks even by year ${breakEvenYear}. Over ${timeHorizonYears} years, buying leaves you $${Math.abs(finalYear.netWorthDiff).toLocaleString()} ${finalYear.netWorthDiff >= 0 ? 'ahead' : 'behind'} renting.`
      : `Buying does not break even within the ${timeHorizonYears}-year horizon. Renting leaves you $${Math.abs(finalYear.netWorthDiff).toLocaleString()} ahead.`;

  return {
    years,
    breakEvenYear,
    recommendation,
    summary: {
      downPayment: Math.round(downPayment),
      buyingClosingCosts: Math.round(buyingClosingCosts),
      monthlyMortgage: Math.round(monthlyMortgage),
      monthlyCarryingCost: Math.round(monthlyCarryingCost),
      loanAmount: Math.round(loanAmount),
      finalBuyerNetWorth: finalYear.buyerNetWorth,
      finalRenterNetWorth: finalYear.renterNetWorth,
      finalHomeValue: finalYear.homeValue,
    },
  };
}

/**
 * Sensitivity analysis: vary one parameter across a range, return break-even years.
 */
export function sensitivityAnalysis(inputs, param, values) {
  return values.map((v) => {
    const result = calculate({ ...inputs, [param]: v });
    return {
      value: v,
      breakEvenYear: result.breakEvenYear,
      finalDiff: result.years[result.years.length - 1].netWorthDiff,
    };
  });
}
