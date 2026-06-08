import { describe, it, expect } from 'vitest';
import { calculate, sensitivityAnalysis, DEFAULTS } from './calculator.js';

// ─── Shared test fixtures ────────────────────────────────────────────────────

/**
 * BARE: all rates/fees zeroed out so expected values can be computed by hand.
 *
 * mortgageRate=0  →  monthly P&I = loanAmount / (loanTermYears×12)
 *                    = 160,000 / 360 = 444.44/mo (pure principal paydown)
 * monthlyRent=1000 > 444.44  →  buying is cheaper each month (negative delta)
 * investmentReturnRate=0     →  portfolio changes only from monthly deltas
 */
const BARE = {
  homePrice: 200_000,
  downPaymentPct: 20,          // downPayment=40k, loan=160k
  mortgageRate: 0,
  loanTermYears: 30,
  propertyTaxRate: 0,
  hoaMonthly: 0,
  maintenancePct: 0,
  homeInsuranceMonthly: 0,
  buyingClosingCostPct: 0,     // renterStart = downPayment = 40k
  sellingClosingCostPct: 0,
  homeAppreciationRate: 0,
  monthlyRent: 1_000,
  rentEscalationRate: 0,
  investmentReturnRate: 0,
  inflationRate: 0,
  marginalTaxRate: 0,
  deductMortgageInterest: false,
  timeHorizonYears: 5,
  pmiRate: 0,
  renterSavingsRate: 100,
};

// BARE with rent cheaper than buying (delta > 0 → renter portfolio grows)
const BARE_RENT_CHEAP = { ...BARE, monthlyRent: 100 };

// BARE variant for PMI tests: 10% down, LTV=90%, 0% rate so balance math is exact
const PMI_CONFIG = {
  ...BARE,
  homePrice: 200_000,
  downPaymentPct: 10,   // downPayment=20k, loan=180k, LTV=90% → PMI charged
  pmiRate: 1.0,         // 1% of original loan / 12 = 150/mo when LTV > 80%
  monthlyRent: 2_000,
  timeHorizonYears: 5,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const yr = (result, n) => result.years.find((y) => y.year === n);

// ─── Year 0 snapshot ─────────────────────────────────────────────────────────

describe('year 0 snapshot', () => {
  it('has correct home value, balance, and equity', () => {
    const r = calculate(BARE);
    const y0 = yr(r, 0);
    expect(y0.homeValue).toBe(200_000);
    expect(y0.mortgageBalance).toBe(160_000);
    expect(y0.equity).toBe(40_000);
  });

  it('buyerNetWorth deducts immediate selling costs', () => {
    const r = calculate({ ...BARE, sellingClosingCostPct: 6 });
    const y0 = yr(r, 0);
    // equity=40k minus 6% of 200k = 40k - 12k = 28k
    expect(y0.buyerNetWorth).toBe(28_000);
  });

  it('renterNetWorth equals down payment plus closing costs', () => {
    const r = calculate({ ...BARE, buyingClosingCostPct: 3 });
    const y0 = yr(r, 0);
    // 40k + 3% of 200k = 40k + 6k = 46k
    expect(y0.renterNetWorth).toBe(46_000);
  });

  it('renterNetWorth equals downPayment when no closing costs', () => {
    const r = calculate(BARE);
    expect(yr(r, 0).renterNetWorth).toBe(40_000);
  });

  it('returns timeHorizonYears + 1 entries (year 0 through N)', () => {
    const r = calculate({ ...BARE, timeHorizonYears: 7 });
    expect(r.years.length).toBe(8);
    expect(r.years[0].year).toBe(0);
    expect(r.years[7].year).toBe(7);
  });
});

// ─── Monthly payment formula ──────────────────────────────────────────────────

describe('monthly mortgage payment', () => {
  it('equals principal / months when rate is 0', () => {
    // 160k loan, 0% rate, 30yr → 160000/360 = 444.44/mo
    const r = calculate(BARE);
    expect(r.summary.monthlyMortgage).toBeCloseTo(444.44, 0);
  });

  it('matches standard amortization formula at 6%', () => {
    // 160k at 6%/yr for 30yr:
    //   r=0.005, n=360, PMT = 160000 × 0.005 × (1.005^360) / (1.005^360 - 1)
    //   ≈ $959.28/mo
    const r = calculate({ ...BARE, mortgageRate: 6 });
    expect(r.summary.monthlyMortgage).toBeCloseTo(959.28, 0);
  });

  it('higher rate produces higher monthly payment', () => {
    const low = calculate({ ...BARE, mortgageRate: 4 });
    const high = calculate({ ...BARE, mortgageRate: 8 });
    expect(high.summary.monthlyMortgage).toBeGreaterThan(low.summary.monthlyMortgage);
  });
});

// ─── Amortization invariants ──────────────────────────────────────────────────

describe('amortization', () => {
  it('mortgage balance decreases every year', () => {
    const r = calculate(BARE);
    for (let i = 1; i <= 5; i++) {
      expect(yr(r, i).mortgageBalance).toBeLessThan(yr(r, i - 1).mortgageBalance);
    }
  });

  it('equity equals homeValue minus mortgageBalance each year', () => {
    const r = calculate({ ...BARE, homeAppreciationRate: 3 });
    for (let i = 1; i <= 5; i++) {
      const y = yr(r, i);
      expect(y.equity).toBeCloseTo(y.homeValue - y.mortgageBalance, -1);
    }
  });

  it('principal paid reduces balance by approximately PMT×12 (0% rate)', () => {
    // At 0% rate all payment is principal. Both sides are Math.round'd independently,
    // so the difference can be off by up to ~10 due to accumulated rounding.
    const r = calculate(BARE);
    const pmt = r.summary.monthlyMortgage; // 444.44
    for (let i = 1; i <= 5; i++) {
      const balanceDrop = yr(r, i - 1).mortgageBalance - yr(r, i).mortgageBalance;
      expect(Math.abs(balanceDrop - pmt * 12)).toBeLessThanOrEqual(10);
    }
  });

  it('interest + principal ≈ total mortgage payments for the year', () => {
    // Each field is individually Math.round'd; allow ±5 for rounding accumulation.
    const r = calculate({ ...BARE, mortgageRate: 6 });
    for (let i = 1; i <= 5; i++) {
      const y = yr(r, i);
      const totalPayments = r.summary.monthlyMortgage * 12;
      expect(y.yearlyInterest + y.yearlyPrincipal).toBeCloseTo(totalPayments, -1);
    }
  });

  it('cumulative buyer cost increases every year', () => {
    const r = calculate(BARE);
    for (let i = 2; i <= 5; i++) {
      expect(yr(r, i).cumulativeBuyerCost).toBeGreaterThan(yr(r, i - 1).cumulativeBuyerCost);
    }
  });
});

// ─── Mortgage payoff ──────────────────────────────────────────────────────────

describe('mortgage payoff', () => {
  // 0% rate, 5yr term, 7yr horizon: P&I = 160k/60 = 2666.67/mo = 32,000/yr,
  // loan fully amortized at the end of year 5 → no P&I in years 6 and 7.
  const PAYOFF = { ...BARE, mortgageRate: 0, loanTermYears: 5, timeHorizonYears: 7 };

  it('charges P&I every year up to and including the loan term', () => {
    const r = calculate(PAYOFF);
    for (let i = 1; i <= 5; i++) {
      expect(yr(r, i).annualMortgage).toBeCloseTo(32_000, -1);
    }
  });

  it('charges zero P&I after the loan is paid off', () => {
    const r = calculate(PAYOFF);
    expect(yr(r, 5).mortgageBalance).toBe(0);
    expect(yr(r, 6).annualMortgage).toBe(0);
    expect(yr(r, 7).annualMortgage).toBe(0);
  });

  it('buyer annual cash cost drops by the P&I amount once the loan ends', () => {
    const r = calculate(PAYOFF);
    // Year 6 vs year 5: only the ~32k P&I should disappear (other costs are flat at 0 in BARE).
    const drop = yr(r, 5).annualBuyerCashCost - yr(r, 6).annualBuyerCashCost;
    expect(drop).toBeCloseTo(32_000, -1);
  });

  it('keeps charging P&I for the whole horizon when the loan never finishes', () => {
    // Loan term (30) longer than horizon (5): mortgage is still being paid every year.
    const r = calculate({ ...BARE, loanTermYears: 30, timeHorizonYears: 5 });
    for (let i = 1; i <= 5; i++) {
      expect(yr(r, i).annualMortgage).toBeGreaterThan(0);
    }
  });
});

// ─── Home appreciation ────────────────────────────────────────────────────────

describe('home appreciation', () => {
  it('home value compounds at the specified annual rate', () => {
    const rate = 5;
    const r = calculate({ ...BARE, homeAppreciationRate: rate });
    for (let i = 1; i <= 5; i++) {
      const expected = 200_000 * Math.pow(1 + rate / 100, i);
      expect(yr(r, i).homeValue).toBeCloseTo(expected, -2);
    }
  });

  it('zero appreciation keeps home value flat', () => {
    const r = calculate(BARE);
    for (let i = 1; i <= 5; i++) {
      expect(yr(r, i).homeValue).toBe(200_000);
    }
  });

  it('higher appreciation produces higher buyer net worth', () => {
    const low = calculate({ ...BARE, homeAppreciationRate: 0 });
    const high = calculate({ ...BARE, homeAppreciationRate: 5 });
    expect(yr(high, 5).buyerNetWorth).toBeGreaterThan(yr(low, 5).buyerNetWorth);
  });
});

// ─── PMI ─────────────────────────────────────────────────────────────────────

describe('PMI', () => {
  it('is zero every year when down payment >= 20%', () => {
    const r = calculate({ ...BARE, downPaymentPct: 20, pmiRate: 1.0 });
    for (let i = 1; i <= 5; i++) {
      expect(yr(r, i).yearlyPMI).toBe(0);
    }
  });

  it('is charged at full annual rate when LTV > 80% for all 12 months', () => {
    // loan=180k, pmiRate=1%, LTV=90%: 180k × 1% / 12 = 150/mo = 1800/yr
    const r = calculate(PMI_CONFIG);
    expect(yr(r, 1).yearlyPMI).toBeCloseTo(1_800, 0);
    expect(yr(r, 2).yearlyPMI).toBeCloseTo(1_800, 0);
    expect(yr(r, 3).yearlyPMI).toBeCloseTo(1_800, 0);
  });

  it('drops off once balance falls to 80% of home value', () => {
    // At 0% rate, monthly principal = 180k/360 = 500/mo.
    // LTV hits 80% (balance=160k) after 180k-160k / 500 = 40 months (month 40).
    // Months 37-39 still in year 4, months 40+ in year 4 and beyond have no PMI.
    const r = calculate(PMI_CONFIG);
    expect(yr(r, 4).yearlyPMI).toBeCloseTo(450, 0); // only 3 months: 150×3
    expect(yr(r, 5).yearlyPMI).toBe(0);
  });
});

// ─── Renter portfolio: symmetric delta ───────────────────────────────────────

describe('renter portfolio (symmetric delta)', () => {
  it('decreases when buying is cheaper than renting (0% return)', () => {
    // BARE: buyer pays 444.44/mo, rent=1000/mo → buying cheaper by 555.56/mo
    // Year 1 portfolio = 40k + (444.44 - 1000) × 12 = 40k - 6666.67 = 33333
    const r = calculate(BARE);
    expect(yr(r, 1).renterNetWorth).toBeCloseTo(33_333, 0);
  });

  it('increases when renting is cheaper than buying (0% return)', () => {
    // BARE_RENT_CHEAP: buyer pays 444.44/mo, rent=100/mo → renting cheaper by 344.44/mo
    // Year 1 portfolio = 40k + 344.44 × 12 = 40k + 4133 = 44133
    const r = calculate(BARE_RENT_CHEAP);
    expect(yr(r, 1).renterNetWorth).toBeCloseTo(44_133, 0);
  });

  it('deficit deduction is the same regardless of savings rate', () => {
    // When buying is cheaper (BARE), the savings rate has no effect — rent is
    // a real cost that always comes out of the portfolio in full.
    const r100 = calculate({ ...BARE, renterSavingsRate: 100 });
    const r0 = calculate({ ...BARE, renterSavingsRate: 0 });
    expect(yr(r0, 5).renterNetWorth).toBe(yr(r100, 5).renterNetWorth);
  });

  it('portfolio depletion accumulates correctly over multiple years', () => {
    // BARE: monthly deduction = 444.44 - 1000 = -555.56
    // 5 years × 12 months × 555.56 = 33333.33 deducted from 40k
    // Final portfolio ≈ 6667
    const r = calculate(BARE);
    expect(yr(r, 5).renterNetWorth).toBeCloseTo(6_667, 0);
  });
});

// ─── Savings rate ─────────────────────────────────────────────────────────────

describe('savings rate', () => {
  it('savingsRate=0 means surplus is never invested', () => {
    // BARE_RENT_CHEAP: renting cheaper, but if savingsRate=0 nothing is invested
    const r = calculate({ ...BARE_RENT_CHEAP, renterSavingsRate: 0 });
    for (let i = 1; i <= 5; i++) {
      expect(yr(r, i).annualSurplusInvested).toBe(0);
    }
  });

  it('savingsRate=0 leaves portfolio at starting capital when renting is cheaper (0% return)', () => {
    const r = calculate({ ...BARE_RENT_CHEAP, renterSavingsRate: 0 });
    // No return, no investment → stays at 40k
    expect(yr(r, 5).renterNetWorth).toBeCloseTo(40_000, 0);
  });

  it('annualSurplusInvested scales with savings rate', () => {
    const r50 = calculate({ ...BARE_RENT_CHEAP, renterSavingsRate: 50 });
    const r100 = calculate({ ...BARE_RENT_CHEAP, renterSavingsRate: 100 });
    for (let i = 1; i <= 5; i++) {
      // Allow ±5 for Math.round applied to each field independently
      expect(yr(r50, i).annualSurplusInvested).toBeCloseTo(
        yr(r100, i).annualSurplusInvested / 2,
        -1
      );
    }
  });

  it('annualSurplusInvested + annualSurplusUnaccounted = annualGrossSurplus', () => {
    const r = calculate({ ...BARE_RENT_CHEAP, renterSavingsRate: 60 });
    for (let i = 1; i <= 5; i++) {
      const y = yr(r, i);
      expect(y.annualSurplusInvested + y.annualSurplusUnaccounted).toBeCloseTo(
        y.annualGrossSurplus,
        0
      );
    }
  });
});

// ─── Rent escalation ─────────────────────────────────────────────────────────

describe('rent escalation', () => {
  it('monthly rent compounds at the specified annual rate', () => {
    const r = calculate({ ...BARE, rentEscalationRate: 10, monthlyRent: 1_000 });
    expect(yr(r, 1).monthlyRentThisYear).toBe(1_000);
    expect(yr(r, 2).monthlyRentThisYear).toBe(1_100);
    expect(yr(r, 3).monthlyRentThisYear).toBe(1_210);
  });

  it('zero escalation keeps rent flat', () => {
    const r = calculate({ ...BARE, rentEscalationRate: 0, monthlyRent: 1_500 });
    for (let i = 1; i <= 5; i++) {
      expect(yr(r, i).monthlyRentThisYear).toBe(1_500);
    }
  });

  it('cumulative renter cost equals sum of annual rent payments', () => {
    const r = calculate({ ...BARE, rentEscalationRate: 5, monthlyRent: 1_000, timeHorizonYears: 3 });
    // Year 1: 12k, Year 2: 12.6k, Year 3: 13.23k; cumulative at year 3 = 37830
    const expected =
      yr(r, 1).annualRenterCost +
      yr(r, 2).annualRenterCost +
      yr(r, 3).annualRenterCost;
    expect(yr(r, 3).cumulativeRenterCost).toBeCloseTo(expected, -1);
  });
});

// ─── Mortgage interest deduction ─────────────────────────────────────────────

describe('mortgage interest deduction', () => {
  it('yields non-zero tax saving when enabled', () => {
    const r = calculate({ ...BARE, mortgageRate: 6, deductMortgageInterest: true, marginalTaxRate: 25 });
    expect(yr(r, 1).yearlyTaxSaving).toBeGreaterThan(0);
  });

  it('yields zero tax saving when disabled', () => {
    const r = calculate({ ...BARE, mortgageRate: 6, deductMortgageInterest: false, marginalTaxRate: 25 });
    for (let i = 1; i <= 5; i++) {
      expect(yr(r, i).yearlyTaxSaving).toBe(0);
    }
  });

  it('higher tax rate produces proportionally higher saving', () => {
    const r20 = calculate({ ...BARE, mortgageRate: 6, deductMortgageInterest: true, marginalTaxRate: 20 });
    const r40 = calculate({ ...BARE, mortgageRate: 6, deductMortgageInterest: true, marginalTaxRate: 40 });
    // Allow ±5 for Math.round on each stored field
    expect(yr(r40, 1).yearlyTaxSaving).toBeCloseTo(yr(r20, 1).yearlyTaxSaving * 2, -1);
  });

  it('tax saving is exactly interest × marginal rate', () => {
    const rate = 30;
    const r = calculate({ ...BARE, mortgageRate: 6, deductMortgageInterest: true, marginalTaxRate: rate });
    for (let i = 1; i <= 5; i++) {
      const y = yr(r, i);
      // Both fields are Math.round'd independently — allow ±5
      expect(y.yearlyTaxSaving).toBeCloseTo(y.yearlyInterest * (rate / 100), -1);
    }
  });

  it('deduction reduces buyer effective monthly cost, shrinking renter surplus', () => {
    // The deduction lowers buyerNetMonthlyCash → monthlyDelta shrinks → renter
    // invests less each month (when renting is cheaper). Renter NW is lower with deduction.
    const base = { ...BARE_RENT_CHEAP, mortgageRate: 6, marginalTaxRate: 30 };
    const noDeduct = calculate({ ...base, deductMortgageInterest: false });
    const withDeduct = calculate({ ...base, deductMortgageInterest: true });
    expect(yr(withDeduct, 5).renterNetWorth).toBeLessThan(yr(noDeduct, 5).renterNetWorth);
  });
});

// ─── Break-even detection ─────────────────────────────────────────────────────

describe('break-even', () => {
  it('is year 1 when buying is immediately and substantially better', () => {
    // BARE: buyer equity (45k) > renter portfolio (33k) from year 1 onward
    const r = calculate(BARE);
    expect(r.breakEvenYear).toBe(1);
  });

  it('is null when renting is never overtaken within the horizon', () => {
    // Very cheap rent → renter portfolio grows; high selling costs → buyer never catches up
    const r = calculate({
      ...BARE_RENT_CHEAP,
      sellingClosingCostPct: 30,
      timeHorizonYears: 5,
    });
    expect(r.breakEvenYear).toBeNull();
  });

  it('is found within the horizon when buying eventually wins', () => {
    // High appreciation + long horizon → buyer will eventually win
    const r = calculate({ ...DEFAULTS, homeAppreciationRate: 8, timeHorizonYears: 30 });
    expect(r.breakEvenYear).not.toBeNull();
    expect(r.breakEvenYear).toBeGreaterThanOrEqual(1);
    expect(r.breakEvenYear).toBeLessThanOrEqual(30);
  });

  it('is not reported for year 0', () => {
    // Year 0 is the decision point and cannot be the break-even
    const r = calculate(BARE);
    expect(r.breakEvenYear).not.toBe(0);
  });

  it('at break-even year, buyer net worth >= renter net worth', () => {
    const r = calculate({ ...DEFAULTS, homeAppreciationRate: 8, timeHorizonYears: 30 });
    if (r.breakEvenYear !== null) {
      const y = yr(r, r.breakEvenYear);
      expect(y.buyerNetWorth).toBeGreaterThanOrEqual(y.renterNetWorth);
    }
  });

  it('all years before break-even have buyer net worth < renter net worth', () => {
    const r = calculate({ ...DEFAULTS, homeAppreciationRate: 8, timeHorizonYears: 30 });
    if (r.breakEvenYear !== null && r.breakEvenYear > 1) {
      for (let i = 1; i < r.breakEvenYear; i++) {
        expect(yr(r, i).buyerNetWorth).toBeLessThan(yr(r, i).renterNetWorth);
      }
    }
  });
});

// ─── Selling costs ────────────────────────────────────────────────────────────

describe('selling costs', () => {
  it('are deducted from buyer net worth each year', () => {
    const noSell = calculate({ ...BARE, sellingClosingCostPct: 0 });
    const withSell = calculate({ ...BARE, sellingClosingCostPct: 6 });
    for (let i = 1; i <= 5; i++) {
      expect(yr(withSell, i).buyerNetWorth).toBeLessThan(yr(noSell, i).buyerNetWorth);
    }
  });

  it('selling cost deduction equals pct × homeValue that year', () => {
    const pct = 6;
    const r = calculate({ ...BARE, sellingClosingCostPct: pct, homeAppreciationRate: 3 });
    for (let i = 1; i <= 5; i++) {
      const y = yr(r, i);
      const expectedDeduction = y.homeValue * (pct / 100);
      expect(y.equity - y.buyerNetWorth).toBeCloseTo(expectedDeduction, -1);
    }
  });
});

// ─── HOA ──────────────────────────────────────────────────────────────────────

describe('HOA', () => {
  it('adds to annual buyer cash cost', () => {
    const noHoa = calculate({ ...BARE, hoaMonthly: 0 });
    const withHoa = calculate({ ...BARE, hoaMonthly: 500 });
    for (let i = 1; i <= 5; i++) {
      expect(yr(withHoa, i).annualBuyerCashCost).toBeCloseTo(
        yr(noHoa, i).annualBuyerCashCost + 500 * 12,
        0
      );
    }
  });
});

// ─── Sensitivity analysis ─────────────────────────────────────────────────────

describe('sensitivityAnalysis', () => {
  it('returns one result per value in the input array', () => {
    const values = [2, 4, 6, 8];
    const results = sensitivityAnalysis(DEFAULTS, 'mortgageRate', values);
    expect(results).toHaveLength(4);
  });

  it('each result contains value, breakEvenYear, and finalDiff', () => {
    const results = sensitivityAnalysis(DEFAULTS, 'homeAppreciationRate', [3, 5]);
    for (const row of results) {
      expect(row).toHaveProperty('value');
      expect(row).toHaveProperty('breakEvenYear');
      expect(row).toHaveProperty('finalDiff');
    }
  });

  it('higher appreciation produces a higher finalDiff (favors buying)', () => {
    const results = sensitivityAnalysis(DEFAULTS, 'homeAppreciationRate', [0, 3, 6]);
    expect(results[2].finalDiff).toBeGreaterThan(results[1].finalDiff);
    expect(results[1].finalDiff).toBeGreaterThan(results[0].finalDiff);
  });

  it('higher investment return favors renting (lower finalDiff)', () => {
    const results = sensitivityAnalysis(DEFAULTS, 'investmentReturnRate', [3, 7, 12]);
    expect(results[2].finalDiff).toBeLessThan(results[1].finalDiff);
    expect(results[1].finalDiff).toBeLessThan(results[0].finalDiff);
  });
});

// ─── Full scenario with DEFAULTS ─────────────────────────────────────────────

describe('DEFAULTS (Berkeley) sanity checks', () => {
  it('produces a complete result with the expected shape', () => {
    const r = calculate(DEFAULTS);
    expect(r.years).toHaveLength(DEFAULTS.timeHorizonYears + 1);
    expect(r.summary).toHaveProperty('monthlyMortgage');
    expect(r.summary).toHaveProperty('downPayment');
    expect(r.summary.downPayment).toBe(DEFAULTS.homePrice * (DEFAULTS.downPaymentPct / 100));
  });

  it('recommendation string references the time horizon', () => {
    const r = calculate(DEFAULTS);
    expect(r.recommendation).toContain(String(DEFAULTS.timeHorizonYears));
  });

  it('all year entries have non-negative homeValue and equity', () => {
    const r = calculate(DEFAULTS);
    for (const y of r.years) {
      expect(y.homeValue).toBeGreaterThanOrEqual(0);
      expect(y.equity).toBeGreaterThanOrEqual(0);
    }
  });

  it('renting wins at the default 10-year horizon given Berkeley price-to-rent ratio', () => {
    // With $1.55M home, $3.2k rent, 7% investment return, renting should win at 10yr
    const r = calculate(DEFAULTS);
    const final = r.years[r.years.length - 1];
    expect(final.renterNetWorth).toBeGreaterThan(final.buyerNetWorth);
  });

  it('buying wins at long horizon when buying is cheaper each month (BARE config)', () => {
    // BARE: buying costs 444/mo vs rent 1000/mo → buyer wins from year 1.
    // After 30yr the loan pays off and buyer owes nothing; renter still pays $1k/mo.
    const r = calculate({ ...BARE, timeHorizonYears: 35 });
    const final = r.years[r.years.length - 1];
    expect(final.buyerNetWorth).toBeGreaterThan(final.renterNetWorth);
  });
});
