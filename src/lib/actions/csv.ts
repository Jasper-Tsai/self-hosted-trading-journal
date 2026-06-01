import { apiGet, apiPost } from '@/lib/api-client';
import { Trade } from '@/types';
import { getTodayString } from '@/lib/utils';

const CSV_HEADERS = [
  'date', 'symbol', 'side', 'entry_time', 'entry_price',
  'exit_time', 'exit_price', 'qty', 'fuel_top', 'fuel_bottom',
  'fuel', 'sl_price', 'tp1', 'tp2', 'tp3', 'broker', 'fee', 'notes',
];

export async function exportTradesToCsv(startDate?: string, endDate?: string) {
  try {
    let trades: Trade[];
    if (startDate && endDate) {
      trades = await apiGet<Trade[]>(`/api/trades/range?start=${startDate}&end=${endDate}`);
    } else {
      trades = await apiGet<Trade[]>('/api/trades');
    }

    const csvRows: string[] = [CSV_HEADERS.join(',')];

    trades.forEach(trade => {
      const row = [
        trade.date, trade.symbol || 'MNQ', trade.side,
        trade.entry_time, trade.entry_price,
        trade.exit_time || '', trade.exit_price || '',
        trade.qty, trade.fuel_top || '', trade.fuel_bottom || '',
        trade.fuel || '', trade.sl_price || '',
        trade.tp1 || '', trade.tp2 || '', trade.tp3 || '',
        trade.broker || 'Manual', trade.fee || '',
        trade.notes ? `"${trade.notes.replace(/"/g, '""')}"` : '',
      ];
      csvRows.push(row.join(','));
    });

    const today = getTodayString();
    return {
      success: true,
      content: csvRows.join('\n'),
      filename: `trades_${startDate || 'all'}_${endDate || today}.csv`,
      count: trades.length,
    };
  } catch {
    return { success: false, error: '匯出失敗' };
  }
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current); current = '';
    } else current += char;
  }
  values.push(current);
  return values;
}

export async function importTradesFromCsv(csvContent: string) {
  try {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return { success: false, error: 'CSV 文件為空或格式不正確' };

    const headers = lines[0].split(',').map(h => h.trim());
    const dataLines = lines.slice(1);
    let imported = 0, errors = 0;
    const errorMessages: string[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      try {
        const values = parseCSVLine(dataLines[i]);
        const tradeData: Record<string, unknown> = {};

        headers.forEach((header, index) => {
          const value = values[index]?.trim();
          if (value) {
            switch (header) {
              case 'date': case 'symbol': case 'side': case 'entry_time':
              case 'exit_time': case 'broker': case 'notes':
                tradeData[header] = value;
                break;
              case 'entry_price': case 'exit_price': case 'qty':
              case 'fuel_top': case 'fuel_bottom': case 'fuel':
              case 'sl_price': case 'tp1': case 'tp2': case 'tp3': case 'fee': {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) tradeData[header] = numValue;
                break;
              }
            }
          }
        });

        if (!tradeData.date || !tradeData.side || !tradeData.entry_time || !tradeData.entry_price || !tradeData.qty) {
          errors++;
          errorMessages.push(`第 ${i + 2} 行：缺少必填欄位`);
          continue;
        }

        await apiPost('/api/trades', tradeData);
        imported++;
      } catch (error) {
        errors++;
        errorMessages.push(`第 ${i + 2} 行：${error instanceof Error ? error.message : '解析錯誤'}`);
      }
    }

    return { success: true, data: { imported, errors, errorMessages: errorMessages.slice(0, 10) } };
  } catch {
    return { success: false, error: '匯入失敗' };
  }
}
