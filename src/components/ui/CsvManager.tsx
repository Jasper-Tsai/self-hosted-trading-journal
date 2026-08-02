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
        throw new Error(result.error || 'Export failed');
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

      toast.success(`Exported ${result.count} trades`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed, Please try again');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
        toast.error('Please select a CSV file');
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
          toast.success(`Imported ${imported} trades`);
        } else {
          toast.success(
            `Import complete: ${imported} imported, ${errors} failed`,
            { duration: 5000 }
          );

          // Show detailed error messages
          if (errorMessages && errorMessages.length > 0) {
            console.error('Import errors:', errorMessages);
            setTimeout(() => {
              toast.error(`Import error details:\n${errorMessages.slice(0, 5).join('\n')}`, { duration: 8000 });
            }, 1000);
          }
        }

        // Call success callback
        onImportSuccess?.();
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error instanceof Error ? error.message : 'Import failed, Please check the file format');
    } finally {
      setImporting(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const typeLabel = 'Trades';

  return (
    <div className="bg-card rounded-lg shadow-md p-6 border">
      <h3 className="text-lg font-semibold mb-4">{typeLabel} CSV Manager</h3>

      <div className="space-y-4">
        {/* Export Section */}
        <div className="border-b pb-4">
          <h4 className="font-medium mb-2">Export CSV</h4>
          <p className="text-sm text-muted-foreground mb-3">
            {startDate && endDate
              ? `Export ${typeLabel} from ${startDate} to ${endDate}`
              : `Export all${typeLabel}`
            }
          </p>
          <Button
            onClick={handleExport}
            disabled={exporting}
            variant="default"
          >
            {exporting ? 'Exporting...' : `Export ${typeLabel}`}
          </Button>
        </div>

        {/* Import Section */}
        <div>
          <h4 className="font-medium mb-2">Import CSV</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Select a valid {typeLabel} CSV file.
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
              <p className="text-sm text-primary">Importing, Please wait...</p>
            )}
          </div>

          {/* Format Guide */}
          <details className="mt-4">
            <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
              CSV format
            </summary>
            <div className="mt-2 p-3 bg-muted rounded text-xs text-muted-foreground">
              <div>
                <p className="font-medium mb-1">Trades CSV format:</p>
                <p>Field order: trade ID, date, direction (LONG/SHORT), entry time, entry price, exit time, exit price, contracts, fuel zone upper bound, fuel zone lower bound, SL price, TP1, TP2, TP3, fee, slippage, notes, screenshot</p>
                <p className="mt-1">Separate multiple tags with semicolons (;).</p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

export default CsvManager;
