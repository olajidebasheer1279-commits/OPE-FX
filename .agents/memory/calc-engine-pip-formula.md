---
name: Calc Engine pip value formula
description: How pip values are computed per instrument type in lib/calc-engine, and why the old PnL formula was wrong.
---

## The Rule
`PnL = priceDiff × directionSign × contractSize × lotSize`

The old server code used `priceDiff × lotSize` — missing `contractSize` entirely.

## Contract sizes by market
- **Forex USD-quoted** (EUR/USD, GBP/USD, AUD/USD): contractSize=100,000, pipSize=0.0001, pipValue=$10/lot
- **Forex USD-base** (USD/JPY, USD/CHF): divide by entryPrice: `100,000 × 0.01 / price` ≈ $6-9/lot
- **Forex JPY cross** (EUR/JPY): approximate $8/lot
- **XAUUSD**: contractSize=100oz, pipSize=$0.01, pipValue=$1/pip/lot (so $1 gold move = $100/lot)
- **XAGUSD**: contractSize=5000oz, pipSize=$0.001, pipValue=$5/pip/lot
- **Indices** (US30, NAS100, SPX500): contractSize=1, pipSize=1 or 0.1, pipValue=$1/point/lot
- **Synthetic Indices** (V75, Crash, Boom, Jump): fixed approximate pip values from SYNTHETIC_SPECS map

## Why
The Forex market makes this non-obvious: price shows as 1.08765 but each pip (0.0001) on 1 lot
moves P&L by $10 because 1 lot = 100,000 units of base currency.

## Where it lives
`lib/calc-engine/src/instruments.ts` — InstrumentSpec + getInstrumentSpec() + getPipValuePerLot()
`lib/calc-engine/src/calculator.ts` — computeTradeCalc() — all metric computation
