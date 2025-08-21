// core/models/category.model.ts

export interface RootCategory {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  description?: string;
}

export interface SubCategory {
  id?: number;
  rootId: string;
  label: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CategoryRule {
  id?: number;
  merchantKey: string;
  rootCategory: string;
  subCategory?: string;
  confidence: number;
  createdBy: 'user' | 'system';
  usageCount: number;
  lastUsed?: Date;
  createdAt?: Date;
}

// Fixed root categories - Updated with travel, investments, and digital goods categories
export const ROOT_CATEGORIES: RootCategory[] = [
  { id: 'income', label: 'Income', icon: '💰', color: '#00b17c', description: 'Salary, refunds, cashback' },
  { id: 'housing', label: 'Housing', icon: '🏠', color: '#6366f1', description: 'Rent, maintenance, repairs' },
  { id: 'utilities', label: 'Utilities', icon: '💡', color: '#8b5cf6', description: 'Electricity, water, internet, phone' },
  { id: 'food', label: 'Food & Groceries', icon: '🍔', color: '#f59e0b', description: 'Restaurants, groceries, food delivery' },
  { id: 'transport', label: 'Transport', icon: '🚗', color: '#3b82f6', description: 'Local cabs, fuel, metro, daily commute' },
  { id: 'travel', label: 'Travel & Tourism', icon: '✈️', color: '#0ea5e9', description: 'Flights, hotels, train bookings, vacations' },
  { id: 'health', label: 'Health', icon: '🏥', color: '#ef4444', description: 'Medical, pharmacy, insurance, fitness' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️', color: '#ec4899', description: 'Clothes, electronics, household items' },
  { id: 'digital', label: 'Digital Goods', icon: '💻', color: '#7c3aed', description: 'Apps, software, digital media, online services' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎮', color: '#a855f7', description: 'Movies, games, hobbies, events' },
  { id: 'education', label: 'Education', icon: '📚', color: '#14b8a6', description: 'Courses, books, school fees' },
  { id: 'investments', label: 'Investments', icon: '📈', color: '#10b981', description: 'Mutual funds, stocks, trading, SIPs' },
  { id: 'subscriptions', label: 'Subscriptions', icon: '🔄', color: '#f97316', description: 'Streaming, software, memberships' },
  { id: 'loans', label: 'Loans & EMIs', icon: '💳', color: '#dc2626', description: 'Credit cards, loans, EMI payments' },
  { id: 'fees', label: 'Fees & Charges', icon: '🏦', color: '#6b7280', description: 'Bank fees, service charges, penalties' },
  { id: 'transfers', label: 'Transfers', icon: '↔️', color: '#64748b', description: 'Personal transfers, self transfers' },
  { id: 'business', label: 'Business', icon: '💼', color: '#059669', description: 'Business income, expenses, freelance' },
  { id: 'misc', label: 'Miscellaneous', icon: '📌', color: '#94a3b8', description: 'Other expenses' }
];

// Default keyword mappings for auto-categorization
// DO NOT include generic payment method keywords like UPI, IMPS, etc.
export const DEFAULT_KEYWORD_MAP: Record<string, string> = {
  // Food & Restaurants
  'SWIGGY': 'food',
  'ZOMATO': 'food',
  'BLINKIT': 'food',
  'ZEPTO': 'food',
  'DUNZO': 'food',
  'INSTAMART': 'food',
  'BIGBASKET': 'food',
  'GROFERS': 'food',
  'MCDONALDS': 'food',
  'KFC': 'food',
  'DOMINOS': 'food',
  'PIZZAHUT': 'food',
  'STARBUCKS': 'food',
  'BURGERKING': 'food',
  'SUBWAY': 'food',
  'HALDIRAM': 'food',
  'BARBEQUE': 'food',
  'CAFE': 'food',
  'RESTAURANT': 'food',
  'FOODCOURT': 'food',
  'BISTRO': 'food',

  // Transport - Local/Daily Commute
  'UBER': 'transport',
  'OLA': 'transport',
  'RAPIDO': 'transport',
  'BLABLACAR': 'transport',
  'INDIANOIL': 'transport',
  'BPCL': 'transport',
  'HPCL': 'transport',
  'SHELLPETROL': 'transport',
  'METRO': 'transport',
  'PETROL': 'transport',
  'DIESEL': 'transport',
  'FUEL': 'transport',
  'PARKING': 'transport',
  'TOLL': 'transport',
  'FASTAG': 'transport',

  // Travel & Tourism - Long Distance/Vacation
  'MAKEMYTRIP': 'travel',
  'GOIBIBO': 'travel',
  'YATRA': 'travel',
  'CLEARTRIP': 'travel',
  'IRCTC': 'travel',
  'TRAINMAN': 'travel',
  'REDBUS': 'travel',
  'AIRBNB': 'travel',
  'OYO': 'travel',
  'BOOKING': 'travel',
  'EXPEDIA': 'travel',
  'AGODA': 'travel',
  'TRIVAGO': 'travel',
  'AIRASIA': 'travel',
  'INDIGO': 'travel',
  'SPICEJET': 'travel',
  'VISTARA': 'travel',
  'AIRINDIA': 'travel',
  'EMIRATES': 'travel',
  'HOTEL': 'travel',
  'RESORT': 'travel',
  'CONFIRMTKT': 'travel',
  'IXIGO': 'travel',
  'ABHIBUS': 'travel',
  'RAILYATRI': 'travel',

  // Utilities & Bills
  'TORRENTPOWER': 'utilities',
  'ADANI': 'utilities',  // Matches ADANI GAS, ADANI ELECTRICITY, etc.
  'ADANIGAS': 'utilities',
  'ADANIELECT': 'utilities',
  'MAHANAGAR': 'utilities',
  'AIRTEL': 'utilities',
  'JIO': 'utilities',
  'VODAFONE': 'utilities',
  'IDEA': 'utilities',
  'BSNL': 'utilities',
  'TATASKY': 'utilities',
  'DISHTV': 'utilities',
  'HATHWAY': 'utilities',
  'ACT': 'utilities',
  'TIKONA': 'utilities',
  'SPECTRA': 'utilities',
  'EXCITEL': 'utilities',

  // Digital Goods & Services
  'APPLE': 'digital',
  'APPLESERVICES': 'digital',
  'APPLEMEDIA': 'digital',
  'GOOGLEPLAY': 'digital',
  'PLAYSTORE': 'digital',
  'MICROSOFT': 'digital',
  'ADOBE': 'digital',
  'CANVA': 'digital',
  'NOTION': 'digital',
  'SLACK': 'digital',
  'ZOOM': 'digital',
  'DROPBOX': 'digital',
  'ICLOUD': 'digital',
  'GITHUB': 'digital',
  'LINKEDIN': 'digital',
  'MEDIUM': 'digital',
  'SUBSTACK': 'digital',
  'CHATGPT': 'digital',
  'OPENAI': 'digital',
  'CLAUDE': 'digital',
  'FIGMA': 'digital',
  'SKETCH': 'digital',
  'INTELLIJ': 'digital',
  'JETBRAINS': 'digital',
  'DIGITALOCEAN': 'digital',
  'AWS': 'digital',
  'GOOGLECLOUD': 'digital',
  'HEROKU': 'digital',
  'VERCEL': 'digital',
  'NETLIFY': 'digital',
  'DOMAIN': 'digital',
  'GODADDY': 'digital',
  'NAMECHEAP': 'digital',
  'WORDPRESS': 'digital',
  'SQUARESPACE': 'digital',
  'WIX': 'digital',
  'SHOPIFY': 'digital',

  // Subscriptions & Streaming
  'NETFLIX': 'subscriptions',
  'AMAZONPRIME': 'subscriptions',
  'PRIMEVIDEO': 'subscriptions',
  'SPOTIFY': 'subscriptions',
  'HOTSTAR': 'subscriptions',
  'DISNEY': 'subscriptions',
  'YOUTUBE': 'subscriptions',
  'GOOGLEONE': 'subscriptions',
  'SONYLIV': 'subscriptions',
  'VOOT': 'subscriptions',
  'ZEE5': 'subscriptions',
  'ALTBALAJI': 'subscriptions',
  'APPLEMUSIC': 'subscriptions',
  'GAANA': 'subscriptions',
  'JIOSAAVN': 'subscriptions',
  'AUDIBLE': 'subscriptions',
  'KINDLE': 'subscriptions',

  // Shopping & E-commerce
  'AMAZON': 'shopping',
  'FLIPKART': 'shopping',
  'MYNTRA': 'shopping',
  'AJIO': 'shopping',
  'NYKAA': 'shopping',
  'MEESHO': 'shopping',
  'SNAPDEAL': 'shopping',
  'LIMEROAD': 'shopping',
  'KOOVS': 'shopping',
  'JABONG': 'shopping',
  'TATACLIQ': 'shopping',
  'SHOPCLUES': 'shopping',
  'PEPPERFRY': 'shopping',
  'URBANLADDER': 'shopping',
  'IKEA': 'shopping',
  'DECATHLON': 'shopping',
  'CROMA': 'shopping',
  'RELIANCE': 'shopping',
  'DMART': 'shopping',
  'VISHAL': 'shopping',
  'PANTALOONS': 'shopping',
  'LIFESTYLE': 'shopping',
  'WESTSIDE': 'shopping',
  'ZARA': 'shopping',
  'HM': 'shopping',
  'MAX': 'shopping',
  'TRENDS': 'shopping',

  // Health & Medical
  'APOLLO': 'health',
  'FORTIS': 'health',
  'MAXHOSPITAL': 'health',
  'MANIPAL': 'health',
  'AIIMS': 'health',
  'PHARMACY': 'health',
  'MEDPLUS': 'health',
  'NETMEDS': 'health',
  'PHARMEASY': 'health',
  '1MG': 'health',
  'HOSPITAL': 'health',
  'CLINIC': 'health',
  'DOCTOR': 'health',
  'DIAGNOSTIC': 'health',
  'PRACTO': 'health',
  'LENSKART': 'health',
  'CULTFIT': 'health',
  'GOLDSGYM': 'health',
  'ANYTIMEFITNESS': 'health',

  // Investments - Separated from Business
  'ETMONEY': 'investments',
  'GROWW': 'investments',
  'ZERODHA': 'investments',
  'UPSTOX': 'investments',
  'ANGELONE': 'investments',
  'ANGELBROKING': 'investments',
  'KUVERA': 'investments',
  'PAYTMMONEY': 'investments',
  'COIN': 'investments',
  'SMALLCASE': 'investments',
  'SCRIPBOX': 'investments',
  'PIGGY': 'investments',
  'KFINTECH': 'investments',
  'CAMS': 'investments',
  'BSE': 'investments',
  'NSE': 'investments',
  'ICICIDIRECT': 'investments',
  'HDFCSEC': 'investments',
  'KOTAKSEC': 'investments',
  'SHAREKHAN': 'investments',
  '5PAISA': 'investments',
  'INDMONEY': 'investments',
  'FYERS': 'investments',
  'MOTILAL': 'investments',
  'EDELWEISS': 'investments',
  'VESTED': 'investments',

  // Education
  'BYJU': 'education',
  'UNACADEMY': 'education',
  'VEDANTU': 'education',
  'TOPPR': 'education',
  'COURSERA': 'education',
  'UDEMY': 'education',
  'UDACITY': 'education',
  'EDUREKA': 'education',
  'SIMPLILEARN': 'education',
  'UPGRAD': 'education',
  'WHITEHATJR': 'education',
  'CUEMATH': 'education',
  'EXTRAMARKS': 'education',

  // Entertainment
  'BOOKMYSHOW': 'entertainment',
  'PAYTMINSIDER': 'entertainment',
  'PVRINOX': 'entertainment',
  'INOX': 'entertainment',
  'CARNIVAL': 'entertainment',
  'CINEPOLIS': 'entertainment',
  'PLAYSTATION': 'entertainment',
  'XBOX': 'entertainment',
  'STEAM': 'entertainment',
  'EPICGAMES': 'entertainment',
  'DREAM11': 'entertainment',
  'MPL': 'entertainment',

  // Housing & Rent
  'NOBROKER': 'housing',
  'MAGICBRICKS': 'housing',
  '99ACRES': 'housing',
  'HOUSING': 'housing',
  'NESTAWAY': 'housing',
  'OAKTREE': 'housing',
  'BRIGADE': 'housing',
  'PRESTIGE': 'housing',
  'SOBHA': 'housing',
  'PURAVANKARA': 'housing',
  'PAYING GUEST': 'housing',
  'SOCIETY': 'housing',
  'MAINTENANCE': 'housing',

  // Loans & Credit - Only keep specific loan/credit card services
  'BAJAJFINSERV': 'loans',
  'SBICARD': 'loans',
  'AMEX': 'loans',
  'ONECARD': 'loans',
  'SLICE': 'loans',
  'LAZYPAY': 'loans',
  'SIMPL': 'loans',
  'ZESTMONEY': 'loans',
  'CREDITCARD': 'loans',
  // Removed generic bank names that cause false positives:
  // 'HDFCBANK', 'ICICIBANK', 'AXISBANK', 'KOTAKBANK',
  // 'IDFC', 'CITI', 'HSBC', 'STANDARDCHARTERED', 'RBL'
  // These should be detected by pattern matching (EMI, LOAN, etc.)

  // DO NOT ADD:
  // Generic payment methods: UPI, IMPS, NEFT, RTGS
  // Generic terms: PAYMENT, TRANSFER, CREDIT, DEBIT
  // Generic bank names without specific context
  // These should be handled by pattern detection, not keywords
};
