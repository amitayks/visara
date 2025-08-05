import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  subWeeks,
  subMonths,
  addDays,
  parse,
  isValid
} from 'date-fns';

export interface DateRange {
  start: Date;
  end: Date;
}

export class DateParser {
  static parse(text: string): DateRange | null {
    const lowerText = text.toLowerCase();
    const today = new Date();
    
    // Today
    if (lowerText.includes('today') || lowerText.includes('היום')) {
      return {
        start: startOfDay(today),
        end: endOfDay(today)
      };
    }
    
    // Yesterday
    if (lowerText.includes('yesterday') || lowerText.includes('אתמול')) {
      const yesterday = subDays(today, 1);
      return {
        start: startOfDay(yesterday),
        end: endOfDay(yesterday)
      };
    }
    
    // This week
    if (lowerText.includes('this week') || lowerText.includes('השבוע')) {
      return {
        start: startOfWeek(today),
        end: endOfWeek(today)
      };
    }
    
    // Last week
    if (lowerText.includes('last week') || lowerText.includes('שבוע שעבר')) {
      const lastWeek = subWeeks(today, 1);
      return {
        start: startOfWeek(lastWeek),
        end: endOfWeek(lastWeek)
      };
    }
    
    // This month
    if (lowerText.includes('this month') || lowerText.includes('החודש')) {
      return {
        start: startOfMonth(today),
        end: endOfMonth(today)
      };
    }
    
    // Last month
    if (lowerText.includes('last month') || lowerText.includes('חודש שעבר')) {
      const lastMonth = subMonths(today, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth)
      };
    }
    
    // Last X days
    const lastDaysMatch = text.match(/last (\d+) days?|(\d+) ימים אחרונים/i);
    if (lastDaysMatch) {
      const days = parseInt(lastDaysMatch[1] || lastDaysMatch[2]);
      return {
        start: startOfDay(subDays(today, days)),
        end: endOfDay(today)
      };
    }
    
    // Specific date formats
    const dateFormats = [
      'dd/MM/yyyy',
      'dd-MM-yyyy',
      'yyyy-MM-dd',
      'MM/dd/yyyy',
      'd MMMM yyyy',
      'MMMM d, yyyy'
    ];
    
    for (const format of dateFormats) {
      try {
        const parsed = parse(text, format, new Date());
        if (isValid(parsed)) {
          return {
            start: startOfDay(parsed),
            end: endOfDay(parsed)
          };
        }
      } catch (e) {
        // Continue to next format
      }
    }
    
    return null;
  }
}