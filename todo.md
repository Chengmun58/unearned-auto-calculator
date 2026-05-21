# Unearned Auto Calculator - TODO

## Core Features

- [x] Database schema: upload_sessions and calculation_rows tables
- [x] Backend tRPC routes: processFiles, listSessions, getSession, updateRow, deleteSession
- [x] CSV parsing and matching logic (Aoikumo vs Sequoia)
- [x] Status classification: A (Sequoia zero, Aoikumo open), B (match), C (mismatch), D (not found)
- [x] Auto-exclude Status A records by default
- [x] KPI banner: Total Records, Total Exposure, Excluded, After Exclusion, Final Remaining
- [x] Status breakdown cards (A/B/C/D)
- [x] Detail table with Exclude/Settle checkboxes (real-time update + DB persist)
- [x] History tab: list all sessions with summary info
- [x] Export CSV functionality
- [x] Delete session functionality
- [x] TypeScript error fix in csvParser.ts

## Pending / Future Enhancements

- [ ] Settle % input per row (currently defaults to 100%)
- [ ] Bulk exclude/settle by status
- [ ] Session comparison view
