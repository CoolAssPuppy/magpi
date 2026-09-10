Export from: fold-s1-cost-model-v11.xlsx
Sheet: BOM_rollup_pilot
Exported: 2026-09-05 17:42
Exported by: John Mbeki
Basis: pilot volume, first 100,000 units, landed cost per finished device

Notes carried over from the sheet header:
- Column F held formulas in the workbook and exported as values.
- Currency USD. Quotes in KRW and CNY converted at the 1 September rate.
- Tooling amortisation is NOT in this sheet. See the OPS-43 model.
- Rows marked (est) are not quoted. Everything else has a quote behind it.

| Ref | Line | Part | Qty | Unit $ | Extended $ | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1 | Inner display module, folding | DSP-F-61 | 3 | 106.00 | 318.00 | quote, 2026-08-14 |
| 1.2 | Outer display module, non-folding | DSP-O-58 | 1 | 48.00 | 48.00 | quote, 2026-08-14 |
| 1.3 | Meniscus-C cover film | MC-62A | 1 | 21.00 | 21.00 | quote, 2026-08-31 |
| 1.4 | Hard coat and AR processing, panel 1 | SVC-AR-02 | 1 | 17.00 | 17.00 | quote, 2026-08-31 |
| 1.5 | Touch layer and flex bond | TCH-44 | 4 | 14.50 | 58.00 | quote, 2026-07-30 |
| | **Panels subtotal** | | | | **462.00** | |
| 2.1 | H1 hinge assembly, outer | BLW-H1-C | 1 | 61.00 | 61.00 | quote, 2026-08-26 |
| 2.2 | H2 hinge assembly, centre | BLW-H2-C | 1 | 37.00 | 37.00 | quote, 2026-08-26 |
| 2.3 | H3 hinge assembly, inner | BLW-H3-C | 1 | 37.00 | 37.00 | quote, 2026-08-26 |
| 2.4 | Hinge cover, two piece | BLW-CV-2 | 2 | 6.00 | 12.00 | quote, 2026-08-26 |
| 2.5 | Graphite bridge, 60 micron | THM-GB-60 | 1 | 11.00 | 11.00 | quote, 2026-09-01 |
| | **Bellows subtotal** | | | | **158.00** | |
| 3.1 | SoC and memory | SOC-8G-256 | 1 | 178.00 | 178.00 | quote, 2026-06-11 |
| 3.2 | Cell pack, two cells | BAT-2C-44 | 1 | 47.00 | 47.00 | quote, 2026-07-02 |
| 3.3 | Camera modules | CAM-SET-3 | 1 | 53.00 | 53.00 | quote, 2026-07-02 |
| 3.4 | Chassis, magnesium frame, panel backs | MEC-CH-C | 1 | 68.00 | 68.00 | quote, 2026-08-26 |
| 3.5 | Main board, PMIC, RF front end, antennas | PCB-MB-C | 1 | 44.00 | 44.00 | quote, 2026-08-04 |
| 3.6 | Vapour chamber, one per half | THM-VC-2 | 2 | 7.00 | 14.00 | quote, 2026-09-01 |
| 3.7 | Speakers, haptics, microphones, sensors | MSC-SET | 1 | 13.00 | 13.00 | quote, 2026-07-02 |
| | **Components subtotal** | | | | **417.00** | |
| 4.1 | Assembly labour, pilot line rate | LAB-PILOT | 1 | 31.00 | 31.00 | Dana, 2026-08-20 |
| 4.2 | Test and calibration time | LAB-TEST | 1 | 9.00 | 9.00 | Dana, 2026-08-20 |
| 4.3 | Scrap allowance, lamination, 4 pct (est) | SCR-LAM | 1 | 8.00 | 8.00 | (est) |
| | **Conversion subtotal** | | | | **48.00** | |
| 5.1 | Warranty reserve, 2 pct return rate (est) | WAR-RES | 1 | 8.00 | 8.00 | (est) |
| 5.2 | Freight, air, September rate | FRT-AIR-09 | 1 | 47.00 | 47.00 | quote, 2026-09-01 |
| | **Other subtotal** | | | | **55.00** | |
| | **UNIT COST, PILOT VOLUME** | | | | **1,140.00** | |

Version history, from the workbook's second sheet:

| Version | Date | Unit cost | Change |
| --- | --- | --- | --- |
| v7 | 2026-08-19 | 1,072.00 | First closed BOM at pilot volume |
| v8 | 2026-08-21 | 1,118.00 | Assembly labour to pilot rate, 2.6x |
| v9 | 2026-08-28 | 1,118.00 | Placeholder rows for the material change |
| v10 | 2026-09-02 | 1,140.00 | Polymer quote, 4 pct scrap, air freight |
| v11 | 2026-09-05 | 1,140.00 | Part numbers added, no cost change |

Sensitivity block, exported as values:

| Scenario | Unit cost | Delta |
| --- | --- | --- |
| Base, pilot volume | 1,140.00 | 0.00 |
| Sea freight instead of air | 1,107.00 | -33.00 |
| Lamination yield 95 pct | 1,137.00 | -3.00 |
| Lamination yield 80 pct | 1,154.00 | +14.00 |
| Volume assembly rate, not pilot | 1,121.00 | -19.00 |
| One lamination fixture amortised | 1,142.14 | +2.14 |
| Two lamination fixtures amortised | 1,144.28 | +4.28 |

Cell J14 comment, carried through the export:
"Do not send this sheet outside Finance. The number at the bottom of it decides
the price and the price is not public. JM"
