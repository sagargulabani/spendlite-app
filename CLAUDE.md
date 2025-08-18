# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SpendLite is an Angular 20 personal expense tracking application that allows users to import bank transactions from multiple sources (HDFC, SBI) and categorize them. The app uses Dexie (IndexedDB) for client-side data storage and supports CSV/Excel file imports.

## Development Commands

- **Start development server**: `npm start` or `ng serve` (runs on http://localhost:4200)
- **Build for production**: `npm run build` or `ng build`
- **Run tests**: `npm test` or `ng test`
- **Build and watch**: `npm run watch` (development build with file watching)
- **Deploy to server**: `npm run copytoserver` (builds and copies to remote server)

## Architecture Overview

### Core Structure
- **Core Domain**: `/src/app/core/` contains business logic, models, and services
- **Feature Modules**: `/src/app/features/` contains UI components organized by feature
- **Database**: Uses Dexie (IndexedDB wrapper) for client-side persistence

### Key Models (src/app/core/models/)
- **Account**: Bank account information with support for multiple banks
- **Transaction**: Individual transaction records with deduplication via fingerprinting
- **ImportRecord**: Tracks file import sessions with metadata and statistics
- **Categories**: Subcategories and rules for transaction categorization

### Bank Integration (src/app/core/)
- **Adapters**: Bank-specific data processing (`hdfc.adapter.ts`, `sbi.adapter.ts`)
- **Parsers**: File format parsers (`hdfc-csv.parser.ts`, `sbi-excel.parser.ts`)
- **Parser Factory**: Routes files to appropriate parsers based on bank and format

### Services
- **AccountService**: Manages bank accounts
- **TransactionService**: Handles transaction CRUD with deduplication
- **ImportService**: Orchestrates file imports and processing
- **CategorizationService**: Manages transaction categorization rules

### Features
- **upload**: File upload interface for bank statements
- **accounts-list**: Account management interface
- **import-list**: Import history and status tracking
- **import-detail**: Detailed view of specific imports
- **category-management**: Category and rule management

## Database Schema

The app uses Dexie v3 with the following stores:
- `accounts`: Bank account records
- `imports`: Import session metadata
- `transactions`: Transaction records with fingerprint-based deduplication
- `subCategories`: Category definitions
- `categoryRules`: Automatic categorization rules

## Routing

Main routes are defined in `app.routes.ts`:
- `/upload` (default): File upload interface
- `/accounts`: Account management
- `/imports`: Import history
- `/imports/:id`: Import details
- `/categories`: Category management

## File Processing

The application supports:
- **HDFC Bank**: CSV format parsing
- **SBI Bank**: Excel format parsing
- **Duplicate Detection**: Transaction fingerprinting to prevent duplicates
- **Multi-account Support**: Each import is linked to a specific account

## Development Notes

- Uses Angular 20 with strict TypeScript configuration
- SCSS for styling with component-level stylesheets
- Server-side rendering (SSR) enabled
- Karma/Jasmine for unit testing
- Uses zsh shell (configured in user preferences)


# ImportService

This Angular service (ImportService) manages the import history and metadata for financial transaction imports in your application. Here's what it does:
Core Functionality
The service handles recording and managing import operations when users upload bank statements or transaction files (CSV, TXT, or Excel formats). It tracks detailed metadata about each import operation and provides various methods to query and manage this import history.
Key Features
Import Record Creation
The main method createImportRecord() saves metadata about each file import including:

Which account the transactions belong to
File details (name, size, format)
Import statistics (total rows, successful imports, errors, duplicates)
Transaction breakdown (debits vs credits count)
Timestamp of when the import occurred

Import Management

Update Operations: Allows renaming imports (updateImportDisplayName) and reassigning them to different accounts (updateImportAccount)
Deletion: Provides cascading delete that removes both the import record and all associated transactions (deleteImport)

Query Methods
The service offers multiple ways to retrieve import history:

By specific account (getImportsByAccount)
All imports sorted by date (getAllImports)
Recent imports with customizable limit (getRecentImports)
Import with associated account name (getImportWithAccount)

Statistics
The getImportStats() method aggregates data across imports to provide:

Total number of imports
Total transaction count across all imports
Date of the most recent import

Database Integration
The service uses Dexie (IndexedDB wrapper) to persist import records locally in the browser. It performs transactional operations to ensure data consistency, especially during deletions where both import records and related transactions need to be removed atomically.
Use Case
This service is essential for maintaining an audit trail of all data imports, allowing users to:

Track what files have been imported and when
See success/error rates for each import
Manage and clean up old imports
Understand the source of transactions in their accounts

It acts as a historical record keeper for all import operations, making the application's data management transparent and traceable.


## Database

This file defines the **database schema and models** for your financial tracking application using **Dexie.js** (a wrapper for IndexedDB). It's the foundation of your app's data persistence layer, storing everything locally in the browser.

## Database Models

### 1. **Account Model**
Represents bank accounts users can track:
- **Core fields**: name, bank name, account type (savings/current/credit)
- **Privacy**: Only stores last 4 digits of account numbers
- **Status tracking**: `isActive` flag and timestamps for created/updated dates

### 2. **ImportRecord Model**
Tracks metadata for each file import operation:
- **File info**: name, size, format (CSV/TXT/Excel)
- **Import stats**: total rows, success/error/duplicate counts, debit/credit breakdown
- **Status tracking**: Processing state (pending/processing/completed/failed)
- **Relationships**: Links to account via `accountId`

### 3. **Transaction Model**
The core financial transaction data:
- **Basic info**: date, narration (description), amount
- **Bank-specific**: Reference numbers, bank name
- **Original bank fields**: Value date, withdrawal/deposit amounts, closing balance (preserved for fingerprinting)
- **Deduplication system**:
  - `fingerprint`: Unique hash to detect duplicate transactions
  - `isDuplicate`: Boolean flag
  - `originalTransactionId`: Links to the original if it's a duplicate
- **Organization**: Categories, tags, reconciliation status
- **Relationships**: Links to both account and import record

### 4. **Category Models**
- **SubCategory**: For organizing transactions into categories
- **CategoryRule**: Rules for auto-categorizing transactions based on merchant patterns

## Database Schema (SpendLiteDB)

The database class defines:

### Table Structure
Each table has indexed fields for efficient querying:
- `++id`: Auto-incrementing primary key
- Single field indexes: `name`, `bankName`, `fingerprint`, etc.
- **Compound indexes**: 
  - `[accountId+fingerprint]`: Fast duplicate detection within accounts
  - `[accountId+date]`: Quick date-range queries per account

### Schema Version
Currently at version 3, showing the database has evolved (likely added fingerprinting in v2, and additional indexes in v3).

## Key Features

### Duplicate Detection System
The fingerprint mechanism prevents importing the same transaction multiple times:
- Each transaction gets a unique hash (fingerprint)
- System can detect exact duplicates and mark them
- Maintains reference to original transaction

### Data Relationships
- **One-to-many**: Account → Imports → Transactions
- **Categorization**: Transactions can be tagged and categorized
- **Rules engine**: Auto-categorization based on merchant patterns

### Privacy & Security
- Minimal sensitive data storage (only last 4 digits of accounts)
- All data stored locally in browser (no server transmission)

## Usage

The exported `db` instance is used throughout the app to:
- Store user's financial data persistently
- Query transactions efficiently with indexed searches
- Maintain data integrity with proper relationships
- Prevent duplicate imports through fingerprinting

This is essentially your app's local database engine, providing offline-first functionality with sophisticated duplicate detection and data organization capabilities.

# CSV Upload component

This Angular component (`CsvUploadComponent`) handles the **file upload and parsing workflow** for importing bank statements into your application. It's a smart upload interface that adapts to the selected bank account.

## Core Workflow

The component manages a two-step process:
1. **Upload Step**: User selects/drags a file, which gets parsed
2. **Review Step**: User reviews parsed transactions before confirming import

## Key Features

### 1. **Dynamic File Type Acceptance**
The component intelligently accepts only the file types supported by the selected bank:
```typescript
acceptedFileTypes = computed(() => {
  // Returns '.csv', '.xlsx', etc. based on selected bank
})
```
For example, if HDFC is selected, it might only accept `.csv` files, while ICICI might accept both `.csv` and `.xlsx`.

### 2. **Bank-Aware Parsing**
Maps account bank names to parser IDs:
- "HDFC Bank" → "HDFC" parser
- "State Bank of India" → "SBI" parser
- Uses the `ParserFactoryService` to get the correct parser for each bank

### 3. **Drag & Drop Upload**
Supports both:
- Traditional file selection via input
- Drag and drop interface with visual feedback (`isDragging` signal)

### 4. **Real-time Progress Tracking**
During parsing, displays:
- Progress updates via `ParseProgress`
- Row counts as they're processed
- Error tracking

### 5. **Transaction Statistics**
Automatically calculates:
- Total transactions parsed
- Debit count (negative amounts)
- Credit count (positive amounts)
- Error count and skipped rows
- Preview of first 10 transactions

## State Management

Uses Angular signals for reactive state:

### UI States
- `isDragging`: Drag hover state
- `isParsing`: Loading state during parse
- `currentStep`: Workflow step ('upload' or 'review')

### Data States
- `rows`: Parsed transactions
- `reviewData`: Prepared data for review component
- `error`: Error messages
- `currentFile`: Currently selected file

## Error Handling

Provides intelligent error messages:
- **No account selected**: Prompts to select account first
- **No parser available**: Informs if bank isn't supported
- **Invalid file format**: Detects when file doesn't match expected bank format
- **Parse errors**: Shows specific validation errors

## Integration Points

### With AccountService
- Reads selected account
- Determines which bank parser to use
- Links transactions to correct account

### With ParserFactoryService
- Gets appropriate parser based on bank
- Handles actual parsing logic
- Provides progress callbacks

### With ImportReviewComponent
- Passes parsed data for review
- Handles confirmation/cancellation
- Routes to imports page on success

## Smart Validation

The component ensures:
1. Account is selected before upload
2. File matches the expected bank format
3. Parser exists for the selected bank
4. File is valid for that specific bank's format

## User Experience Features

- **Visual feedback**: Shows parsing progress
- **Preview capability**: Displays first 10 transactions
- **Format hints**: Shows expected file formats for selected bank
- **Graceful errors**: User-friendly error messages
- **Reset capability**: Can start over at any point

## Example Flow

1. User selects "HDFC Savings Account"
2. Component updates to accept only HDFC-compatible files
3. User drags a CSV file onto the drop zone
4. Component uses HDFC parser to process the file
5. Shows progress while parsing
6. Displays transaction preview and stats
7. Moves to review step for confirmation
8. On confirm, saves to database and navigates to imports page

This component essentially acts as the **intelligent gateway** for getting financial data into your app, ensuring the right parser processes the right files for the right accounts.


# csv parser service

This service (`CsvParserService`) is a **specialized CSV parser for HDFC bank statements**. It's designed to handle the specific format and quirks of HDFC's exported transaction files.

## Core Purpose

Parses HDFC bank CSV files and converts them into structured transaction objects that your app can work with. It handles the messy reality of bank-exported CSV files with intelligent parsing and error handling.

## Key Components

### 1. **ExtendedParsedTransaction Interface**
Extends the basic transaction with HDFC-specific fields:
- `valueDate`: Settlement date (different from transaction date)
- `withdrawalAmt`: Original debit amount
- `depositAmt`: Original credit amount  
- `closingBalance`: Account balance after transaction

These extra fields are preserved for **fingerprinting** (duplicate detection).

### 2. **CSV Parsing with Papa Parse**
Uses the Papa Parse library with specific settings:
- `header: true`: Treats first row as headers
- `skipEmptyLines`: Ignores blank rows
- `dynamicTyping`: Auto-converts numbers
- `worker: true`: Runs in web worker for performance
- `step`: Processes row-by-row for memory efficiency

## Parsing Workflow

### Step 1: Header Validation
```typescript
validateHdfcHeaders(headers)
```
- Uses **pattern matching** instead of exact header names
- Looks for keywords like "date", "narration", "withdrawal/debit", "deposit/credit"
- Requires at least 3 out of 4 essential headers
- **Why flexible?** Banks often change header formatting slightly

### Step 2: Row Processing
```typescript
parseHdfcRow(row)
```
Smart normalization process:

1. **Header normalization**: 
   - Removes periods (`.`)
   - Collapses multiple spaces
   - Converts to lowercase
   - Handles variations like "Withdrawal Amt." vs "Debit Amount"

2. **Field extraction with fallbacks**:
   ```typescript
   norm['withdrawal amt'] ?? norm['debit amount']  // Tries multiple possible names
   ```

3. **Amount calculation**:
   - Combines debit/credit into single signed amount
   - Negative for debits, positive for credits

### Step 3: Data Cleaning

#### Date Parsing (`toIso` method)
- Handles DD/MM/YY and DD/MM/YYYY formats
- Smart 2-digit year conversion (50+ → 1900s, <50 → 2000s)
- Validates date components
- Returns ISO format (YYYY-MM-DD)

#### Number Parsing (`num` method)
- Removes commas (thousand separators)
- Handles empty/zero values
- Cleans whitespace
- Safe conversion with NaN checks

## Error Handling

### Custom Error Class
```typescript
CsvParseError
```
Specific error type for CSV parsing issues, making debugging easier.

### Validation Points
1. **File level**: Rejects if no valid headers found
2. **Row level**: Skips invalid rows, counts errors
3. **Result level**: Fails if no valid transactions found

## Real-World Considerations

### Why This Flexibility Matters

1. **Bank inconsistencies**: HDFC might export slightly different formats for different account types or over time

2. **Header variations**: 
   - "Withdrawal Amt." vs "Debit Amount"
   - "Value Date" vs "ValueDate"
   - With/without periods, different spacing

3. **Data quality issues**:
   - Extra spaces in narrations
   - Inconsistent date formats
   - Comma-separated numbers

### Performance Optimizations

- **Web Worker**: Parsing runs in background thread
- **Streaming**: Processes row-by-row instead of loading entire file
- **Early validation**: Checks headers before processing all rows

## Output Format

Returns structured data ready for the app:
```typescript
{
  rows: ExtendedParsedTransaction[],  // Parsed transactions
  errors: number                       // Count of failed rows
}
```

Each transaction includes:
- Core fields (date, narration, amount)
- Source identifier ("HDFC-CSV")
- Original HDFC fields for duplicate detection

## Integration with Duplicate Detection

The preserved original fields (`withdrawalAmt`, `depositAmt`, `closingBalance`) are crucial for:
- Generating unique fingerprints
- Detecting duplicate imports
- Maintaining data integrity

## Example Usage Flow

1. User uploads HDFC CSV file
2. Parser validates it has HDFC-like headers
3. Processes each row, normalizing messy data
4. Converts dates to ISO format
5. Combines debit/credit into signed amounts
6. Returns clean, structured transactions
7. Preserves original values for deduplication

This service essentially acts as a **translator** between HDFC's CSV format and your app's data model, handling all the edge cases and inconsistencies that real-world bank data presents.


## Bank Parser

This file defines the **abstract base class and interfaces** for creating bank-specific parsers in your application. It's the foundation that ensures all bank parsers work consistently while handling their unique formats.

## Core Architecture

### 1. **Data Models**

#### UnifiedTransaction Interface
The standardized format all bank transactions must conform to:
```typescript
{
  // Required fields
  date: string;        // ISO format (YYYY-MM-DD)
  description: string; // Transaction details
  amount: number;      // Negative=debit, Positive=credit
  
  // Optional common fields
  balance?: number;    // Running balance
  referenceNo?: string;
  
  // Metadata
  source: string;      // e.g., 'HDFC-CSV'
  bankName: string;    // e.g., 'HDFC'
  
  // For deduplication
  originalData: Record<string, any>; // Preserves all original fields
}
```

#### BankStatementMetadata
Captures document-level information:
- Account number/holder
- Statement period
- Bank branch
- Extraction timestamp

#### ParseResult
What every parser must return:
- Array of unified transactions
- Metadata about the statement
- Error/skip counts for reporting

#### ParseProgress
Real-time parsing feedback:
- Current stage (detecting → reading → parsing → validating → complete)
- Rows processed count
- Transactions found
- Status message

### 2. **Abstract BankParser Class**

This is the **template** all bank parsers must follow:

#### Abstract Properties
```typescript
abstract bankId: string;          // 'HDFC', 'SBI', etc.
abstract bankName: string;         // Display name
abstract supportedFormats: string[]; // ['.csv', '.xlsx']
```

#### Abstract Methods (Must Implement)
- `canParse(file)`: Detects if file matches this bank's format
- `parse(file)`: Main parsing logic
- `generateFingerprint()`: Creates unique ID for duplicate detection

## Utility Methods (Inherited by All Parsers)

### 1. **Date Handling**

#### Excel Serial Date Conversion
```typescript
excelSerialToDate(serial: number)
```
- Handles Excel's date system (days since Dec 30, 1899)
- Accounts for Excel's 1900 leap year bug
- Converts serial numbers (like 44562) to actual dates

#### Universal Date Parser
```typescript
parseDate(dateStr: string | number)
```
Handles multiple formats:
- Excel serial numbers (44562)
- DD/MM/YYYY or DD/MM/YY
- DD-MMM-YY (01-Apr-24)
- DD MMM YYYY (21 Apr 2024)
- YYYY-MM-DD (already ISO)

Smart features:
- 2-digit year conversion (50+ → 1900s, <50 → 2000s)
- Month name recognition (Jan, Feb, Mar...)
- Multiple delimiter support (/, -, space)

### 2. **Amount Parsing**
```typescript
parseAmount(value: any)
```
Cleans financial values:
- Removes commas (1,234.56 → 1234.56)
- Strips currency symbols (₹, $)
- Handles empty/zero values
- Safe NaN checking

### 3. **Data Validation**

#### Date Validation
```typescript
isValidDate(dateStr: string | number)
```
Pattern matching for various formats:
- Excel serial numbers
- Common date patterns
- Bank-specific formats (like SBI's DD-MMM-YY)

#### Footer Detection
```typescript
isFooterRow(row: any[])
```
Identifies non-transaction rows:
- Looks for keywords: "total", "closing", "summary"
- Prevents parsing statement footers as transactions

### 4. **Text Cleaning**
```typescript
cleanDescription(desc: string)
```
Normalizes transaction descriptions:
- Collapses multiple spaces
- Removes newlines
- Trims whitespace

## Design Patterns

### 1. **Template Method Pattern**
The abstract class defines the structure, concrete implementations fill in details:
```typescript
class HDFCParser extends BankParser {
  bankId = 'HDFC';
  
  async parse(file) {
    // HDFC-specific logic using base utilities
  }
}
```

### 2. **Progress Callback Pattern**
Optional progress reporting for UI updates:
```typescript
parse(file, onProgress?: (progress: ParseProgress) => void)
```

### 3. **Unified Output Pattern**
All parsers produce the same `UnifiedTransaction` format, making the rest of the app bank-agnostic.

## Real-World Considerations

### Why This Flexibility?
Different banks export in wildly different formats:
- **HDFC**: CSV with "Withdrawal Amt" column
- **SBI**: Excel with merged cells and "Txn Date"
- **ICICI**: CSV with different date formats

### Deduplication Strategy
The `originalData` field preserves all original fields, allowing:
- Generation of unique fingerprints
- Detection of duplicate imports
- Maintaining data integrity

### Error Resilience
- Validates dates before parsing
- Safely handles number conversion
- Detects and skips footer rows
- Reports errors without failing entire import

## Example Implementation

A bank parser would extend this base:
```typescript
class SBIParser extends BankParser {
  bankId = 'SBI';
  bankName = 'State Bank of India';
  supportedFormats = ['.xlsx', '.xls', '.csv'];
  
  async parse(file: File) {
    // Use inherited utilities
    const date = this.parseDate(row.date);  // Handles SBI's date format
    const amount = this.parseAmount(row.amount); // Cleans amount
    
    // Return unified format
    return {
      transactions: [...],
      metadata: {...},
      errors: 0
    };
  }
}
```

This abstract class is essentially the **contract and toolkit** that ensures all bank parsers in your system work consistently while handling the messy reality of different bank formats.

# import detail component

This Angular component (`ImportDetailComponent`) is the **detailed transaction viewer and categorization interface** for a specific import. It's where users review, categorize, and manage transactions after importing them.

## Core Purpose

Displays all transactions from a single import with powerful categorization features, filtering, and export capabilities. It's essentially the "transaction management workspace" for each import.

## Key Features

### 1. **Transaction Display & Enrichment**
The component loads transactions and enriches them with category metadata:
```typescript
TransactionWithCategory extends Transaction {
  rootCategoryLabel?: string;  // "Food & Dining"
  rootCategoryIcon?: string;   // "🍔"
  rootCategoryColor?: string;  // "#FF6B6B"
}
```

### 2. **Auto-Categorization with Review**
Smart workflow for bulk categorization:

1. **Auto-categorize**: Applies rules to uncategorized transactions
2. **Review modal**: Shows what will be categorized
3. **User adjustment**: Can change categories before applying
4. **Confirmation**: Apply or cancel all changes

The review process:
```typescript
categorizedTransactions = signal<CategorizedTransaction[]>([]);
// Each item shows: transaction, old category, new category, merchant key
```

### 3. **Manual Categorization**
Quick categorization from the transaction list:
- Dropdown for each transaction
- Creates rules automatically for future imports
- Extracts merchant key for pattern learning

### 4. **Statistics Dashboard**

Real-time computed stats:
- **Financial**: Total, credit, debit amounts
- **Categorization progress**: X% categorized
- **Category breakdown**: Amount per category with visual indicators
- **Counts**: Categorized vs uncategorized

### 5. **Filtering & Search**
Multiple filter options:
- **Text search**: Searches narration and amounts
- **Category filter**: All, specific category, or uncategorized only
- **Real-time updates**: Computed signals update instantly

### 6. **Bulk Operations**

#### Clear All Categories
- Warning modal before clearing
- Reverts all transactions to uncategorized
- Useful for starting fresh

#### Export to CSV
- Exports filtered transactions
- Includes all relevant fields
- Properly formatted for Excel/Google Sheets

## State Management

Uses Angular signals for reactive state:

### Data Signals
- `import`: The import record metadata
- `account`: Associated bank account
- `transactions`: All transactions with enrichment
- `categorizedTransactions`: Transactions being reviewed

### UI State Signals
- `isLoading`, `isCategorizing`, `isClearing`: Loading states
- `showCategorizationModal`, `showReviewModal`: Modal visibility
- `searchQuery`, `filterCategory`: Filter states

### Computed Properties
All statistics are computed signals that auto-update:
```typescript
categorizedPercent = computed(() => {
  const total = this.transactions().length;
  return Math.round((this.categorizedCount() / total) * 100);
});
```

## Categorization System

### Auto-Categorization Flow
1. Finds all uncategorized transactions
2. Applies existing rules based on merchant patterns
3. Shows review modal with proposed categories
4. User can modify before applying
5. Creates new rules from user choices

### Manual Categorization
1. User selects category from dropdown
2. Updates transaction immediately
3. Extracts merchant key from narration
4. Creates rule for future matching

### Category Breakdown
Groups transactions by category showing:
- Count of transactions
- Total amount
- Visual indicators (icon, color)
- Sorted by amount impact

## Modal Dialogs

### 1. **Review Modal**
Shows auto-categorization results grouped by category:
- List of transactions per category
- Ability to change category before applying
- Apply all or cancel buttons

### 2. **Clear Warning Modal**
Confirms before clearing all categories:
- Shows count of affected transactions
- Requires explicit confirmation
- Reverts all categorizations

### 3. **Categorization Info Modal**
Educational modal explaining the categorization system (referenced but not shown in detail).

## Data Flow

1. **Load Phase**:
   - Fetches import record by ID
   - Loads associated account
   - Queries all transactions for import
   - Enriches with category metadata
   - Sorts by date (newest first)

2. **Interaction Phase**:
   - User searches/filters transactions
   - Categorizes manually or auto
   - Reviews and adjusts

3. **Persistence Phase**:
   - Updates database immediately
   - Creates rules for patterns
   - Reloads to show changes

## Integration Points

### With CategorizationService
- Auto-categorization logic
- Rule creation and management
- Merchant key extraction

### With Database (Dexie)
- Direct queries for transactions
- Updates categories
- Loads related data (accounts, subcategories)

### With Router
- Navigation from imports list
- Back navigation
- ID-based routing

## User Experience Highlights

### Visual Feedback
- Loading states for all operations
- Progress percentages
- Color-coded categories
- Icons for quick recognition

### Smart Defaults
- Newest transactions first
- Auto-creates rules from manual categorization
- Preserves filters during operations

### Safety Features
- Confirmation before bulk operations
- Ability to cancel auto-categorization
- Review before applying changes

## Export Functionality

Creates CSV with:
- Formatted dates (Indian locale)
- Clean descriptions
- Category labels (not IDs)
- Proper escaping for Excel compatibility

This component is the **heart of transaction management**, where raw imported data becomes organized, categorized financial records ready for analysis and reporting.


# Categorization Service

This service (`CategorizationService`) is the **intelligent categorization engine** that automatically assigns categories to transactions using multiple strategies including bank-specific adapters, pattern recognition, and machine learning-like rules.

## Core Architecture

### 1. **Bank Adapter System**
The service uses a registry of bank-specific adapters:
```typescript
BankAdapterRegistry.getAdapter(bankId)  // Gets HDFC, SBI, etc. adapter
BankAdapterRegistry.detectAdapter(narration)  // Auto-detects bank from narration
```

Each bank adapter knows:
- How to extract merchant names from that bank's narration format
- Bank-specific patterns (like UPI formats)
- Transaction type hints

### 2. **Merchant Key Extraction**
The heart of categorization - extracting a consistent merchant identifier:

```typescript
extractMerchantKey(narration: string, bankId?: string)
```

**Process**:
1. Try bank-specific adapter if bankId provided
2. Auto-detect adapter from narration pattern
3. Fall back to generic extraction

**Generic extraction logic**:
- Removes prefixes (UPI-, IMPS-, NEFT-)
- Finds first substantial word
- Skips common terms (THE, AND, FOR)
- Removes suffixes (LIMITED, INDIA, PAYMENTS)
- Returns standardized key (max 20 chars)

Example: `"UPI-SWIGGY FOODS PRIVATE LIMITED"` → `"SWIGGY"`

## Categorization Strategy (7-Layer Priority System)

### Layer 1: **User Rules** (Highest Priority)
```typescript
// Check if user has manually categorized this merchant before
const userRule = await db.categoryRules
  .where('merchantKey').equals(merchantKey)
  .and(rule => rule.createdBy === 'user')
```
User decisions always override system suggestions.

### Layer 2: **Bank Adapter Hints**
```typescript
if (hints.isTransfer === true) {
  return 'transfers';
}
```
Bank adapters can provide high-confidence hints (e.g., detecting P2P transfers).

### Layer 3: **Recurring Pattern Detection**
```typescript
detectRecurringMerchant(merchantKey, accountId)
```
Identifies subscriptions by analyzing:
- Transaction frequency (monthly/quarterly)
- Consistent amounts (±20% variance)
- Regular dates (same day of month ±3 days)
- Confidence score calculation

### Layer 4: **System Rules**
Previously learned patterns from system analysis.

### Layer 5: **Special Pattern Detection**
Hard-coded patterns for obvious categories:
- "CASHBACK" → income
- "EMI" → loans
- "MUTUAL FUND" → investments
- "ELECTRICITY BILL" → utilities

### Layer 6: **Default Keyword Map**
Pre-configured merchant-to-category mappings.

### Layer 7: **Keyword Search in Narration**
Last resort - searches for category keywords within the full narration.

## Recurring Transaction Detection

### Monthly Pattern Analysis
```typescript
checkMonthlyPattern(dates: Date[], amounts: number[])
```

**Calculates**:
- **Interval consistency**: Are transactions ~30 days apart?
- **Day consistency**: Same day of month?
- **Amount consistency**: Similar amounts?

**Confidence formula**:
```
confidence = (monthlyRatio * 0.4) + (dayConsistency * 0.4) + (amountConsistency * 0.2)
```

**Requirements**:
- At least 3 transactions
- Confidence ≥ 0.7
- Returns frequency type and average amount

## Rule Management System

### Rule Creation
```typescript
createRule(merchantKey, category, createdBy, confidence)
```

**Rule properties**:
- `merchantKey`: Standardized merchant identifier
- `rootCategory`: Assigned category
- `createdBy`: 'user' or 'system'
- `confidence`: 0.0 to 1.0
- `usageCount`: Times applied
- `lastUsed`: For rule freshness

**Update logic**:
- User rules always override system rules
- Higher confidence replaces lower confidence
- Usage count tracks rule effectiveness

## Special Features

### 1. **Auto-Detection**
Can identify bank format from narration alone:
```typescript
adapter = BankAdapterRegistry.detectAdapter(narration);
```
Useful when bank info is missing.

### 2. **Word Boundary Detection**
Ensures keyword matches are whole words:
```typescript
const isWordBoundary = /[^A-Z0-9]/.test(prevChar) && /[^A-Z0-9]/.test(nextChar);
```
Prevents false matches like "MEDICINE" matching "MED".

### 3. **Adaptive Learning**
Every categorization:
- Updates rule usage counts
- Tracks last used date
- Improves confidence scores

### 4. **Fallback Strategies**
Multiple layers ensure most transactions get categorized:
1. Specific merchant rules
2. Pattern detection
3. Keyword matching
4. Generic patterns

## Integration with Bank Adapters

Bank adapters provide:
- **Merchant extraction logic**: Bank-specific parsing
- **Category hints**: High-confidence suggestions
- **Pattern recognition**: Bank-specific transaction types

Example flow:
1. HDFC adapter recognizes UPI pattern
2. Extracts merchant from UPI string
3. Provides transfer hint if P2P
4. Service uses hint with high confidence

## Performance Optimizations

### 1. **Rule Caching**
Rules stored in IndexedDB with indexes on merchantKey for fast lookups.

### 2. **Early Returns**
Stops at first successful categorization layer.

### 3. **Batch Processing**
Can process multiple transactions efficiently using shared rules.

## Example Categorization Flow

Transaction: `"UPI-NETFLIX INDIA-AUTOPAY-HDFC"`

1. **Extract merchant**: "NETFLIX"
2. **Check user rules**: Not found
3. **Bank hints**: Detects "AUTOPAY" pattern
4. **Recurring check**: Finds monthly pattern
5. **Result**: Categorized as "subscriptions" with 0.85 confidence
6. **Create rule**: Saves for future Netflix transactions

This service essentially acts as the **brain of the categorization system**, combining multiple intelligent strategies to accurately categorize transactions while learning and improving over time.

# Sbi Parser

This file (`SBIAdapter`) is a **bank-specific adapter for State Bank of India (SBI)** that understands SBI's unique transaction narration formats and extracts meaningful information from them.

## Core Purpose

SBI formats transaction descriptions differently than other banks. This adapter knows how to:
- Identify SBI transactions
- Extract merchant names from SBI's specific formats
- Provide category hints based on SBI patterns

## Key Components

### 1. **Pattern Recognition (`canHandle`)**
Identifies if a narration is from SBI by checking prefixes:
```typescript
BY TRANSFER-    // Incoming transfers
TO TRANSFER-    // Outgoing transfers
ATM-           // ATM withdrawals
POS-           // Point of Sale (card) transactions
CASH-          // Cash deposits/withdrawals
DEBIT-IMPS     // IMPS debits
CREDIT-IMPS    // IMPS credits
```

### 2. **Merchant Extraction Logic**

#### **Asterisk Format (NEFT/RTGS)**
SBI uses asterisks as delimiters in NEFT/RTGS transactions:
```
Example: "NEFT*AXISCN0123456*JOHN DOE*MUMBAI--REF123"
         [Type]*[Bank Code]*[Name]*[Location]--[Reference]
```

The adapter:
1. Splits by asterisks (`*`)
2. Takes the last part (usually the recipient name)
3. Removes the reference part after `--`
4. Cleans and returns the name

#### **Slash Format (IMPS)**
For IMPS transactions with slashes:
```
Example: "DEBIT-IMPS/123456789/HDFC-xx991-sagar hd/Refund"
         [Type]/[Reference]/[Bank-Account-Name]/[Description]
```

The adapter:
1. Splits by slashes (`/`)
2. Skips numeric-only parts (reference numbers)
3. Extracts meaningful text (bank/name info)
4. Returns cleaned merchant key

#### **Generic Fallback**
If special formats don't match:
1. Splits by common delimiters (space, dash, dot, @, /)
2. Finds first substantial word (3+ chars, not numeric)
3. Skips common words (THE, AND, FOR, BY, TO, TRANSFER)
4. Returns up to 20 characters

### 3. **Hint Extraction (`extractHints`)**

Provides transaction insights based on SBI patterns:

#### **Transfer Detection**
```typescript
if (upper.startsWith('BY TRANSFER-') || upper.startsWith('TO TRANSFER-'))
```
- Identifies as transfer type
- Checks for `/SELF` indicating self-transfer
- Suggests 'transfers' category for self-transfers

#### **Account Info Extraction**
```typescript
const accountMatch = upper.match(/([A-Z]+)-XX\d+-[A-Z\s]+/);
```
Matches patterns like: `HDFC-XX991-sagar hd`
- Bank name (HDFC)
- Masked account (XX991)
- Account holder name (sagar hd)

#### **Transaction Type Hints**
- **ATM transactions**: Suggests 'cash' category
- **POS transactions**: Suggests 'shopping' category

## Real-World Examples

### Example 1: NEFT Transfer
```
Input: "NEFT*SBIN0001234*AMAZON SELLER SERVICES*BANGALORE--PAYMENT"
Process:
1. Detect asterisk format
2. Split: ["NEFT", "SBIN0001234", "AMAZON SELLER SERVICES", "BANGALORE--PAYMENT"]
3. Take last part: "BANGALORE--PAYMENT"
4. Remove after --: "BANGALORE"
5. Clean: "BANGALORE" (or might extract AMAZON from earlier part)
Output: "AMAZON" or "BANGALORE"
```

### Example 2: IMPS Transfer
```
Input: "DEBIT-IMPS/987654321/HDFC-xx991-john doe/Monthly rent"
Process:
1. Detect slash format
2. Split by /: ["DEBIT-IMPS", "987654321", "HDFC-xx991-john doe", "Monthly rent"]
3. Skip numeric "987654321"
4. Extract from "HDFC-xx991-john doe"
5. Clean: "HDFCXXJOHNDOE"
Output: "HDFCXXJOHNDOE"
```

### Example 3: ATM Withdrawal
```
Input: "ATM-CASH WDL-MUMBAI CENTRAL"
Process:
1. Detect ATM prefix
2. Set hints: {transactionType: 'atm', possibleCategory: 'cash'}
3. Extract merchant: "CASH" or "MUMBAI"
Output: Merchant "CASH", Category hint "cash"
```

## Integration with Categorization Service

The categorization service uses this adapter to:

1. **Auto-detect SBI transactions**:
```typescript
if (adapter.canHandle(narration)) {
  // This is an SBI transaction
}
```

2. **Extract consistent merchant keys**:
```typescript
const merchantKey = adapter.extractMerchantKey(narration);
// Same merchant gets same key regardless of narration variations
```

3. **Get category suggestions**:
```typescript
const hints = adapter.extractHints(narration);
if (hints.possibleCategory === 'transfers') {
  // Categorize as transfer
}
```

## Why Bank-Specific Adapters?

Different banks have wildly different formats:
- **HDFC**: Uses "UPI-MERCHANT-ID" format
- **SBI**: Uses asterisks, slashes, and specific prefixes
- **ICICI**: Has its own patterns

Without adapters, you'd get inconsistent merchant extraction:
- Same merchant might be "AMAZON", "AMAZONSELLERSERVICES", or "BANGALORE"
- Transfer detection would fail
- Category hints would be generic

## Benefits

1. **Consistent Merchant Identification**: Same merchant always gets same key
2. **Better Auto-categorization**: Bank-specific patterns improve accuracy
3. **Transfer Detection**: Identifies self-transfers and inter-bank transfers
4. **Scalability**: Easy to add new banks by creating new adapters
5. **Maintainability**: Bank-specific logic is isolated

This adapter essentially acts as a **translator** that understands SBI's "language" and converts it into standardized data that the rest of your application can work with consistently.


# Sample SBI records

1 Apr 2025	INTEREST PAID TILL 31-MAR-2025	0	150	Uncategorized
31 Mar 2025	IMPS-509018938794-SAGAR GULABANI -SBIN-XXXXXXX4795-SELF	0000509018938794	106000	Transfers
31 Mar 2025	IB BILLPAY DR-HDFCSI-485498XXXXXX5657	MB31183452545T46	-11219	Transfers
31 Mar 2025	UPI-BAJRANG VEGETABLE AN-PAYTMQRU3M5YENPMK@PAYTM-YESB0PTMUPI-538488486268-BISCUIT	0000538488486268	-35	Food & Groceries
31 Mar 2025	UPI-GULABANI S A-SGULABANI@YBL-HSBC0411002-971548240699-SELF	0000971548240699	-1000	Transfers
31 Mar 2025	UPI-BHANUPRATAP VIRENDRA-PAYTMQR2Q8RKAV4S2@PAYTM-YESB0PTMUPI-993452834348-PAPAYA	0000993452834348	-127	Food & Groceries
30 Mar 2025	UPI-ZEPTO-CF.ZEPTONOWLTD@ICICI-ICIC0DC0099-588792646770-PAYMENT FROM PHONE	0000588792646770	-159.28	Food & Groceries
30 Mar 2025	UPI-SHREE HARIHAR KR-PAYTMQR2810050501011L682VETQDR8@PAYTM-YESB0PTMUPI-502513510273-KELA	0000502513510273	-20	Food & Groceries
30 Mar 2025	UPI-SHREE MOMADHANI ENTE-Q644477228@YBL-YESB0YBLUPI-389598510564-SCREENGUARD	0000389598510564	-180	Utilities
30 Mar 2025	UPI-VIPUL DEVRAJBHAI CHA-PAYTMQR5Z3QO4@PTYS-YESB0PTMUPI-102316498885-PAY BY WHATSAPP	0000102316498885	-230	Food & Groceries
30 Mar 2025	UPI-JAY MAA DURGA PAKODI-BAJAJPAY.6879729.02261356@INDUS-INDB0MERCHA-070424750347-PANIPURI	0000070424750347	-40	Food & Groceries
29 Mar 2025	UPI-VODAFONE IDEA GUJAR-VIINAPPGUJ@YBL-YESB0YBLUPI-141683160401-PAYMENT FROM PHONE	0000141683160401	-862	Utilities
27 Mar 2025	UPI-FOUR FOX CYBER-9712901608.WA.HXU@WAAXIS-KKBK0002564-102132791367-PAY BY WHATSAPP	0000102132791367	-1320	Entertainment
27 Mar 2025	UPI-FOUR FOX CYBER-9712901608.WA.HXU@WAAXIS-KKBK0002564-102132885187-PAY BY WHATSAPP	0000102132885187	-1600	Entertainment
20 Mar 2025	.ACH DEBIT RETURN CHARGES 010325 010325-MIR2507953498141	MIR2507953498141	-531	Uncategorized
17 Mar 2025	ACH D- SIP-000000SIOAVGGAE53325076011154	0000006165941986	-10000	Uncategorized
17 Mar 2025	ACH D- SIP-000000SIOAVGGAE53325076011154	0000006165941986	10000	Uncategorized
11 Mar 2025	UPI-ETMONEY-ETMONEY.RAZORPAY@ICICI-ICIC0DC0099-507013158785-PAY VIA RAZORPAY	0000507013158785	-3000	Business
11 Mar 2025	UPI-ETMONEY-ETMONEY.RAZORPAY@ICICI-ICIC0DC0099-507013172064-PAY VIA RAZORPAY	0000507013172064	-7500	Business
11 Mar 2025	UPI-ETMONEY-ETMONEY.RAZORPAY@ICICI-ICIC0DC0099-507013197903-PAY VIA RAZORPAY	0000507013197903	-2000	Business
11 Mar 2025	UPI-ETMONEY-ETMONEY.RAZORPAY@ICICI-ICIC0DC0099-507013216605-PAY VIA RAZORPAY	0000507013216605	-7500	Business
9 Mar 2025	IMPS-506815916615-SAGAR GULABANI -SBIN-XXXXXXX4795-SELF	0000506815916615	37000	Transfers


# Sample SBI Records

Txn Date	Value Date	Description	Ref No./Cheque No.	        Debit	Credit	Balance
21 Apr 2024	21 Apr 2024	TO TRANSFER-INB IMPS/P2A/411212908073/XXXXXXX991HDFCnull--	LTA5QSJJUM8URRTMOAJJBVTK2               TRANSFER T	50,000.00	 	2,25,400.45
5 Jun 2024	5 Jun 2024	TO TRANSFER-INB NEFT UTR NO: SBIN124157748493--sagar hdfc	NEFT INB: IRY6806740                               / sagar hdfc	1,75,000.00	 	50,400.45
3 Oct 2024	3 Oct 2024	BY TRANSFER-NEFT*INDB0000006*INDBN03101211261*Upwork Escrow In--	TRANSFER FROM 4698188044303	 	25,208.85	75,609.30
10 Oct 2024	10 Oct 2024	BY TRANSFER-NEFT*INDB0000006*INDBN10102575541*Upwork Escrow In--	TRANSFER FROM 4698204044307	 	49,999.13	1,25,608.43
11 Oct 2024	11 Oct 2024	TO TRANSFER-NEFT UTR NO: SBIN424285653851--sagar hdfc	TRANSFER TO 4697156044308 / sagar hdfc	1,25,608.00	 	0.43
17 Oct 2024	17 Oct 2024	BY TRANSFER-NEFT*INDB0000006*INDBN17103539886*Upwork Escrow In--	TRANSFER FROM 3199417044302	 	70,728.85	70,729.28
23 Oct 2024	23 Oct 2024	BY TRANSFER-NEFT*INDB0000006*INDBN23104326356*Upwork Escrow In--	TRANSFER FROM 4697223044303	 	57,496.31	1,28,225.59
31 Oct 2024	31 Oct 2024	BY TRANSFER-NEFT*INDB0000006*INDBN31105942212*Upwork Escrow In--	TRANSFER FROM 4697234044300	 	59,431.88	1,87,657.47
1 Nov 2024	1 Nov 2024	TO TRANSFER-INB IMPS/430613652333/HDFC-xx991-/null--	LTA09S5ASVDL5FHMOAKHOMZI8               TRANSFER T	1,87,657.00	 	0.47
6 Nov 2024	6 Nov 2024	BY TRANSFER-NEFT*INDB0000006*INDBN06116670068*Upwork Escrow In--	TRANSFER FROM 3199962044300	 	67,382.71	67,383.18
13 Nov 2024	13 Nov 2024	BY TRANSFER-NEFT*INDB0000006*INDBN13117742345*Upwork Escrow In--	TRANSFER FROM 4698208044303	 	38,947.61	1,06,330.79
14 Nov 2024	14 Nov 2024	TO TRANSFER-INB IMPS/431908786951/HDFC-xx991-/null--	LTA3TAVJB1UJL26MOAKJDUDO7               TRANSFER T	1,06,330.00	 	0.79
21 Nov 2024	21 Nov 2024	BY TRANSFER-NEFT*INDB0000006*INDBN21118764154*Upwork Escrow In--	TRANSFER FROM 3199422044305	 	61,629.37	61,630.16
28 Nov 2024	28 Nov 2024	BY TRANSFER-NEFT*INDB0000006*INDBN28119572548*Upwork Escrow In--	TRANSFER FROM 3199959044304	 	59,235.78	1,20,865.94
29 Nov 2024	29 Nov 2024	TO TRANSFER-INB IMPS/433413648716/HDFC-xx915-Cloud so/Salary--	LTA82I7RC68JU9AMOAKKUIGW6               TRANSFER T	70,000.00	 	50,865.94
29 Nov 2024	29 Nov 2024	TO TRANSFER-INB IMPS/433413649984/HDFC-xx991-sagar hd/Bills--	LTA82I7RCBPMD4QMOAKKUIPI7               TRANSFER T	50,000.00	 	865.94
