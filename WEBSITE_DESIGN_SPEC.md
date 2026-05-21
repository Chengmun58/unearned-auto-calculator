# Unearned Auto Calculator — Website Design Spec

## User Flow

1. **Landing**: User sees a clean upload interface with drag-and-drop area for CSV files.
2. **Upload**: User selects or drags Aoikumo CSV and Sequoia CSV files.
3. **Processing**: System reads files, matches records by customer ref, classifies by status, calculates exposure.
4. **Results**: User sees KPI banner (Current Exposure, After Exclusion, After Settlement, Final Remaining), status summary table, customer summary table, and can download results as CSV or Excel.
5. **Refinement** (optional): User can edit exclusion/settlement flags and re-calculate.

## Design Philosophy

**Minimalist Professional**: Clean, data-focused interface with emphasis on clarity and speed. No unnecessary decoration. Focus on the task: upload → calculate → review → export.

**Color Palette**:
- Primary: Deep Blue (`#1F4E79`)
- Accent: Light Blue (`#D6E3F0`)
- Success: Green (`#2E7D32`)
- Warning: Orange (`#F57C00`)
- Neutral: Gray (`#666666`)
- Background: White (`#FFFFFF`)

**Typography**:
- Headings: Georgia (serif) for authority
- Body: Calibri / System Sans for readability
- Data: Monospace for numbers

**Layout**:
- Single-column on mobile, two-column on desktop
- Ample whitespace
- Frozen headers for tables
- Sticky KPI banner at top

## Key Sections

1. **Upload Zone**: Drag-and-drop or file picker for CSV files
2. **KPI Banner**: 5 key metrics (Current, Excluded, After Exclusion, Settlement, Final Remaining)
3. **Status Summary**: Table showing breakdown by candidate status
4. **Customer Summary**: Table showing breakdown by customer (sortable, filterable)
5. **Action Panel**: Buttons to download CSV, download Excel, reset, or refine flags
