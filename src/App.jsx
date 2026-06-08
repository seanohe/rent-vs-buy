import { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { calculate, sensitivityAnalysis, DEFAULTS, RESEARCHED } from './calculator';
import './App.css';

const fmt = (n) => n?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? '—';
const fmtDollar = (n) => (n < 0 ? '-$' : '$') + fmt(Math.abs(n));

function TooltipIcon({ text, badge }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  const show = () => {
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 10 });
  };

  return (
    <span
      ref={ref}
      className={badge ? 'researched-badge' : 'tooltip-icon'}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      {badge ? '✓ Berkeley' : '?'}
      {pos && createPortal(
        <span className="tooltip-popup" style={{ top: pos.top, left: pos.left }}>
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}

function InputField({ label, name, value, onChange, min, max, step = 1, prefix, suffix, tooltip, researched }) {
  return (
    <div className="input-row">
      <label>
        {label}
        {researched && <TooltipIcon text={researched} badge />}
        {tooltip && <TooltipIcon text={tooltip} />}
      </label>
      <div className="input-wrap">
        {prefix && <span className="adornment">{prefix}</span>}
        <input
          type="number"
          name={name}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
        />
        {suffix && <span className="adornment suffix">{suffix}</span>}
      </div>
    </div>
  );
}

function Toggle({ label, name, checked, onChange, tooltip, researched }) {
  return (
    <div className="input-row">
      <label>
        {label}
        {researched && <TooltipIcon text={researched} badge />}
        {tooltip && <TooltipIcon text={tooltip} />}
      </label>
      <label className="switch">
        <input type="checkbox" name={name} checked={checked} onChange={onChange} />
        <span className="slider" />
      </label>
    </div>
  );
}

const SENSITIVITY_OPTIONS = [
  { key: 'homeAppreciationRate', label: 'Home Appreciation (%)', values: [0, 1, 2, 3, 4, 5, 6, 7], suffix: '%' },
  { key: 'mortgageRate', label: 'Mortgage Rate (%)', values: [4, 5, 6, 7, 8, 9, 10], suffix: '%' },
  { key: 'rentEscalationRate', label: 'Rent Escalation (%)', values: [1, 2, 3, 4, 5, 6], suffix: '%' },
  { key: 'investmentReturnRate', label: 'Investment Return (%)', values: [3, 5, 6, 7, 8, 10, 12], suffix: '%' },
  { key: 'renterSavingsRate', label: 'Renter Savings Rate (%)', values: [0, 25, 50, 75, 100], suffix: '%' },
  { key: 'timeHorizonYears', label: 'Time Horizon (years)', values: [3, 5, 7, 10, 15, 20, 30], suffix: 'yr' },
];

function CustomTooltip({ active, payload, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <p className="label">{labelFormatter ? labelFormatter(payload[0]?.payload) : ''}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtDollar(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function App() {
  const [inputs, setInputs] = useState(DEFAULTS);
  const [sensitivityParam, setSensitivityParam] = useState(SENSITIVITY_OPTIONS[0].key);
  const [activeTab, setActiveTab] = useState('overview');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setInputs((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : parseFloat(value) || 0,
    }));
  };

  const result = useMemo(() => calculate(inputs), [inputs]);
  const sensitivityOpt = SENSITIVITY_OPTIONS.find((o) => o.key === sensitivityParam);
  const sensitivityData = useMemo(
    () => sensitivityAnalysis(inputs, sensitivityParam, sensitivityOpt.values),
    [inputs, sensitivityParam]
  );

  const { years, breakEvenYear, recommendation, summary } = result;
  const finalYear = years[years.length - 1];
  const buyingWins = finalYear.buyerNetWorth >= finalYear.renterNetWorth;

  return (
    <div className="app">
      <header>
        <h1>Rent vs. Buy Calculator</h1>
        <p className="subtitle">Compare long-term wealth outcomes across both paths</p>
      </header>

      <div className="layout">
        {/* Inputs Panel */}
        <aside className="inputs-panel">
          <div className="inputs-legend">
            <span className="researched-badge">&#x2713; Berkeley</span> = researched default (hover for source)
          </div>

          <section>
            <h3>Home Purchase</h3>
            <InputField label="Home Price" name="homePrice" value={inputs.homePrice} onChange={handleChange} min={50000} step={5000} prefix="$"
              tooltip="Purchase price of the home. Base for your loan amount, property tax (% of this), maintenance (% of this), and all appreciation projections."
              researched={RESEARCHED.homePrice} />
            <InputField label="Down Payment" name="downPaymentPct" value={inputs.downPaymentPct} onChange={handleChange} min={3} max={100} step={0.5} suffix="%"
              tooltip="Cash paid upfront as a % of home price. Sets your loan amount (Home Price × remaining %). Below 20%, PMI is charged monthly until your balance-to-value ratio drops to 80%. This cash is also the renter's starting investment portfolio — the opportunity cost of buying." />
            <InputField label="Mortgage Rate" name="mortgageRate" value={inputs.mortgageRate} onChange={handleChange} min={1} max={20} step={0.125} suffix="%"
              tooltip="Annual interest rate on the loan. Used in the standard amortization formula to compute your fixed monthly P&I payment and how much of each payment is interest vs. principal paydown."
              researched={RESEARCHED.mortgageRate} />
            <InputField label="Loan Term" name="loanTermYears" value={inputs.loanTermYears} onChange={handleChange} min={5} max={30} step={5} suffix="yr"
              tooltip="Length of the mortgage. Combined with the rate and loan amount to compute the fixed monthly payment. Longer terms lower monthly payments but increase total interest paid over the life of the loan." />
            <InputField label="Buying Closing Costs" name="buyingClosingCostPct" value={inputs.buyingClosingCostPct} onChange={handleChange} min={0} max={10} step={0.25} suffix="%"
              tooltip="One-time costs at purchase (lender fees, title, escrow, recording) as a % of home price. Added to the buyer's upfront cash outlay alongside the down payment. Also included in the renter's starting investment capital since the renter avoids this cost."
              researched={RESEARCHED.buyingClosingCostPct} />
            <InputField label="Selling Closing Costs" name="sellingClosingCostPct" value={inputs.sellingClosingCostPct} onChange={handleChange} min={0} max={12} step={0.25} suffix="%"
              tooltip="Costs when you sell (agent commissions, transfer taxes) as a % of sale price. Deducted from home equity every year to reflect your true walkaway net worth. This is the biggest reason buying looks worse in early years — you must recoup these costs before buying beats renting."
              researched={RESEARCHED.sellingClosingCostPct} />
          </section>

          <section>
            <h3>Ongoing Ownership Costs</h3>
            <InputField label="Property Tax Rate" name="propertyTaxRate" value={inputs.propertyTaxRate} onChange={handleChange} min={0} max={5} step={0.1} suffix="%"
              tooltip="Annual property tax as a % of your purchase price. Under CA Prop 13, assessed value is locked at purchase and grows at most 2%/yr — so your rate effectively stays near what you pay at closing. Divided by 12 and added to monthly costs."
              researched={RESEARCHED.propertyTaxRate} />
            <InputField label="HOA (monthly)" name="hoaMonthly" value={inputs.hoaMonthly} onChange={handleChange} min={0} step={25} prefix="$"
              tooltip="Fixed monthly homeowners association fee. Added directly to monthly ownership costs each month. Does not escalate in this model — adjust if your HOA has a known rate schedule. Leave at $0 for most Berkeley single-family homes." />
            <InputField label="Maintenance" name="maintenancePct" value={inputs.maintenancePct} onChange={handleChange} min={0} max={5} step={0.25} suffix="%"
              tooltip="Annual repair and upkeep budget as a % of home purchase price (HVAC, roof, appliances, etc.). Divided by 12 and added to monthly costs. Does not scale with appreciation — only with the purchase price you paid." />
            <InputField label="Home Insurance" name="homeInsuranceMonthly" value={inputs.homeInsuranceMonthly} onChange={handleChange} min={0} step={10} prefix="$" suffix="/mo"
              tooltip="Monthly homeowners insurance premium. Added to monthly ownership costs. Note: standard policies exclude earthquakes — a separate earthquake policy in Berkeley typically adds $100–$300/mo depending on home value and construction type."
              researched={RESEARCHED.homeInsuranceMonthly} />
            <InputField label="PMI Rate" name="pmiRate" value={inputs.pmiRate} onChange={handleChange} min={0} max={2} step={0.1} suffix="%"
              tooltip="Private mortgage insurance as an annual % of original loan amount, charged monthly. Only applied in months where your remaining balance exceeds 80% of the current home value. Automatically drops off once you cross that threshold — no action required." />
          </section>

          <section>
            <h3>Renting</h3>
            <InputField label="Monthly Rent" name="monthlyRent" value={inputs.monthlyRent} onChange={handleChange} min={500} step={50} prefix="$"
              tooltip="Starting monthly rent. Added to the renter's annual costs and compounded each year by the rent escalation rate. Set this to match the type of unit you'd rent as an alternative to the home you're evaluating."
              researched={RESEARCHED.monthlyRent} />
            <InputField label="Annual Rent Increase" name="rentEscalationRate" value={inputs.rentEscalationRate} onChange={handleChange} min={0} max={15} step={0.5} suffix="%"
              tooltip="How much rent grows each year, compounded annually (year N rent = year N-1 × (1 + rate)). Berkeley has rent control (~3% cap) for pre-1980 buildings. Newer or newly-vacated units reset to market rate — use 3.5–4% for market-rate units."
              researched={RESEARCHED.rentEscalationRate} />
          </section>

          <section>
            <h3>Market Assumptions</h3>
            <InputField label="Home Appreciation" name="homeAppreciationRate" value={inputs.homeAppreciationRate} onChange={handleChange} min={-5} max={15} step={0.25} suffix="%"
              tooltip="Expected annual home value growth, compounded. Drives your future equity and sale proceeds. This is the single most sensitive input — small changes can flip the outcome by years. Use the Sensitivity tab to stress-test it."
              researched={RESEARCHED.homeAppreciationRate} />
            <InputField label="Investment Return" name="investmentReturnRate" value={inputs.investmentReturnRate} onChange={handleChange} min={0} max={20} step={0.25} suffix="%"
              tooltip="Annual return on the renter's portfolio, compounded monthly. The renter starts with the down payment + closing costs invested here. Any month where owning is more expensive than renting, the difference is added to the portfolio at this rate. Represents the opportunity cost of the down payment." />
          </section>

          <section>
            <h3>Personal / Tax</h3>
            <InputField label="Time Horizon" name="timeHorizonYears" value={inputs.timeHorizonYears} onChange={handleChange} min={1} max={40} step={1} suffix="yrs"
              tooltip="How many years to run the comparison. The break-even year is the first year within this window where buying's net worth exceeds renting's. Longer horizons generally favor buying because high upfront costs are amortized and equity compounds." />
            <InputField label="Renter Savings Rate" name="renterSavingsRate" value={inputs.renterSavingsRate} onChange={handleChange} min={0} max={100} step={5} suffix="%"
              tooltip="What fraction of the monthly cost difference (owning minus renting) the renter actually invests, when renting is cheaper. 100% assumes perfect discipline — every dollar saved goes into the portfolio. Lower values model spending some of the savings instead of investing them, which weakens the renting case." />
            <InputField label="Marginal Tax Rate" name="marginalTaxRate" value={inputs.marginalTaxRate} onChange={handleChange} min={0} max={50} step={1} suffix="%"
              tooltip="Your federal income tax bracket. When mortgage interest deduction is on, each month's interest × this rate is subtracted from ownership costs (your tax saving). Add ~9% for the CA state deduction benefit if you also itemize on your state return."
              researched={RESEARCHED.marginalTaxRate} />
            <Toggle label="Deduct Mortgage Interest" name="deductMortgageInterest" checked={inputs.deductMortgageInterest} onChange={handleChange}
              tooltip="Enable if you itemize federal deductions. Each month, interest paid × marginal rate is subtracted from ownership costs. Since the 2018 tax reform raised the standard deduction to ~$30k (2026), only ~10% of filers itemize — turn this off if you take the standard deduction." />
          </section>
        </aside>

        {/* Results Panel */}
        <main className="results-panel">
          <div className={`verdict ${buyingWins ? 'buy' : 'rent'}`}>
            <div className="verdict-label">{buyingWins ? 'Buying wins' : 'Renting wins'}</div>
            <div className="verdict-detail">{recommendation}</div>
          </div>

          <div className="metrics-grid">
            <div className="metric">
              <span className="metric-label">Upfront Cost</span>
              <span className="metric-value">{fmtDollar(summary.downPayment + summary.buyingClosingCosts)}</span>
              <span className="metric-sub">down + closing</span>
            </div>
            <div className="metric">
              <span className="metric-label">Monthly Payment</span>
              <span className="metric-value">{fmtDollar(summary.monthlyCarryingCost)}</span>
              <span className="metric-sub">P&amp;I + tax + insurance + HOA + PMI</span>
            </div>
            <div className="metric">
              <span className="metric-label">Break-Even Year</span>
              <span className="metric-value">{breakEvenYear ? `Year ${breakEvenYear}` : 'Never'}</span>
              <span className="metric-sub">within {inputs.timeHorizonYears}-yr horizon</span>
            </div>
            <div className="metric">
              <span className="metric-label">Net Worth Gap</span>
              <span className={`metric-value ${buyingWins ? 'positive' : 'negative'}`}>
                {fmtDollar(Math.abs(finalYear.netWorthDiff))}
              </span>
              <span className="metric-sub">{buyingWins ? 'buying ahead' : 'renting ahead'} at yr {inputs.timeHorizonYears}</span>
            </div>
          </div>

          <div className="tabs">
            {['overview', 'costs', 'sensitivity', 'table'].map((t) => (
              <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="tab-content">
              <h4>Net Worth Over Time</h4>
              <p className="chart-note">
                Buyer net worth = home equity − selling costs (what you'd walk away with if you sold). Renter net worth = invested portfolio (down payment + closing costs + monthly savings × savings rate).
                The gap at year 0 is the immediate entry cost the buyer must overcome: closing costs paid to buy + selling costs owed if sold immediately.
              </p>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={years} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="year" label={{ value: 'Year', position: 'insideBottom', offset: -2 }} tick={{ fill: '#aaa' }} />
                  <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} tick={{ fill: '#aaa' }} width={70} />
                  <Tooltip content={<CustomTooltip labelFormatter={(p) => `Year ${p.year}`} />} />
                  <Legend />
                  {breakEvenYear && (
                    <ReferenceLine x={breakEvenYear} stroke="#f0c040" strokeDasharray="4 4" label={{ value: 'Break-even', fill: '#f0c040', fontSize: 11 }} />
                  )}
                  <Line type="monotone" dataKey="buyerNetWorth" name="Buyer" stroke="#4f9cf0" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="renterNetWorth" name="Renter" stroke="#6dcf7f" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>

              <h4>Home Value vs. Mortgage Balance</h4>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={years} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="year" tick={{ fill: '#aaa' }} />
                  <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} tick={{ fill: '#aaa' }} width={70} />
                  <Tooltip content={<CustomTooltip labelFormatter={(p) => `Year ${p.year}`} />} />
                  <Legend />
                  <Line type="monotone" dataKey="homeValue" name="Home Value" stroke="#c084fc" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="mortgageBalance" name="Balance Owed" stroke="#f87171" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="equity" name="Equity" stroke="#4f9cf0" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === 'costs' && (
            <div className="tab-content">
              {(() => {
                const costYears = years.filter((y) => y.year > 0);
                const hasSavingsDiscount = inputs.renterSavingsRate < 100;
                return (
                  <>
                    <h4>Buyer: Annual Cost of Ownership Breakdown</h4>
                    <p className="chart-note">
                      Every ownership cost stacked by year: mortgage P&amp;I, property tax, maintenance, insurance, HOA, and PMI.
                      Maintenance is included here (a budgeted reserve) even though the headline "Monthly Payment" tile excludes it.
                    </p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={costYears} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="year" tick={{ fill: '#aaa' }} />
                        <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} tick={{ fill: '#aaa' }} width={70} />
                        <Tooltip
                          formatter={(v, name) => [fmtDollar(v), name]}
                          labelFormatter={(v) => `Year ${v}`}
                        />
                        <Legend />
                        <Bar dataKey="annualMortgage" name="Mortgage (P&I)" stackId="c" fill="#4f9cf0" />
                        <Bar dataKey="annualPropertyTax" name="Property Tax" stackId="c" fill="#f0c040" />
                        <Bar dataKey="annualMaintenance" name="Maintenance" stackId="c" fill="#c084fc" />
                        <Bar dataKey="annualInsurance" name="Insurance" stackId="c" fill="#6dcf7f" />
                        <Bar dataKey="annualHOA" name="HOA" stackId="c" fill="#f87171" />
                        <Bar dataKey="yearlyPMI" name="PMI" stackId="c" fill="#fb923c" />
                      </BarChart>
                    </ResponsiveContainer>

                    <h4>Renter: Surplus Invested vs. Unaccounted</h4>
                    <p className="chart-note">
                      Each year the renter spends less than the buyer, the surplus is split by the savings rate.
                      {hasSavingsDiscount
                        ? ` At ${inputs.renterSavingsRate}%, the unaccounted portion is assumed spent rather than invested — a real cost of the rental path.`
                        : ' At 100%, the full surplus is invested every month (perfect discipline assumed).'}
                    </p>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={costYears} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="year" tick={{ fill: '#aaa' }} />
                        <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} tick={{ fill: '#aaa' }} width={70} />
                        <Tooltip
                          formatter={(v, name) => [fmtDollar(v), name]}
                          labelFormatter={(v) => `Year ${v}`}
                        />
                        <Legend />
                        <Bar dataKey="annualSurplusInvested" name="Invested" stackId="a" fill="#6dcf7f" />
                        {hasSavingsDiscount && (
                          <Bar dataKey="annualSurplusUnaccounted" name="Unaccounted (spent)" stackId="a" fill="#f87171" />
                        )}
                      </BarChart>
                    </ResponsiveContainer>

                    <h4>Projected Monthly Rent Over Time</h4>
                    <p className="chart-note">
                      Monthly rent starting at {fmtDollar(inputs.monthlyRent)}, escalating {inputs.rentEscalationRate}%/yr.
                      By year {inputs.timeHorizonYears}, monthly rent reaches {fmtDollar(costYears[costYears.length - 1]?.monthlyRentThisYear)}.
                    </p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={costYears} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="year" tick={{ fill: '#aaa' }} />
                        <YAxis tickFormatter={(v) => '$' + v.toLocaleString()} tick={{ fill: '#aaa' }} width={80} />
                        <Tooltip
                          formatter={(v) => [fmtDollar(v), 'Monthly rent']}
                          labelFormatter={(v) => `Year ${v}`}
                        />
                        <Line type="monotone" dataKey="monthlyRentThisYear" name="Monthly rent" stroke="#c084fc" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>

                    <h4>Annual Interest vs. Principal</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={costYears} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="year" tick={{ fill: '#aaa' }} />
                        <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} tick={{ fill: '#aaa' }} width={70} />
                        <Tooltip content={<CustomTooltip labelFormatter={(p) => `Year ${p.year}`} />} />
                        <Legend />
                        <Bar dataKey="yearlyInterest" name="Interest" stackId="a" fill="#f87171" />
                        <Bar dataKey="yearlyPrincipal" name="Principal" stackId="a" fill="#4f9cf0" />
                        <Bar dataKey="yearlyTaxSaving" name="Tax Saving" fill="#6dcf7f" />
                      </BarChart>
                    </ResponsiveContainer>

                    <h4>Cumulative Cash Spent</h4>
                    <p className="chart-note">Buyer: down payment + closing costs + mortgage + taxes + insurance + maintenance. Renter: rent only.</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={years} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="year" tick={{ fill: '#aaa' }} />
                        <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} tick={{ fill: '#aaa' }} width={70} />
                        <Tooltip content={<CustomTooltip labelFormatter={(p) => `Year ${p.year}`} />} />
                        <Legend />
                        <Line type="monotone" dataKey="cumulativeBuyerCost" name="Buyer Total Spent" stroke="#f87171" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="cumulativeRenterCost" name="Renter Total Spent" stroke="#6dcf7f" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                );
              })()}
            </div>
          )}

          {activeTab === 'sensitivity' && (
            <div className="tab-content">
              <div className="sensitivity-controls">
                <label>Vary: </label>
                <select value={sensitivityParam} onChange={(e) => setSensitivityParam(e.target.value)}>
                  {SENSITIVITY_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <h4>Net Worth Difference at Year {inputs.timeHorizonYears}</h4>
              <p className="chart-note">Positive = buying wins. Negative = renting wins.</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sensitivityData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis
                    dataKey="value"
                    tickFormatter={(v) => v + sensitivityOpt.suffix}
                    tick={{ fill: '#aaa' }}
                  />
                  <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} tick={{ fill: '#aaa' }} width={70} />
                  <Tooltip
                    formatter={(v) => fmtDollar(v)}
                    labelFormatter={(v) => `${sensitivityOpt.label}: ${v}${sensitivityOpt.suffix}`}
                  />
                  <ReferenceLine y={0} stroke="#aaa" />
                  <Bar
                    dataKey="finalDiff"
                    name="Buy vs Rent advantage"
                    fill="#4f9cf0"
                    label={{ position: 'top', fill: '#aaa', fontSize: 10, formatter: (v) => (v >= 0 ? '+' : '') + Math.round(v / 1000) + 'k' }}
                  />
                </BarChart>
              </ResponsiveContainer>

              <table className="sensitivity-table">
                <thead>
                  <tr>
                    <th>{sensitivityOpt.label}</th>
                    <th>Break-Even Year</th>
                    <th>Net Worth Diff (yr {inputs.timeHorizonYears})</th>
                    <th>Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {sensitivityData.map((row) => (
                    <tr key={row.value} className={row.value === inputs[sensitivityParam] ? 'current-row' : ''}>
                      <td>{row.value}{sensitivityOpt.suffix}</td>
                      <td>{row.breakEvenYear ?? 'Never'}</td>
                      <td className={row.finalDiff >= 0 ? 'positive' : 'negative'}>{fmtDollar(row.finalDiff)}</td>
                      <td>{row.finalDiff >= 0 ? 'Buy' : 'Rent'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'table' && (
            <div className="tab-content">
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Home Value</th>
                      <th>Balance</th>
                      <th>Equity</th>
                      <th>Buyer NW</th>
                      <th>Renter NW</th>
                      <th>Diff</th>
                      <th>Interest</th>
                      <th>Tax Saving</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((y) => (
                      <tr key={y.year} className={y.year === breakEvenYear ? 'break-even-row' : ''}>
                        <td>{y.year}{y.year === breakEvenYear ? ' ★' : ''}</td>
                        <td>{fmtDollar(y.homeValue)}</td>
                        <td>{fmtDollar(y.mortgageBalance)}</td>
                        <td>{fmtDollar(y.equity)}</td>
                        <td>{fmtDollar(y.buyerNetWorth)}</td>
                        <td>{fmtDollar(y.renterNetWorth)}</td>
                        <td className={y.netWorthDiff >= 0 ? 'positive' : 'negative'}>{fmtDollar(y.netWorthDiff)}</td>
                        <td>{fmtDollar(y.yearlyInterest)}</td>
                        <td className="positive">{fmtDollar(y.yearlyTaxSaving)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
