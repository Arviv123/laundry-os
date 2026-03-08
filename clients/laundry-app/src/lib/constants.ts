export const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'התקבל',
  PROCESSING: 'בעיבוד',
  WASHING: 'בכביסה',
  DRYING: 'בייבוש',
  IRONING: 'בגיהוץ',
  READY: 'מוכן',
  OUT_FOR_DELIVERY: 'במשלוח',
  DELIVERED: 'נמסר',
  CANCELLED: 'בוטל',
};

export const STATUS_COLORS: Record<string, string> = {
  RECEIVED: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  WASHING: 'bg-cyan-100 text-cyan-700',
  DRYING: 'bg-orange-100 text-orange-700',
  IRONING: 'bg-purple-100 text-purple-700',
  READY: 'bg-green-100 text-green-700',
  OUT_FOR_DELIVERY: 'bg-indigo-100 text-indigo-700',
  DELIVERED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export const STATUS_BG: Record<string, string> = {
  RECEIVED: 'bg-yellow-500',
  PROCESSING: 'bg-blue-500',
  WASHING: 'bg-cyan-500',
  DRYING: 'bg-orange-500',
  IRONING: 'bg-purple-500',
  READY: 'bg-green-500',
  OUT_FOR_DELIVERY: 'bg-indigo-500',
  DELIVERED: 'bg-emerald-500',
  CANCELLED: 'bg-red-500',
};

export const STATUS_FLOW = ['RECEIVED', 'PROCESSING', 'WASHING', 'DRYING', 'IRONING', 'READY', 'DELIVERED'];

export const NEXT_STATUS: Record<string, string> = {
  RECEIVED: 'PROCESSING',
  PROCESSING: 'WASHING',
  WASHING: 'DRYING',
  DRYING: 'IRONING',
  IRONING: 'READY',
  READY: 'DELIVERED',
};

export const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: 'לא שולם',
  PARTIALLY_PAID: 'שולם חלקית',
  PAID: 'שולם',
  REFUNDED: 'הוחזר',
};

export const PAYMENT_COLORS: Record<string, string> = {
  UNPAID: 'bg-red-100 text-red-700',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-700',
  PAID: 'bg-green-100 text-green-700',
  REFUNDED: 'bg-gray-100 text-gray-600',
};

export const CATEGORY_LABELS: Record<string, string> = {
  WASH: 'כביסה',
  DRY_CLEAN: 'ניקוי יבש',
  IRON: 'גיהוץ',
  FOLD: 'קיפול',
  SPECIAL: 'מיוחד',
};

export const GARMENT_CATEGORIES = [
  { value: 'SHIRT', label: 'חולצה' },
  { value: 'PANTS', label: 'מכנסיים' },
  { value: 'DRESS', label: 'שמלה' },
  { value: 'SUIT', label: 'חליפה' },
  { value: 'COAT', label: 'מעיל' },
  { value: 'BEDDING', label: 'מצעים' },
  { value: 'CURTAIN', label: 'וילון' },
  { value: 'TOWEL', label: 'מגבת' },
  { value: 'OTHER', label: 'אחר' },
];

// Sub-categories for each garment type
export const GARMENT_SUB_TYPES: Record<string, { value: string; label: string }[]> = {
  SHIRT: [
    { value: 'MEN_LONG', label: 'גברים שרוול ארוך' },
    { value: 'MEN_SHORT', label: 'גברים שרוול קצר' },
    { value: 'WOMEN_BLOUSE', label: 'נשים חולצה' },
    { value: 'WOMEN_TOP', label: 'נשים טופ' },
    { value: 'POLO', label: 'פולו' },
    { value: 'TSHIRT', label: 'טי-שירט' },
    { value: 'DRESS_SHIRT', label: 'חולצת ערב' },
    { value: 'OTHER', label: 'אחר' },
  ],
  PANTS: [
    { value: 'JEANS', label: "ג'ינס" },
    { value: 'DRESS_PANTS', label: 'מכנסי חליפה' },
    { value: 'CASUAL', label: 'קז\'ואל' },
    { value: 'SKIRT', label: 'חצאית' },
    { value: 'SHORTS', label: 'מכנסיים קצרים' },
    { value: 'OTHER', label: 'אחר' },
  ],
  DRESS: [
    { value: 'CASUAL_DRESS', label: 'שמלה יומיומית' },
    { value: 'EVENING', label: 'שמלת ערב' },
    { value: 'WEDDING', label: 'שמלת כלה' },
    { value: 'MAXI', label: 'מקסי' },
    { value: 'COCKTAIL', label: 'קוקטייל' },
    { value: 'OTHER', label: 'אחר' },
  ],
  SUIT: [
    { value: 'TWO_PIECE', label: 'שני חלקים' },
    { value: 'THREE_PIECE', label: 'שלושה חלקים' },
    { value: 'TUXEDO', label: 'טוקסידו' },
    { value: 'JACKET_ONLY', label: "ז'קט בלבד" },
    { value: 'WOMEN_SUIT', label: 'חליפת נשים' },
    { value: 'OTHER', label: 'אחר' },
  ],
  COAT: [
    { value: 'WINTER', label: 'מעיל חורף' },
    { value: 'RAIN', label: 'מעיל גשם' },
    { value: 'LEATHER', label: 'עור' },
    { value: 'FUR', label: 'פרווה' },
    { value: 'LIGHT', label: 'מעיל קל' },
    { value: 'BLAZER', label: "בלייזר" },
    { value: 'OTHER', label: 'אחר' },
  ],
  BEDDING: [
    { value: 'SHEET_SINGLE', label: 'סדין יחיד' },
    { value: 'SHEET_DOUBLE', label: 'סדין זוגי' },
    { value: 'DUVET_COVER', label: 'ציפת שמיכה' },
    { value: 'PILLOW_CASE', label: 'ציפית' },
    { value: 'BLANKET', label: 'שמיכה' },
    { value: 'COMFORTER', label: 'שמיכת פוך' },
    { value: 'OTHER', label: 'אחר' },
  ],
  CURTAIN: [
    { value: 'SHEER', label: 'וילון שקוף' },
    { value: 'BLACKOUT', label: 'וילון האפלה' },
    { value: 'REGULAR', label: 'וילון רגיל' },
    { value: 'TABLECLOTH', label: 'מפת שולחן' },
    { value: 'OTHER', label: 'אחר' },
  ],
  TOWEL: [
    { value: 'BATH', label: 'מגבת אמבטיה' },
    { value: 'HAND', label: 'מגבת ידיים' },
    { value: 'POOL', label: 'מגבת בריכה' },
    { value: 'ROBE', label: 'חלוק' },
    { value: 'OTHER', label: 'אחר' },
  ],
  OTHER: [
    { value: 'TIE', label: 'עניבה' },
    { value: 'SCARF', label: 'צעיף' },
    { value: 'BAG', label: 'תיק' },
    { value: 'SHOES', label: 'נעליים' },
    { value: 'UNIFORM', label: 'מדים' },
    { value: 'TABLECLOTH', label: 'מפת שולחן' },
    { value: 'CUSTOM', label: 'פריט מותאם' },
  ],
};
