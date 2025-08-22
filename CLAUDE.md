# SpendLite - Expense Tracking Application

Angular 20 personal expense tracker with bank statement import, auto-categorization, and analytics.

## Quick Start
```bash
npm start          # Development server (http://localhost:4200)
npm run build      # Production build
npm test           # Run tests
```

When you run tests, use --no-watch flag

## Architecture

### Core Structure
- `/src/app/core/` - Business logic, models, services
- `/src/app/features/` - UI components by feature
- Database: Dexie (IndexedDB) for offline-first storage

### Key Features
1. **Bank Import** - CSV/Excel parsing for HDFC & SBI
2. **Auto-Categorization** - Smart merchant detection with learning rules
3. **Analytics** - Financial insights with category breakdowns
4. **Data Persistence** - Browser storage with backup/restore

## Bank Support

### Currently Supported
- **HDFC Bank** - CSV format
- **SBI** - Excel/CSV format

### Coming Soon
- ICICI, Axis, Kotak Mahindra

## Main Routes
- `/upload` - Import bank statements
- `/imports` - View import history
- `/imports/:id` - Transaction details & categorization
- `/accounts` - Manage bank accounts
- `/categories` - Category management
- `/analytics` - Financial analytics dashboard

## Key Services

### ImportService
- Tracks import history and metadata
- Manages file processing statistics
- Cascading delete for data cleanup

### TransactionService
- Fingerprint-based duplicate detection
- CRUD operations with data integrity
- Account linking for transfers

### CategorizationService
Multi-layer intelligent categorization:
1. User rules (highest priority)
2. Bank-specific hints
3. Recurring pattern detection
4. System-learned rules
5. Special patterns (EMI, cashback)
6. Default merchant mappings
7. Keyword search fallback

### BackupService
- Manual backup/restore to JSON
- Auto-backup to localStorage
- Persistent storage API integration
- Storage quota monitoring

## Analytics Features
- **KPIs**: Income, expenses, investments tracking
- **Category Breakdown**: Visual spending analysis
- **Monthly Trends**: Financial patterns over time
- **Transaction Details**: Drill-down into categories
- **Uncategorized Tracking**: Identifies unmapped transactions

## Data Persistence & Backup

### Persistent Storage
- Automatic request on user interaction
- Browser-level data protection
- Storage quota monitoring with warnings

### Backup Options
1. **Manual Export**: Download as JSON file
2. **Auto-Backup**: Scheduled localStorage saves
3. **Quick Restore**: Upload JSON to restore data

### Storage Indicators
- Real-time usage percentage
- Visual warnings at 70% and 90%
- One-click backup/restore interface

## Database Schema

### Tables
- `accounts` - Bank account records
- `imports` - Import session metadata
- `transactions` - Transaction records with fingerprints
- `subCategories` - Category definitions
- `categoryRules` - Auto-categorization patterns

### Indexes
- `[accountId+fingerprint]` - Duplicate detection
- `[accountId+date]` - Date range queries
- Individual indexes on key fields

## Transaction Processing

### Duplicate Detection
- Unique fingerprint generation per transaction
- Account-specific duplicate checking
- Original transaction linking

### Bank Adapters
Specialized parsers for each bank:
- Extract merchant names consistently
- Provide category hints
- Handle bank-specific formats

## Development Notes
- Angular 20 with signals for state management
- TypeScript strict mode enabled
- SCSS component styling
- SSR enabled for performance
- Uses zsh shell (user preference)
