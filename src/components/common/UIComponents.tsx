import React, { useState } from 'react';
import { 
  PlusCircle, 
  Settings, 
  Search, 
  X, 
  Check, 
  Camera 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

// StatCard Component
export const StatCard = ({ title, value, icon, onClick }: { title: string, value: string | number, icon: React.ReactNode, onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={cn(
      "bg-panel border border-line rounded-2xl p-5 card-gradient relative overflow-hidden group h-full",
      onClick && "cursor-pointer hover:border-primary/50 transition-all"
    )}
  >
    <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -mr-10 -mt-10 transition-all group-hover:scale-110" />
    <div className="flex items-center gap-3 relative h-full">
      <div className="w-10 h-10 shrink-0 rounded-xl bg-bg border border-line flex items-center justify-center">
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 18 }) : icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted font-bold uppercase tracking-tight truncate leading-tight mb-0.5">{title}</p>
        <p className="text-xl font-black truncate leading-none">{value}</p>
      </div>
    </div>
  </div>
);

// ProgressItem Component
export const ProgressItem = ({ label, value, rawValue, color }: { label: string, value: number, rawValue?: string, color: string, key?: any }) => (
  <div className="group relative space-y-1.5">
    <div className="flex justify-between text-xs">
      <span className="font-medium">{label}</span>
      <span className="text-muted">{Math.round(value)}%</span>
    </div>
    <div className="h-2 bg-bg rounded-full overflow-hidden">
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        className={cn("h-full rounded-full", color)}
      />
    </div>
    {rawValue && (
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-ink text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl border border-white/10">
        {rawValue}
      </div>
    )}
  </div>
);

// InputWithClear Component
export const InputWithClear = ({ label, value, onChange, onClear, placeholder, type = "text", configId, isVisible }: { label: string, value: any, onChange: (val: any) => void, onClear?: () => void, placeholder?: string, type?: string, configId?: string, isVisible?: (id: string) => boolean, key?: any }) => {
  if (configId && isVisible && !isVisible(configId)) return null;

  const formatCurrencyBR = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const parseCurrencyBR = (val: string) => {
    return parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
  };

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const numericValue = parseInt(rawValue, 10) / 100;
    onChange(numericValue || 0);
  };

  return (
    <div className="relative group/field">
      <label className="block text-xs font-bold text-muted mb-2 uppercase">{label}</label>
      <div className="relative">
        <input 
          type={type === 'currency' ? 'text' : type}
          className="w-full pr-10" 
          placeholder={placeholder}
          value={type === 'currency' ? formatCurrencyBR(value) : value}
          onChange={type === 'currency' ? handleCurrencyChange : e => onChange(e.target.value)}
        />
        {onClear && value && (
          <button 
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-line rounded-lg text-muted transition-all"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

// MasterDataSelector Component
export const MasterDataSelector = ({ label, value, description, options, onSelect, isVisible = true }: { label: string, value: string, description: string, options: { id: string, name: string }[], onSelect: (id: string, name: string) => void, isVisible?: boolean }) => {
  if (!isVisible) return null;
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = options.filter(o => 
    o.id.toLowerCase().includes(search.toLowerCase()) || 
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative group/field">
      <label className="block text-xs font-bold text-muted mb-2 uppercase">{label}</label>
      {value ? (
        <div className="flex items-center justify-between p-3 bg-bg border border-line rounded-xl group-hover:border-primary transition-all">
          <div>
            <p className="text-xs font-mono text-primary font-bold">{value}</p>
            <p className="text-sm font-medium">{description}</p>
          </div>
          <button 
            onClick={() => setIsOpen(true)}
            className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-all"
          >
            <Settings size={16} />
          </button>
        </div>
      ) : (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-full p-3 bg-bg border border-dashed border-line rounded-xl text-muted text-sm hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2"
        >
          <PlusCircle size={16} /> Selecionar {label}
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-panel border border-line rounded-3xl p-8 w-full max-w-lg shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black uppercase tracking-widest text-primary">Selecionar {label}</h3>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-line rounded-full transition-all">
                  <X size={24} />
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                <input 
                  type="text" 
                  className="w-full pl-10" 
                  placeholder="Buscar por código ou nome..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {filteredOptions.length === 0 ? (
                  <p className="text-center text-muted py-8">Nenhum resultado encontrado.</p>
                ) : (
                  filteredOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        onSelect(opt.id, opt.name);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group",
                        value === opt.id ? "bg-primary/10 border-primary" : "bg-bg border-line hover:border-primary/50"
                      )}
                    >
                      <div>
                        <p className="text-xs font-mono text-primary font-bold">{opt.id}</p>
                        <p className="text-sm font-bold">{opt.name}</p>
                      </div>
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                        value === opt.id ? "bg-primary border-primary text-white" : "border-line group-hover:border-primary/50"
                      )}>
                        {value === opt.id && <Check size={14} />}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// PhotoUpload Component
export const PhotoUpload = ({ value, onChange, label }: { value?: string, onChange: (val: string) => void, label: string }) => {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-muted uppercase tracking-widest">{label}</label>
      <div className="flex items-center gap-4">
        {value ? (
          <div className="relative group">
            <img src={value} alt="Preview" className="w-24 h-24 rounded-xl object-cover border border-line" referrerPolicy="no-referrer" />
            <button 
              onClick={() => onChange('')}
              className="absolute -top-2 -right-2 p-1 bg-danger text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <label className="w-24 h-24 rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary hover:text-primary transition-all text-muted">
            <Camera size={24} />
            <span className="text-[10px] font-bold uppercase">Upload</span>
            <input 
              type="file" 
              className="hidden" 
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    onChange(reader.result as string);
                  };
                  reader.readAsDataURL(file);
                }
              }} 
            />
          </label>
        )}
        <div className="flex-1">
          <p className="text-xs text-muted">Selecione uma imagem do ativo. Formatos aceitos: JPG, PNG.</p>
        </div>
      </div>
    </div>
  );
};
