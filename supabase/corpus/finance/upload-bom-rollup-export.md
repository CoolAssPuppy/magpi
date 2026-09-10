Export from: fold-s1-cost-model-v11.xlsx
Sheet: BOM_rollup_quoted
Exported: 2026-09-05 17:42
Exported by: John Mbeki
Basis: pilot line volumes, first 50,000 units. Landed cost per finished device.

Header notes carried over from the sheet:
- Columns G and H held formulas and exported as values.
- Currency USD. Quotes in KRW and CNY converted at the 1 September rate.
- Tooling amortisation is NOT in this sheet. See OPS-43.
- Rows marked (est) have no quote behind them.

| Ref | Line | Vendor | Quote ref | Quote date | Lead time | Cost per unit |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Display stack, four panels | Display module vendor | DMV-2026-118 | 2026-08-14 | 10 weeks | 440.00 |
| 2 | Hinge assembly, three hinges | Hinge supplier | HS-Q-4471 | 2026-08-26 | 8 weeks | 156.00 |
| 3 | SoC and memory | Contract | contract, sched B | 2026-06-11 | 12 weeks | 168.00 |
| 4 | Outer layer, Meniscus-C with hard coat | Suwon Advanced Films | SAF-Q-26-2288 | 2026-08-31 | 6 weeks | 56.00 |
| 5 | Lamination scrap allowance, 4 pct (est) | n/a | n/a | n/a | n/a | 19.00 |
| 6 | Camera modules | Camera vendor | CAM-26-Q9 | 2026-07-02 | 9 weeks | 76.00 |
| 7 | Shell and frame | Shenzhen pilot line | PL-BOM-07 | 2026-08-26 | with build | 62.00 |
| 8 | Battery cell and charging | Cell vendor | CV-Q-2026-51 | 2026-07-02 | 8 weeks | 48.00 |
| 9 | Antenna and RF | Shenzhen pilot line | PL-BOM-07 | 2026-08-04 | with build | 21.00 |
| 10 | Assembly labour, pilot line rate | Shenzhen pilot line | PL-RATE-3 | 2026-08-20 | n/a | 58.00 |
| 11 | Test time | Shenzhen pilot line | PL-RATE-3 | 2026-08-20 | n/a | 15.00 |
| 12 | Warranty reserve, 2 pct return (est) | n/a | n/a | n/a | n/a | 11.00 |
| 13 | Freight, September rate | Freight forwarder | FF-SEP-26 | 2026-09-01 | n/a | 10.00 |
| | **TOTAL, unit cost at pilot volume** | | | | | **1,140.00** |

Second sheet, version history:

| Version | Date | Unit cost | Change |
| --- | --- | --- | --- |
| placeholder | 2026-04 | 1,050.00 | April placeholder, no quotes |
| v7 | 2026-08-19 | 1,072.00 | First closed BOM at pilot volume |
| v8 | 2026-08-21 | 1,118.00 | Assembly labour to pilot rate, 2.6x |
| v9 | 2026-08-28 | 1,118.00 | Placeholder rows for the material change |
| v10 | 2026-09-02 | 1,140.00 | Polymer, 4 pct scrap allowance, September freight |
| v11 | 2026-09-05 | 1,140.00 | Quote references added, no cost change |

Third sheet, sensitivity, exported as values:

| Scenario | Unit cost | Delta | Gross margin at $1,899 |
| --- | --- | --- | --- |
| Base, pilot volume, lamination yield 96 pct | 1,140.00 | 0.00 | 40.0 pct |
| Lamination yield 98 pct | 1,130.50 | -9.50 | 40.5 pct |
| Lamination yield 92 pct | 1,159.00 | +19.00 | 39.0 pct |
| Lamination yield 88 pct | 1,178.00 | +38.00 | 38.0 pct |
| Lamination yield 80 pct | 1,216.00 | +76.00 | 36.0 pct |
| Volume assembly rate instead of pilot | 1,104.00 | -36.00 | 41.9 pct |
| Display stack 10 pct cheaper | 1,096.00 | -44.00 | 42.3 pct |
| Hinge assembly 10 pct dearer | 1,155.60 | +15.60 | 39.1 pct |
| One lamination fixture amortised | 1,142.14 | +2.14 | 39.9 pct |
| Two lamination fixtures amortised | 1,144.28 | +4.28 | 39.7 pct |
| Price at 1,799 instead of 1,899 | 1,140.00 | 0.00 | 36.6 pct |

Cell B2 comment on the third sheet, carried through the export:
"Yield is the only row on this sheet that can move the price. Everything else is
a rounding argument. JM 2026-09-05"

Cell A1 comment on the first sheet, carried through the export:
"Do not send this workbook outside Finance. The number at the bottom of it sets
the price and the price is not public yet. JM"
