import { Search } from 'lucide-react';
import type { FormEvent } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  onFocus?: () => void;
}

export default function SearchBar({ value, onChange, onSubmit, placeholder = 'Search the archive...', onFocus }: SearchBarProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="app-card flex items-center gap-3 rounded-full px-4 py-2.5">
      <Search className="text-amberline" size={18} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className="w-full bg-transparent font-mono text-sm tracking-[0.01em] text-cream outline-none placeholder:text-cream/35"
      />
      <button type="submit" className="vhs-button px-3 py-1.5 text-[11px] retro-tooltip" data-tooltip="Search">Search</button>
    </form>
  );
}
