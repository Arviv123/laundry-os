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
