import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface MultiSelectProps {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

const MultiSelect = React.forwardRef<HTMLDivElement, MultiSelectProps>(
  ({ options, value, onChange, placeholder = 'Please select...', className }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);

    const toggleOption = (optionValue: string) => {
      const newValue = value.includes(optionValue)
        ? value.filter(v => v !== optionValue)
        : [...value, optionValue];
      onChange(newValue);
    };

    const selectedLabels = value
      .map(v => options.find(opt => opt.value === v)?.label)
      .filter(Boolean);

    return (
      <div ref={ref} className={cn('relative', className)}>
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full justify-between text-left font-normal"
        >
          <span className="truncate">
            {selectedLabels.length > 0
              ? selectedLabels.length > 2
                ? `${selectedLabels.slice(0, 2).join(', ')} wait ${selectedLabels.length} item`
                : selectedLabels.join(', ')
              : placeholder
            }
          </span>
          <span className="ml-2">▼</span>
        </Button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
            {options.map((option) => (
              <div
                key={option.value}
                className={cn(
                  'flex items-center px-3 py-2 cursor-pointer text-gray-200 hover:bg-gray-700',
                  value.includes(option.value) && 'bg-blue-600 text-white'
                )}
                onClick={() => toggleOption(option.value)}
              >
                <input
                  type="checkbox"
                  checked={value.includes(option.value)}
                  onChange={() => {}} // Controlled by parent click
                  className="mr-2 accent-blue-600"
                />
                <span>{option.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Backdrop to close dropdown */}
        {isOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
        )}
      </div>
    );
  }
);

MultiSelect.displayName = 'MultiSelect';

export { MultiSelect };