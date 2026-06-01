'use client';

import React, { useState } from 'react';
import { Button } from './button';
import { toast } from 'react-hot-toast';
import { exportTradesToCsv, importTradesFromCsv } from '@/lib/actions/csv';

interface CsvManagerProps {
  type: 'trades';
  startDate?: string;
  endDate?: string;
  onImportSuccess?: () => void;
}

const CsvManager: React.FC<CsvManagerProps> = ({
  startDate, 
  endDate, 
  onImportSuccess 
}) => {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);

      const result = await exportTradesToCsv(startDate, endDate);

      if (!result.success) {
        throw new Error(result.error || '匯出失敗');
      }

      // Create download
      const blob = new Blob([result.content!], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename!;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`匯出成功！共 ${result.count} 筆記錄`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('匯出失敗，請重試');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('請選擇 CSV 檔案');
      return;
    }

    try {
      setImporting(true);

      // Read file content
      const csvContent = await file.text();

      const result = await importTradesFromCsv(csvContent);

      if (result.success) {
        const { imported, errors, errorMessages } = result.data!;

        if (errors === 0) {
          toast.success(`匯入成功！共匯入 ${imported} 筆記錄`);
        } else {
          toast.success(
            `匯入完成！成功 ${imported} 筆，失敗 ${errors} 筆`,
            { duration: 5000 }
          );

          // Show detailed error messages
          if (errorMessages && errorMessages.length > 0) {
            console.error('Import errors:', errorMessages);
            setTimeout(() => {
              toast.error(`匯入錯誤詳情:\n${errorMessages.slice(0, 5).join('\n')}`, { duration: 8000 });
            }, 1000);
          }
        }
        
        // Call success callback
        onImportSuccess?.();
      } else {
        throw new Error(result.error || '匯入失敗');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error instanceof Error ? error.message : '匯入失敗，請檢查檔案格式');
    } finally {
      setImporting(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const typeLabel = '交易記錄';
  
  return (
    <div className="bg-card rounded-lg shadow-md p-6 border">
      <h3 className="text-lg font-semibold mb-4">{typeLabel} CSV 管理</h3>
      
      <div className="space-y-4">
        {/* Export Section */}
        <div className="border-b pb-4">
          <h4 className="font-medium mb-2">匯出 CSV</h4>
          <p className="text-sm text-muted-foreground mb-3">
            {startDate && endDate 
              ? `匯出 ${startDate} 至 ${endDate} 期間的${typeLabel}`
              : `匯出所有${typeLabel}`
            }
          </p>
          <Button
            onClick={handleExport}
            disabled={exporting}
            variant="default"
          >
            {exporting ? '匯出中...' : `匯出 ${typeLabel}`}
          </Button>
        </div>

        {/* Import Section */}
        <div>
          <h4 className="font-medium mb-2">匯入 CSV</h4>
          <p className="text-sm text-muted-foreground mb-3">
            請選擇符合格式的 {typeLabel} CSV 檔案
          </p>
          
          <div className="space-y-2">
            <input
              type="file"
              accept=".csv"
              onChange={handleImport}
              disabled={importing}
              className="block w-full text-sm text-gray-500 
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-medium
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            
            {importing && (
              <p className="text-sm text-primary">匯入中，請稍候...</p>
            )}
          </div>

          {/* Format Guide */}
          <details className="mt-4">
            <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
              CSV 格式說明
            </summary>
            <div className="mt-2 p-3 bg-muted rounded text-xs text-muted-foreground">
              <div>
                <p className="font-medium mb-1">交易記錄 CSV 格式：</p>
                <p>欄位順序：交易ID, 日期, 方向(多/空), 入場時間, 入場價格, 出場時間, 出場價格, 口數, 燃料區上界, 燃料區下界, SL價格, TP1, TP2, TP3, 手續費, 滑點, 備註, 截圖</p>
                <p className="mt-1">多個標籤用分號(;)分隔</p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

export default CsvManager;
