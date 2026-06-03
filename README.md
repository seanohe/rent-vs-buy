# Rent vs. Buy Calculator

A browser-based financial calculator for comparing the long-term wealth outcomes of buying a home versus renting and investing the difference. Defaults are seeded with researched Berkeley, CA values (June 2026) but every input is editable.

## Quick start

Requires Node.js 18+.

```bash
npm install
npm run dev        # opens at http://localhost:5173
```

## All commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server with hot-reload |
| `npm run build` | Compile a production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

## Project structure

```
src/
  calculator.js       — All financial logic; no React dependencies
  calculator.test.js  — Vitest test suite (53 tests)
  App.jsx             — UI: inputs panel + results panel with 4 tabs
  App.css             — Styles (dark theme, responsive)
  main.jsx            — React entry point
```

The calculator is fully decoupled from the UI. If you want to run the math in a script or notebook, import directly from `src/calculator.js`:

```js
import { calculate, sensitivityAnalysis, DEFAULTS } from './src/calculator.js';

const result = calculate({ ...DEFAULTS, timeHorizonYears: 20 });
console.log(result.breakEvenYear);
console.log(result.years[20]);
```

## How the model works

### What's being compared

Both paths start with the same capital (down payment + buyer closing costs). The comparison tracks **net worth at the end of each year** if you were to cash out:

- **Buyer net worth** = home equity − selling costs (what you'd walk away with after an agent and transfer taxes)
- **Renter net worth** = investment portfolio (starting capital compounded at the investment return rate, plus monthly savings invested each month)

### Monthly cash flow

Each month the model computes the buyer's total cash outflow:

```
Buyer monthly outflow = P&I mortgage + property tax + maintenance + insurance + HOA + PMI
                        − mortgage interest tax saving (if itemizing)
```

The difference between the buyer's outflow and the renter's rent payment determines what happens to the renter's portfolio that month:

- **When renting is cheaper** (outflow > rent): the surplus × savings rate is added to the renter's portfolio. The uninvested remainder (1 − savings rate) is assumed spent.
- **When buying is cheaper** (outflow < rent): the full rent premium is subtracted from the renter's portfolio. The savings rate does not apply — rent is a fixed obligation regardless of discipline.

This is symmetric by design: both the upside and downside of the cost differential flow through the renter's portfolio. In early years in high-cost markets (like Berkeley), owning is typically more expensive, so the renter accumulates a large portfolio. In later years as rent escalates past the paid-down mortgage, the buyer gains the advantage.

### Key assumptions and caveats

**PMI** is charged monthly whenever the loan balance exceeds 80% of the current home value, and drops off automatically once that threshold is crossed.

**Property tax (Prop 13)** is modeled as a fixed percentage of the *purchase price*, not the current market value, which matches California law. The rate does not escalate.

**Maintenance** is a fixed percentage of the purchase price per year (not of the current value).

**Mortgage interest deduction** only benefits buyers who itemize federal deductions. Since the 2018 tax reform raised the standard deduction to ~$30k, the majority of filers no longer itemize — turn this off if that applies to you.

**Investment return** is applied to the renter's full portfolio (starting capital + accumulated monthly investments), compounded monthly. This is the opportunity cost of the down payment. A reasonable baseline is the long-run S&P 500 real return (~7% nominal).

**Selling costs** (typically 5–7% in California) are deducted from the buyer's net worth every year, not just at sale. This is intentional: the chart shows what you could walk away with if you sold in any given year, which is the fair apples-to-apples comparison.

**No income tax on investment gains** is modeled. In practice, the renter's portfolio would face capital gains tax at sale, which would close the gap somewhat in scenarios where renting appears to win.

## Inputs reference

| Input | Default | Notes |
|---|---|---|
| Home Price | $1,550,000 | Berkeley median, Apr 2026 |
| Down Payment | 20% | Below 20% triggers PMI |
| Mortgage Rate | 6.5% | CA 30-yr fixed, Jun 2026 |
| Loan Term | 30 yr | |
| Buying Closing Costs | 2.5% | CA typical: 2–4% |
| Selling Closing Costs | 6.0% | CA typical: 5–7% |
| Property Tax Rate | 1.25% | Alameda County (Prop 13 basis) |
| HOA | $0/mo | ~$400/mo for Berkeley condos |
| Maintenance | 1.5% | Annual % of purchase price |
| Home Insurance | $202/mo | Berkeley avg ~$2,432/yr |
| PMI Rate | 0.5% | Typical 0.5–1% of original loan |
| Monthly Rent | $3,200 | Berkeley 2BR avg, May 2026 |
| Annual Rent Increase | 3.5% | Between rent-controlled (~3%) and market (~3.9%) |
| Home Appreciation | 4.25% | Berkeley 10-yr annualized |
| Investment Return | 7.0% | S&P 500 long-run nominal |
| Time Horizon | 10 yrs | |
| Marginal Tax Rate | 32% | Federal bracket; add ~9% for CA state benefit |
| Deduct Mortgage Interest | On | Turn off if taking standard deduction |
| Renter Savings Rate | 100% | Fraction of monthly surplus actually invested |

Fields marked **✓ Berkeley** in the UI have researched sources; hover the badge to see the source and date. Fields without the badge use standard industry assumptions.

## Tabs

**Overview** — Net worth over time for both paths, with break-even year marked. Also shows home value vs. mortgage balance vs. equity.

**Costs** — Four charts: renter surplus invested vs. unaccounted; projected monthly rent escalation; annual interest/principal breakdown; cumulative cash spent.

**Sensitivity** — Pick any single input and see how the break-even year and final net worth gap respond across a range of values. Useful for stress-testing key assumptions like appreciation rate or investment return.

**Table** — Full year-by-year data dump. Break-even year is highlighted.

## Tests

The test suite covers the calculation engine (`src/calculator.js`) with 53 tests across:

- Year 0 snapshot correctness
- Amortization math (balance, principal, interest)
- PMI charge and automatic drop-off
- Symmetric delta (renter portfolio grows when renting is cheaper, shrinks when buying is cheaper)
- Savings rate behavior (invested vs. unaccounted, no effect on deficit side)
- Rent escalation compounding
- Mortgage interest deduction
- Break-even detection and edge cases
- Selling cost deductions
- Sensitivity analysis output shape

```bash
npm test
```

## Stack

- [Vite](https://vite.dev) + [React 19](https://react.dev)
- [Recharts](https://recharts.org) for charts
- [Vitest](https://vitest.dev) for tests
- No backend — all calculations run in the browser
