import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, User as FirebaseUser, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, onSnapshot, query, setDoc, updateDoc, serverTimestamp, addDoc, deleteDoc, where, getDocs } from 'firebase/firestore';
import { db, auth } from './lib/firebase';
import { 
  LayoutDashboard, 
  PlusCircle, 
  ArrowLeftRight, 
  Trash2, 
  ArrowLeft,
  Package, 
  FileText, 
  BarChart3, 
  Settings, 
  Users, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  Bell,
  User as UserIcon,
  Sun,
  Moon,
  Camera,
  History,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Shield,
  Clock,
  Download,
  Plus,
  Filter,
  Building2,
  MapPin,
  MoreVertical,
  Edit,
  ArrowUpRight,
  ArrowDownRight,
  Briefcase,
  Calendar,
  Info,
  Save,
  Upload,
  Eye,
  EyeOff,
  Lock,
  X,
  Check,
  AlertTriangle,
  CheckCircle,
  ClipboardCheck,
  Smartphone,
  Menu,
  PieChart as PieChartIcon,
  Sparkles,
  QrCode,
  FileCheck,
  Send,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Globe,
  Layers,
  Cpu,
  Mail,
  Phone,
  ArrowRight,
  Zap,
  Anchor,
  ArrowUp,
  MessageCircle,
  Instagram,
  Linkedin,
  Facebook,
  Monitor,
  Target,
  Rocket,
  Headphones,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import * as d3 from 'd3';
import Papa from 'papaparse';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  BarChart,
  Bar
} from 'recharts';
import { 
  User, 
  Asset, 
  Movement, 
  Supplier, 
  FieldConfig, 
  BaixaRequest, 
  UserRole,
  Company,
  Branch,
  AccountingAccount,
  AssetClass,
  CostCenter,
  NCM,
  AssetHistory,
  InventorySession,
  AuditLog
} from './types';
import { cn } from './lib/utils';
import { DEFAULT_FIELD_CONFIG, NCM_DATA, COST_CENTERS, ACCOUNTS, CLASSES } from './constants';
import { INITIAL_ASSETS, INITIAL_COMPANIES } from './data/mockData';
import { 
  StatCard, 
  ProgressItem, 
  InputWithClear, 
  MasterDataSelector, 
  PhotoUpload 
} from './components/common/UIComponents';
import { exportToPDF } from './utils/pdfExport';
import { useAssetAlerts } from './hooks/useAssetAlerts';
import { useAuditLog } from './hooks/useAuditLog';
import { queryAssetData, getExecutiveSummary, extractInvoiceData, chatWithAI } from './services/geminiService';
import { AssetLabel } from './components/AssetLabel';

const INCENTIVE_LABELS: Record<string, string> = {
  incentivosCreditos: "Incentivos / Créditos fiscais",
  ciap: "CIAP",
  depIncentivada: "Depreciação incentivada",
  depCSLL: "Depreciação CSLL",
  depAcelerada: "Depreciação acelerada",
  recap: "RECAP",
  creditoImediato: "Crédito imediato",
  drawback: "Drawback",
  sudamSudene: "SUDAM / SUDENE",
  zfm: "Zona Franca de Manaus (ZFM)",
  repes: "REPES",
  others: "Outros"
};

// Initial data is imported from ./data/mockData

// Components imported from components/common/UIComponents.tsx

const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar.');
    return;
  }
  const headers = Object.keys(data[0]).join(';');
  const rows = data.map(obj => 
    Object.values(obj).map(val => 
      typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
    ).join(';')
  ).join('\n');
  
  // Adiciona BOM (Byte Order Mark) para UTF-8 para que o Excel reconheça acentos corretamente
  const csvContent = "\uFEFF" + headers + "\n" + rows;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const calculateDepreciation = (asset: Asset, targetDate: string, method: 'FISCAL' | 'ACCOUNTING', currency: 'BRL' | 'USD') => {
  const [acqYear, acqMonthOneIndexed] = asset.acquisitionDate.split('-').map(Number);
  const acqMonth = acqMonthOneIndexed - 1;
  
  const [repYear, repMonthOneIndexed] = targetDate.split('-').map(Number);
  const repMonth = repMonthOneIndexed - 1;
  
  // Depreciation starts in the month following acquisition
  let startYear = acqYear;
  let startMonth = acqMonth + 1;
  if (startMonth > 11) {
    startMonth = 0;
    startYear++;
  }
  
  // Report date considers the month of the target date
  let endYear = repYear;
  let endMonth = repMonth;

  const acqVal = currency === 'BRL' ? asset.acquisitionValueBRL : asset.acquisitionValueUSD;
  const resVal = currency === 'BRL' ? asset.residualValueBRL : asset.residualValueUSD;

  if (endYear < startYear || (endYear === startYear && endMonth < startMonth)) {
    return { accumulated: 0, bookValue: acqVal };
  }

  const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  
  const usefulLifeMonths = method === 'FISCAL' ? asset.fiscalUsefulLifeMonths : asset.accountingUsefulLifeMonths;
  const depreciableAmount = acqVal - resVal;
  const monthlyDep = usefulLifeMonths > 0 ? depreciableAmount / usefulLifeMonths : 0;
  
  const accumulated = Math.min(depreciableAmount, monthlyDep * monthsDiff);
  const bookValue = acqVal - accumulated;
  
  return { accumulated, bookValue };
};

function BIAnalyticsView({ assets, movements, currency, reportDate, depreciationMethod, companies, branches }: { assets: Asset[], movements: Movement[], currency: 'BRL' | 'USD', reportDate: string, depreciationMethod: 'FISCAL' | 'ACCOUNTING', companies: Company[], branches: Branch[] }) {
  const [proportionType, setProportionType] = useState<'empresa' | 'filial' | 'custo' | 'conta'>('conta');

  useEffect(() => {
    const types: ('empresa' | 'filial' | 'custo' | 'conta')[] = ['empresa', 'filial', 'custo', 'conta'];
    const interval = setInterval(() => {
      setProportionType(prev => {
        const nextIndex = (types.indexOf(prev) + 1) % types.length;
        return types[nextIndex];
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const totals = assets.reduce((acc, a) => {
    const acqVal = currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD;
    const { accumulated, bookValue } = calculateDepreciation(a, reportDate, depreciationMethod, currency);
    return {
      acquisition: acc.acquisition + acqVal,
      accumulated: acc.accumulated + accumulated,
      bookValue: acc.bookValue + bookValue
    };
  }, { acquisition: 0, accumulated: 0, bookValue: 0 });

  const avgValue = assets.length > 0 ? totals.acquisition / assets.length : 0;
  
  const formatValue = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency 
    }).format(val);
  };

  const distributionCounts: Record<string, { count: number, totalValue: number }> = {};
  
  assets.forEach(a => {
    let key = 'Outros';
    if (proportionType === 'empresa') {
      const company = companies.find(c => c.id === a.companyId);
      key = company?.name || 'Outros';
    }
    else if (proportionType === 'filial') {
      const branch = branches.find(b => b.id === a.branchId);
      key = branch?.name || 'Outros';
    }
    else if (proportionType === 'custo') key = a.costCenterDescription || 'Outros';
    else if (proportionType === 'conta') key = a.accountDescription || 'Outros';

    if (!distributionCounts[key]) {
      distributionCounts[key] = { count: 0, totalValue: 0 };
    }
    distributionCounts[key].count += 1;
    distributionCounts[key].totalValue += (currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD);
  });
  
  const distributionData = Object.entries(distributionCounts).map(([label, data]) => ({
    label,
    percentage: Math.round((data.count / assets.length) * 100),
    count: data.count,
    totalValue: data.totalValue
  })).sort((a, b) => b.totalValue - a.totalValue);

  const movementsByType = movements.reduce((acc: any, m) => {
    acc[m.type] = (acc[m.type] || 0) + 1;
    return acc;
  }, {});

  const movementTypeData = Object.entries(movementsByType).map(([name, value]) => ({ name, value: value as number }));

  const baixasByType = assets.filter(a => a.status === 'BAIXADO').reduce((acc: any, a) => {
    // Since we don't have reason in Asset, we'll use a placeholder or just count
    acc['Geral'] = (acc['Geral'] || 0) + 1;
    return acc;
  }, {});
  const baixaTypeData = Object.entries(baixasByType).map(([name, value]) => ({ name, value: value as number }));

  const monthlyData = [
    { month: 'Jan', valor: 1200000 * (currency === 'USD' ? 0.2 : 1) },
    { month: 'Fev', valor: 1500000 * (currency === 'USD' ? 0.2 : 1) },
    { month: 'Mar', valor: 1100000 * (currency === 'USD' ? 0.2 : 1) },
    { month: 'Abr', valor: 1800000 * (currency === 'USD' ? 0.2 : 1) },
    { month: 'Mai', valor: 2100000 * (currency === 'USD' ? 0.2 : 1) },
    { month: 'Jun', valor: 1900000 * (currency === 'USD' ? 0.2 : 1) },
  ];

  const COLORS = ['#60a5fa', '#34d399', '#f87171', '#fbbf24', '#a855f7'];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black">Business Intelligence</h2>
          <p className="text-muted text-sm">Visão estratégica e análise profunda do patrimônio.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => exportToCSV(assets.map(a => {
              const { accumulated, bookValue } = calculateDepreciation(a, reportDate, depreciationMethod, currency);
              return {
                'ID': a.id,
                'Nome': a.name,
                'V. Aquisição': currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD,
                'Depr. Acumulada': accumulated,
                'Valor Contábil': bookValue,
                'Status': a.status
              };
            }), 'bi-analytics')}
            className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold flex items-center gap-2"
          >
            <Download size={16} /> Exportar CSV
          </button>
          <button 
            onClick={() => alert('Exportando PDF...')}
            className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Download size={16} /> Exportar PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total de Ativos" value={assets.length} icon={<Package className="text-primary" />} />
        <StatCard title="Valor Total Ativo" value={formatValue(totals.acquisition)} icon={<TrendingUp className="text-success" />} />
        <StatCard title="Depreciação Acumulada" value={formatValue(totals.accumulated)} icon={<TrendingDown className="text-danger" />} />
        <StatCard title="Valor Contábil" value={formatValue(totals.bookValue)} icon={<Shield className="text-purple-500" />} />
        <StatCard title="Ticket Médio" value={formatValue(avgValue)} icon={<BarChart3 className="text-amber-500" />} />
        <StatCard title="Total de Baixas" value={assets.filter(a => a.status === 'BAIXADO').length} icon={<Trash2 className="text-danger" />} />
        <StatCard title="Movimentações" value={movements.length} icon={<ArrowLeftRight className="text-primary" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-panel border border-line rounded-3xl p-8 card-gradient">
          <h3 className="font-bold uppercase tracking-widest text-primary mb-8">Investimentos por Mês</h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#22304f" vertical={false} />
                <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${currency === 'BRL' ? 'R$' : '$'} ${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111a2e', border: '1px solid #22304f', borderRadius: '12px' }}
                  formatter={(v: number) => formatValue(v)}
                />
                <Area type="monotone" dataKey="valor" stroke="#60a5fa" fillOpacity={1} fill="url(#colorValor)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-panel border border-line rounded-3xl p-8 card-gradient">
          <div className="flex flex-col mb-8">
            <h3 className="font-bold uppercase tracking-widest text-success mb-1">Distribuição por Valor</h3>
            <p className="text-lg font-black uppercase text-white">
              {proportionType === 'empresa' && 'Por Empresa'}
              {proportionType === 'filial' && 'Por Filial'}
              {proportionType === 'custo' && 'Por Centro de Custo'}
              {proportionType === 'conta' && 'Por Conta Contábil'}
            </p>
          </div>
          <div className="space-y-6">
            {distributionData.length === 0 ? (
              <p className="text-center text-muted py-8 italic">Sem dados para exibição.</p>
            ) : (
              distributionData.slice(0, 6).map((item, idx) => (
                <ProgressItem 
                  key={item.label} 
                  label={item.label} 
                  value={item.percentage} 
                  rawValue={formatValue(item.totalValue)}
                  color={['bg-primary', 'bg-success', 'bg-amber-400', 'bg-danger', 'bg-purple-500', 'bg-blue-400'][idx % 6]} 
                />
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-panel border border-line rounded-3xl p-8 card-gradient">
          <h3 className="font-bold uppercase tracking-widest text-amber-400 mb-6">Alerta de Manutenção</h3>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center justify-between p-4 bg-bg rounded-xl border border-line">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-400/10 flex items-center justify-center text-amber-400">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Máquina Industrial #{i}04</p>
                    <p className="text-[10px] text-muted uppercase">Vencimento em 5 dias</p>
                  </div>
                </div>
                <button className="text-xs font-bold text-primary hover:underline">Agendar</button>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-panel border border-line rounded-3xl p-8 card-gradient">
          <h3 className="font-bold uppercase tracking-widest text-purple-500 mb-6">Ativos por Localização</h3>
          <div className="space-y-4">
            {['Sede SP', 'Filial RJ', 'Centro Logístico MG'].map((loc, idx) => (
              <div key={loc} className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span>{loc}</span>
                  <span>{75 - idx * 20}%</span>
                </div>
                <div className="h-2 bg-bg rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${75 - idx * 20}%` }}
                    className={cn("h-full", idx === 0 ? "bg-purple-500" : idx === 1 ? "bg-primary" : "bg-success")}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-panel border border-line rounded-3xl p-8 card-gradient">
          <h3 className="font-bold uppercase tracking-widest text-primary mb-8">Movimentações por Tipo</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={movementTypeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#22304f" horizontal={false} />
                <XAxis type="number" stroke="#9ca3af" fontSize={10} hide />
                <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={10} width={100} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111a2e', border: '1px solid #22304f', borderRadius: '12px' }}
                />
                <Bar dataKey="value" fill="#60a5fa" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-panel border border-line rounded-3xl p-8 card-gradient">
          <h3 className="font-bold uppercase tracking-widest text-danger mb-8">Baixas por Tipo</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={baixaTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {baixaTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111a2e', border: '1px solid #22304f', borderRadius: '12px' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function InventoryView({ 
  assets, 
  sessions, 
  onSaveSession,
  companies,
  branches,
  users,
  user
}: { 
  assets: Asset[], 
  sessions: InventorySession[],
  onSaveSession: (s: InventorySession) => void,
  companies: Company[],
  branches: Branch[],
  users: User[],
  user: User
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInventory, setSelectedInventory] = useState<InventorySession | null>(null);
  const [isMobileColeta, setIsMobileColeta] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [coletaSearch, setColetaSearch] = useState('');
  const [localizados, setLocalizados] = useState<string[]>([]);

  const [newSession, setNewSession] = useState<Partial<InventorySession>>({
    id: `INV-${new Date().getFullYear()}-${(sessions.length + 1).toString().padStart(3, '0')}`,
    date: new Date().toISOString().split('T')[0],
    deadline: '',
    companyId: '',
    branchId: '',
    executorId: '',
    status: 'PLANEJADO'
  });
  
  const stats: { title: string, value: string | number, icon: React.ReactNode }[] = [
    { title: 'Total de Ativos', value: assets.length, icon: <Package className="text-primary" /> },
    { title: 'Localizados', value: '98.5%', icon: <CheckCircle className="text-success" /> },
    { title: 'Divergências', value: 18, icon: <AlertTriangle className="text-amber-400" /> },
    { title: 'Acuracidade', value: '99.2%', icon: <TrendingUp className="text-purple-500" /> },
  ];

  const handleSaveNewSession = () => {
    if (!newSession.companyId || !newSession.branchId || !newSession.executorId || !newSession.deadline) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    const company = companies.find(c => c.id === newSession.companyId);
    const branch = branches.find(b => b.id === newSession.branchId);
    const user = users.find(u => u.id === newSession.executorId);

    const session: InventorySession = {
      ...(newSession as InventorySession),
      companyName: company?.name || '',
      branchName: branch?.name || '',
      executorName: user?.name || '',
      totalItems: assets.filter(a => a.branchId === newSession.branchId).length,
      found: 0,
      missing: 0,
      surplus: 0,
      retired: 0,
      accuracy: 0
    };

    onSaveSession(session);
    setIsCreatingSession(false);
    setNewSession({
      id: `INV-${new Date().getFullYear()}-${(sessions.length + 2).toString().padStart(3, '0')}`,
      date: new Date().toISOString().split('T')[0],
      deadline: '',
      companyId: '',
      branchId: '',
      executorId: '',
      status: 'PLANEJADO'
    });
  };

  if (selectedInventory) {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedInventory(null)} className="p-2 bg-line hover:bg-line/80 rounded-xl">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h2 className="text-2xl font-black">Detalhes do Inventário: {selectedInventory.id}</h2>
              <p className="text-muted text-sm">Realizado em {new Date(selectedInventory.date).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => exportToCSV([selectedInventory], `inventory-details-${selectedInventory.id}`)}
              className="px-4 py-2 bg-line hover:bg-primary/20 text-primary rounded-xl font-bold flex items-center gap-2"
            >
              <Download size={18} /> Exportar Relatório
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCard title="Localizados" value={selectedInventory.found || 0} icon={<CheckCircle className="text-success" />} />
          <StatCard title="Não Localizados" value={selectedInventory.missing || 0} icon={<AlertTriangle className="text-danger" />} />
          <StatCard title="Sobre física" value={selectedInventory.surplus || 0} icon={<PlusCircle className="text-primary" />} />
          <StatCard title="Baixados" value={selectedInventory.retired || 0} icon={<Trash2 className="text-amber-400" />} />
        </div>

        <div className="bg-panel border border-line rounded-3xl p-6 card-gradient space-y-4">
          <h3 className="font-bold uppercase tracking-widest text-xs">Parâmetros do Inventário</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] text-muted uppercase font-bold">Empresa</p>
              <p className="font-bold">{selectedInventory.companyName}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase font-bold">Filial</p>
              <p className="font-bold">{selectedInventory.branchName}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase font-bold">Executor</p>
              <p className="font-bold">{selectedInventory.executorName}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase font-bold">Prazo Final</p>
              <p className="font-bold text-danger">{new Date(selectedInventory.deadline).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>

        <div className="bg-panel border border-line rounded-3xl overflow-hidden card-gradient">
          <div className="p-6 border-b border-line bg-bg/30">
            <h3 className="font-bold uppercase tracking-widest text-xs">Itens do Inventário</h3>
          </div>
          <div className="p-8 text-center text-muted">
            <ClipboardCheck size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-bold">Listagem detalhada dos itens conciliados neste inventário.</p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">Módulo de Inventário</h2>
          <p className="text-muted text-sm">Controle físico e conciliação de ativos em tempo real.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsMobileColeta(true)}
            className="flex-1 sm:flex-none px-6 py-2 bg-success/10 text-success rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <Smartphone size={20} /> Coleta Mobile
          </button>
          {(user.role === 'ADMINISTRADOR' || user.role === 'GESTOR' || user.role === 'ANALISTA') && (
            <button 
              onClick={() => setIsCreatingSession(true)}
              className="flex-1 sm:flex-none px-6 py-2 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold flex items-center justify-center gap-2"
            >
              <PlusCircle size={20} /> Novo Inventário
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {stats.map((s, i) => (
          <div key={i} className="bg-panel border border-line rounded-3xl p-6 card-gradient flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-bg flex items-center justify-center shadow-inner">
              {s.icon}
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase font-bold tracking-wider">{s.title}</p>
              <p className="text-2xl font-black">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-panel border border-line rounded-3xl overflow-hidden card-gradient">
        <div className="p-6 border-b border-line flex items-center justify-between bg-bg/30">
          <h3 className="font-bold uppercase tracking-widest text-xs">Histórico de Inventários</h3>
          <div className="flex items-center gap-2 bg-bg border border-line px-3 py-1.5 rounded-xl">
            <Search size={14} className="text-muted" />
            <input 
              type="text" 
              placeholder="Buscar inventário..." 
              className="bg-transparent border-none text-xs focus:ring-0 outline-none w-32"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-muted uppercase border-b border-line bg-bg/10">
                <th className="p-6 font-bold">ID / Data</th>
                <th className="p-6 font-bold">Empresa / Filial</th>
                <th className="p-6 font-bold">Executor / Prazo</th>
                <th className="p-6 font-bold text-center">Acuracidade</th>
                <th className="p-6 font-bold text-center">Status</th>
                <th className="p-6 font-bold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sessions.filter(s => s.id.toLowerCase().includes(searchTerm.toLowerCase())).map(session => (
                <tr key={session.id} className="border-b border-line/50 hover:bg-line/20 transition-all group">
                  <td className="p-6">
                    <p className="font-bold text-primary">{session.id}</p>
                    <p className="text-xs text-muted">{new Date(session.date).toLocaleDateString('pt-BR')}</p>
                  </td>
                  <td className="p-6">
                    <p className="font-bold text-xs">{session.companyName}</p>
                    <p className="text-[10px] text-muted uppercase">{session.branchName}</p>
                  </td>
                  <td className="p-6">
                    <p className="font-bold text-xs">{session.executorName}</p>
                    <p className="text-[10px] text-danger uppercase font-bold">Até {new Date(session.deadline).toLocaleDateString('pt-BR')}</p>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col items-center gap-1">
                      <p className="font-black text-lg">{session.accuracy}%</p>
                      <div className="w-24 h-1.5 bg-bg rounded-full overflow-hidden">
                        <div className="h-full bg-success rounded-full" style={{ width: `${session.accuracy}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      session.status === 'CONCLUÍDO' ? "bg-success/10 text-success" : 
                      session.status === 'EM ANDAMENTO' ? "bg-primary/10 text-primary" : "bg-line text-muted"
                    )}>
                      {session.status}
                    </span>
                  </td>
                  <td className="p-6">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => setSelectedInventory(session)}
                        className="p-2 hover:bg-primary/20 text-primary rounded-lg transition-all"
                        title="Ver Detalhes"
                      >
                        <Search size={18} />
                      </button>
                      <button className="p-2 hover:bg-line rounded-lg transition-all text-muted" title="Relatório PDF">
                        <FileText size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isCreatingSession && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-panel border border-line rounded-3xl p-8 max-w-2xl w-full shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black">Novo Processo de Inventário</h3>
                <p className="text-muted text-sm">Configure os parâmetros para a nova coleta física.</p>
              </div>
              <button onClick={() => setIsCreatingSession(false)} className="p-2 hover:bg-line rounded-xl">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase">ID do Inventário</label>
                <input 
                  type="text" 
                  value={newSession.id} 
                  readOnly
                  className="w-full bg-bg border-line opacity-50 cursor-not-allowed" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase">Data de Início</label>
                <input 
                  type="date" 
                  value={newSession.date} 
                  onChange={e => setNewSession({...newSession, date: e.target.value})}
                  className="w-full" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase">Empresa</label>
                <select 
                  value={newSession.companyId} 
                  onChange={e => setNewSession({...newSession, companyId: e.target.value, branchId: ''})}
                  className="w-full"
                >
                  <option value="">Selecione a Empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase">Filial</label>
                <select 
                  value={newSession.branchId} 
                  onChange={e => setNewSession({...newSession, branchId: e.target.value})}
                  className="w-full"
                  disabled={!newSession.companyId}
                >
                  <option value="">Selecione a Filial</option>
                  {branches.filter(b => b.companyId === newSession.companyId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase">Executor (Responsável)</label>
                <select 
                  value={newSession.executorId} 
                  onChange={e => setNewSession({...newSession, executorId: e.target.value})}
                  className="w-full"
                >
                  <option value="">Selecione o Executor</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase">Prazo Final (Deadline)</label>
                <input 
                  type="date" 
                  value={newSession.deadline} 
                  onChange={e => setNewSession({...newSession, deadline: e.target.value})}
                  className="w-full" 
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setIsCreatingSession(false)}
                className="flex-1 px-6 py-3 bg-line hover:bg-line/80 rounded-xl font-bold transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveNewSession}
                className="flex-1 px-6 py-3 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all"
              >
                Criar Inventário
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isMobileColeta && (
        <div className="fixed inset-0 bg-bg z-[200] flex flex-col">
          <div className="p-4 border-b border-line flex items-center justify-between bg-panel">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsMobileColeta(false)} className="p-2 hover:bg-line rounded-lg">
                <ChevronLeft size={20} />
              </button>
              <h3 className="font-black">Coleta Mobile</h3>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted uppercase font-bold">Localizados</p>
              <p className="text-sm font-black text-success">{localizados.length}</p>
            </div>
          </div>
          
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
              <input 
                type="text" 
                placeholder="Escaneie ou digite o código..." 
                className="w-full pl-12 pr-4 py-4 bg-panel border border-line rounded-2xl text-lg font-bold"
                value={coletaSearch}
                onChange={e => setColetaSearch(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              {assets.filter(a => 
                a.id.toLowerCase().includes(coletaSearch.toLowerCase()) || 
                a.name.toLowerCase().includes(coletaSearch.toLowerCase()) ||
                a.tag?.toLowerCase().includes(coletaSearch.toLowerCase())
              ).slice(0, 10).map(asset => (
                <div key={`${asset.id}-${asset.sub}`} className="p-4 bg-panel border border-line rounded-2xl flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-primary font-bold">{asset.id}/{asset.sub}</p>
                    <p className="font-bold truncate">{asset.name}</p>
                    <p className="text-[10px] text-muted uppercase">{asset.costCenterDescription} • {asset.location}</p>
                  </div>
                  <button 
                    onClick={() => {
                      if (!localizados.includes(asset.id)) {
                        setLocalizados([...localizados, asset.id]);
                        setColetaSearch('');
                      }
                    }}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                      localizados.includes(asset.id) ? "bg-success text-white" : "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                  >
                    {localizados.includes(asset.id) ? <CheckCircle size={24} /> : <Plus size={24} />}
                  </button>
                </div>
              ))}
              {coletaSearch && assets.filter(a => a.id.toLowerCase().includes(coletaSearch.toLowerCase())).length === 0 && (
                <div className="text-center py-12 text-muted">
                  <AlertTriangle size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="font-bold">Ativo não encontrado.</p>
                  <p className="text-xs">Verifique o código ou tente buscar pelo nome.</p>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-line bg-panel">
            <button 
              onClick={() => {
                alert(`Inventário sincronizado com sucesso! ${localizados.length} itens localizados.`);
                setIsMobileColeta(false);
              }}
              className="w-full py-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20"
            >
              Finalizar e Sincronizar
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ReportsView({ 
  assets, 
  currency, 
  baixaRequests, 
  movements,
  reportDate, 
  setReportDate, 
  depreciationMethod,
  companies,
  branches,
  accounts
}: { 
  assets: Asset[], 
  currency: 'BRL' | 'USD', 
  baixaRequests: BaixaRequest[], 
  movements: Movement[],
  reportDate: string, 
  setReportDate: (d: string) => void, 
  depreciationMethod: 'FISCAL' | 'ACCOUNTING',
  companies: Company[],
  branches: Branch[],
  accounts: AccountingAccount[]
}) {
  const [reportType, setReportType] = useState('geral');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('all');
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [appliedCompanyId, setAppliedCompanyId] = useState('all');
  const [appliedBranchId, setAppliedBranchId] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'id', direction: 'asc' });
  
  const formatValue = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency 
    }).format(val);
  };

  const reports = [
    { id: 'geral', label: 'Inventário', icon: <Package size={14} /> },
    { id: 'aquisicoes', label: 'Aquisições', icon: <PlusCircle size={14} /> },
    { id: 'movimentacoes', label: 'Movimentações', icon: <ArrowLeftRight size={14} /> },
    { id: 'baixas', label: 'Baixas', icon: <Trash2 size={14} /> },
    { id: 'notas_explicativas', label: 'Notas Explicativas', icon: <FileText size={14} /> },
    { id: 'documentos', label: 'Documentos', icon: <FileText size={14} /> },
    { id: 'seguros', label: 'Seguros', icon: <Shield size={14} /> },
    { id: 'leasing', label: 'Leasing', icon: <DollarSign size={14} /> },
    { id: 'manutencao', label: 'Manutenção', icon: <Clock size={14} /> },
    { id: 'fiscal', label: 'NCM', icon: <FileText size={14} /> },
  ];

  const getExportData = () => {
    if (reportType === 'notas_explicativas') {
      return notasExplicativasData.map((r: any) => ({
        'Conta Contábil': r.accountCode,
        'Descrição da Conta': r.accountDescription,
        'Saldo Inicial': formatValue(r.initialBalance),
        'Adições': formatValue(r.additions),
        'Baixas': formatValue(r.disposals),
        'Transferências': formatValue(r.transfers),
        'Saldo Final': formatValue(r.finalBalance)
      }));
    }

    return displayData.map((a: any) => {
      const { accumulated, bookValue } = calculateDepreciation(a, reportDate, depreciationMethod, currency);
      
      const baseData: any = {
        'Imobilizado': `${a.id}/${a.sub}`,
        'Data Aquisição': new Date(a.acquisitionDate).toLocaleDateString('pt-BR'),
        'Denominação': a.name,
        'Classe': a.classDescription,
        'C. Custo': a.costCenterDescription,
        'V. Aquisição': formatValue(currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD),
        'Depr. Acumulada': formatValue(accumulated),
        'Valor Contábil': formatValue(bookValue),
        'Status': a.status.replace('_', ' ')
      };

      if (reportType === 'aquisicoes') {
        baseData['NF-e'] = a.nfe || '-';
        baseData['Fornecedor'] = a.vendorName || '-';
      }

      if (reportType === 'movimentacoes') {
        baseData['ID Movimentação'] = a.movementId || '-';
        baseData['Tipo Movimentação'] = a.movementType || '-';
      }

      if (reportType === 'baixas') {
        const request = baixaRequests.find(r => r.assetId === a.id && r.assetSub === a.sub);
        baseData['Data Baixa'] = a.deactivationDate ? new Date(a.deactivationDate).toLocaleDateString('pt-BR') : '-';
        baseData['Motivo'] = request?.reason || a.deactivationReason || '-';
      }

      if (reportType === 'documentos') {
        baseData['ID Chamado'] = a.movementId || '-';
        baseData['Data Saída'] = a.movementDate ? new Date(a.movementDate).toLocaleDateString('pt-BR') : '-';
        baseData['Dias Fora'] = `${a.daysOut || 0} dias`;
      }

      if (reportType === 'seguros') {
        baseData['Seguradora'] = a.insurance?.companyName || a.insurance?.company || '-';
        baseData['Fim Vigência'] = a.insurance?.endDate ? new Date(a.insurance.endDate).toLocaleDateString('pt-BR') : '-';
      }

      if (reportType === 'leasing') {
        baseData['Contrato'] = a.leasing?.contractNumber || '-';
        baseData['Fim Contrato'] = a.leasing?.endDate ? new Date(a.leasing.endDate).toLocaleDateString('pt-BR') : '-';
      }

      if (reportType === 'manutencao') {
        baseData['Próxima Manut.'] = a.maintenance?.nextMaintenanceDate ? new Date(a.maintenance.nextMaintenanceDate).toLocaleDateString('pt-BR') : '-';
        baseData['Programação'] = a.maintenance?.programming || '-';
      }

      if (reportType === 'fiscal') {
        baseData['NCM'] = a.ncm || '-';
        baseData['Taxa Fiscal'] = `${((a.fiscalAnnualRate || 0) * 100).toFixed(2)}%`;
      }

      return baseData;
    });
  };

  const getDepreciationAccount = (code: string, desc: string) => {
    return {
      code: code.startsWith('10') ? '11' + code.slice(2) : `11${code.slice(2)}`,
      description: `(-) Depreciação - ${desc}`
    };
  };

  const calculateNotasExplicativas = () => {
    const reportYear = new Date(reportDate).getFullYear();
    const prevYearEnd = `${reportYear - 1}-12-31`;
    const currentYearStart = `${reportYear}-01-01`;
    
    const rowsMap: { [key: string]: any } = {};
    
    const getRow = (code: string, desc: string) => {
      if (!rowsMap[code]) {
        rowsMap[code] = {
          accountCode: code,
          accountDescription: desc,
          initialBalance: 0,
          additions: 0,
          disposals: 0,
          transfers: 0,
          finalBalance: 0
        };
      }
      return rowsMap[code];
    };

    // Pre-populate with all accounts
    accounts.forEach(acc => getRow(acc.code, acc.description));

    assets.filter(a => {
      if (appliedCompanyId !== 'all' && a.companyId !== appliedCompanyId) return false;
      if (appliedBranchId !== 'all' && a.branchId !== appliedBranchId) return false;
      return true;
    }).forEach(asset => {
      const acqVal = currency === 'BRL' ? asset.acquisitionValueBRL : asset.acquisitionValueUSD;
      const isDepreciationAccount = asset.accountCode.startsWith('11');
      
      // 1. Gross Value (Cost)
      const costRow = getRow(asset.accountCode, asset.accountDescription);
      
      if (asset.acquisitionDate < currentYearStart && (!asset.deactivationDate || asset.deactivationDate >= currentYearStart)) {
        costRow.initialBalance += acqVal;
      }
      if (asset.acquisitionDate >= currentYearStart && asset.acquisitionDate <= reportDate) {
        costRow.additions += acqVal;
      }
      if (asset.deactivationDate && asset.deactivationDate >= currentYearStart && asset.deactivationDate <= reportDate) {
        costRow.disposals += acqVal;
      }
      
      asset.history.forEach(h => {
        if (h.type === 'TRANSFERENCIA' && h.date >= currentYearStart && h.date <= reportDate) {
          if (h.newValue === asset.accountCode) costRow.transfers += acqVal;
          if (h.previousValue === asset.accountCode) costRow.transfers -= acqVal;
        }
      });

      // 2. Accumulated Depreciation
      const { code: depCode, description: depDesc } = getDepreciationAccount(asset.accountCode, asset.accountDescription);
      const depRow = getRow(depCode, depDesc);
      
      const { accumulated: accStart } = calculateDepreciation(asset, prevYearEnd, depreciationMethod, currency);
      const { accumulated: accEnd } = calculateDepreciation(asset, reportDate, depreciationMethod, currency);
      
      if (asset.acquisitionDate < currentYearStart && (!asset.deactivationDate || asset.deactivationDate >= currentYearStart)) {
        depRow.initialBalance -= accStart;
      }
      
      // Depreciation of the period is moved to "Baixas" for depreciation accounts per user request
      if (!asset.deactivationDate || asset.deactivationDate >= currentYearStart) {
        const { accumulated: accYearStart } = calculateDepreciation(asset, currentYearStart, depreciationMethod, currency);
        const periodDep = accEnd - accYearStart;
        if (periodDep > 0) {
          depRow.disposals -= periodDep; 
        }
      }
      
      if (asset.deactivationDate && asset.deactivationDate >= currentYearStart && asset.deactivationDate <= reportDate) {
        const { accumulated: accAtDeactivation } = calculateDepreciation(asset, asset.deactivationDate, depreciationMethod, currency);
        depRow.disposals += accAtDeactivation; 
      }

      asset.history.forEach(h => {
        if (h.type === 'TRANSFERENCIA' && h.date >= currentYearStart && h.date <= reportDate) {
          const { accumulated } = calculateDepreciation(asset, h.date, depreciationMethod, currency);
          const { code: prevDepCode, description: prevDepDesc } = getDepreciationAccount(h.previousValue as string, '');
          const { code: nextDepCode, description: nextDepDesc } = getDepreciationAccount(h.newValue as string, '');
          
          if (h.newValue === asset.accountCode) {
            getRow(nextDepCode, nextDepDesc).transfers -= accumulated;
          }
          if (h.previousValue === asset.accountCode) {
            getRow(prevDepCode, prevDepDesc).transfers += accumulated;
          }
        }
      });
    });

    return Object.values(rowsMap)
      .filter(row => row.initialBalance !== 0 || row.additions !== 0 || row.disposals !== 0 || row.transfers !== 0)
      .map(row => ({
        ...row,
        finalBalance: row.initialBalance + row.additions + (row.accountCode.startsWith('11') ? row.disposals : -row.disposals) + row.transfers
      })).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  };

  const notasExplicativasData = calculateNotasExplicativas();

  const filteredAssets = assets.filter(a => {
    if (appliedCompanyId !== 'all' && a.companyId !== appliedCompanyId) return false;
    if (appliedBranchId !== 'all' && a.branchId !== appliedBranchId) return false;

    if (reportType === 'aquisicoes') {
      if (a.status === 'BAIXADO') return false;
      if (appliedStartDate && a.acquisitionDate < appliedStartDate) return false;
      if (appliedEndDate && a.acquisitionDate > appliedEndDate) return false;
      return true;
    }

    if (reportType === 'baixas') {
      if (a.status !== 'BAIXADO') return false;
      if (appliedStartDate && a.deactivationDate && a.deactivationDate < appliedStartDate) return false;
      if (appliedEndDate && a.deactivationDate && a.deactivationDate > appliedEndDate) return false;
      return true;
    }

    if (reportType === 'geral') {
      // Inventário Geral: Trazer tudo
      return true;
    }

    if (reportType === 'notas_explicativas') {
      if (a.acquisitionDate > reportDate) return false;
      if (a.deactivationDate && a.deactivationDate <= reportDate) return false;
      return true;
    }

    if (reportType === 'movimentacoes') {
      // Will be handled in displayDataRaw
      return false; 
    }

    if (appliedStartDate && a.acquisitionDate < appliedStartDate) return false;
    if (appliedEndDate && a.acquisitionDate > appliedEndDate) return false;
    return true;
  });

  const displayDataRaw = (() => {
    if (reportType === 'aquisicoes') {
      // Add ALTERACAO movements to aquisicoes
      const alterationMovements = movements.filter(m => {
        if (m.type !== 'ALTERACAO') return false;
        if (appliedStartDate && m.requestDate < appliedStartDate) return false;
        if (appliedEndDate && m.requestDate > appliedEndDate) return false;
        const originBranch = branches.find(b => b.name === m.origin.branch);
        if (appliedCompanyId !== 'all' && originBranch?.companyId !== appliedCompanyId) return false;
        if (appliedBranchId !== 'all' && originBranch?.id !== appliedBranchId) return false;
        return true;
      });

      const alterationAssets: any[] = [];
      alterationMovements.forEach(m => {
        m.items.forEach(item => {
          const asset = assets.find(a => a.id === item.assetId && a.sub === item.assetSub);
          if (asset) {
            alterationAssets.push({
              ...asset,
              status: 'SOLICITAÇÃO DE ALTERAÇÃO',
              movementId: m.id,
              movementType: m.type
            });
          }
        });
      });

      return [...filteredAssets, ...alterationAssets];
    }

    if (reportType === 'baixas') {
      return [
        ...filteredAssets, 
        ...baixaRequests
          .filter(r => {
            if (appliedStartDate && r.date < appliedStartDate) return false;
            if (appliedEndDate && r.date > appliedEndDate) return false;
            const asset = assets.find(a => a.id === r.assetId);
            if (!asset) return false;
            if (appliedCompanyId !== 'all' && asset.companyId !== appliedCompanyId) return false;
            if (appliedBranchId !== 'all' && asset.branchId !== appliedBranchId) return false;
            return true;
          })
          .map(r => {
            const asset = assets.find(a => a.id === r.assetId);
            return {
              ...asset,
              status: 'PENDENTE BAIXA',
              deactivationDate: r.date,
              id: r.assetId,
              name: asset?.name || 'Ativo não encontrado'
            };
          })
      ];
    }

    if (reportType === 'movimentacoes') {
      // Relatório de Movimentações: Apenas o que está no menu movimentações (EXCETO ALTERACAO)
      const filteredMovements = movements.filter(m => {
        if (m.type === 'ALTERACAO') return false;
        if (appliedStartDate && m.requestDate < appliedStartDate) return false;
        if (appliedEndDate && m.requestDate > appliedEndDate) return false;
        const originBranch = branches.find(b => b.name === m.origin.branch);
        if (appliedCompanyId !== 'all' && originBranch?.companyId !== appliedCompanyId) return false;
        if (appliedBranchId !== 'all' && originBranch?.id !== appliedBranchId) return false;
        return true;
      });

      // Map movements to asset-like objects for the table
      const movementAssets: any[] = [];
      filteredMovements.forEach(m => {
        m.items.forEach(item => {
          const asset = assets.find(a => a.id === item.assetId && a.sub === item.assetSub);
          if (asset) {
            movementAssets.push({
              ...asset,
              status: m.type === 'ALTERACAO' ? 'SOLICITAÇÃO DE ALTERAÇÃO' : m.status,
              movementId: m.id,
              movementType: m.type
            });
          }
        });
      });
      return movementAssets;
    }

    if (reportType === 'documentos') {
      return movements
        .filter(m => m.type === 'CONSERTO' && m.status === 'EXECUTADO')
        .flatMap(m => m.items.map(item => {
          const asset = assets.find(a => a.id === item.assetId);
          const daysOut = Math.floor((new Date().getTime() - new Date(m.requestDate).getTime()) / (1000 * 60 * 60 * 24));
          return {
            ...asset,
            daysOut,
            movementId: m.id,
            movementDate: m.requestDate
          };
        }));
    }

    if (reportType === 'seguros') {
      return assets.filter(a => a.insurance && a.insurance.policyNumber);
    }

    if (reportType === 'leasing') {
      return assets.filter(a => a.leasing && a.leasing.contractNumber);
    }

    if (reportType === 'manutencao') {
      return assets.filter(a => a.maintenance && (a.maintenance.nextMaintenanceDate || a.maintenance.lastMaintenanceDate));
    }

    if (reportType === 'fiscal') {
      return assets.filter(a => a.ncm);
    }

    return filteredAssets;
  })();

  const displayData = [...displayDataRaw].sort((a: any, b: any) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];
    
    if (sortConfig.key === 'totalValue') {
      aValue = currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD;
      bValue = currency === 'BRL' ? b.acquisitionValueBRL : b.acquisitionValueUSD;
    }

    if (sortConfig.key === 'accumulated' || sortConfig.key === 'bookValue') {
      const { accumulated: aAcc, bookValue: aBook } = calculateDepreciation(a, reportDate, depreciationMethod, currency);
      const { accumulated: bAcc, bookValue: bBook } = calculateDepreciation(b, reportDate, depreciationMethod, currency);
      aValue = sortConfig.key === 'accumulated' ? aAcc : aBook;
      bValue = sortConfig.key === 'accumulated' ? bAcc : bBook;
    }
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const totals = (() => {
    if (reportType === 'notas_explicativas') {
      return {
        acquisition: notasExplicativasData.reduce((acc: number, r: any) => acc + (r.accountCode.startsWith('10') ? r.finalBalance : 0), 0),
        accumulated: Math.abs(notasExplicativasData.reduce((acc: number, r: any) => acc + (r.accountCode.startsWith('11') ? r.finalBalance : 0), 0)),
        bookValue: notasExplicativasData.reduce((acc: number, r: any) => acc + r.finalBalance, 0)
      };
    }
    return displayData.reduce((acc, a: any) => {
      const acqVal = currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD;
      const { accumulated, bookValue } = calculateDepreciation(a, reportDate, depreciationMethod, currency);
      return {
        acquisition: acc.acquisition + acqVal,
        accumulated: acc.accumulated + accumulated,
        bookValue: acc.bookValue + bookValue
      };
    }, { acquisition: 0, accumulated: 0, bookValue: 0 });
  })();

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <ArrowLeftRight size={10} className="ml-1 opacity-30 rotate-90" />;
    return sortConfig.direction === 'asc' ? <TrendingUp size={10} className="ml-1 text-primary" /> : <TrendingDown size={10} className="ml-1 text-primary" />;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Relatórios</h2>
        <div className="flex items-center gap-4 bg-panel border border-line p-2 rounded-xl">
          <label className="text-xs font-bold text-muted uppercase pl-2">Data do Relatório:</label>
          <input 
            type="date" 
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="bg-bg border border-line rounded-lg px-3 py-1.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
          />
          <button 
            onClick={() => exportToCSV(getExportData(), `report-${reportType}`)}
            className="px-6 py-2 bg-success hover:bg-success/80 text-white rounded-lg font-bold flex items-center gap-2 transition-all"
          >
            <Download size={20} /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {reports.map(r => (
          <button
            key={r.id}
            onClick={() => setReportType(r.id)}
            className={cn(
              "p-2 rounded-lg border transition-all flex items-center gap-2",
              reportType === r.id 
                ? "bg-primary border-primary text-white shadow-md shadow-primary/10" 
                : "bg-panel border-line text-muted hover:border-primary hover:text-primary"
            )}
          >
            <div className={cn("p-1.5 rounded-md shrink-0", reportType === r.id ? "bg-white/20" : "bg-bg")}>
              {r.icon}
            </div>
            <p className="font-bold text-[8px] uppercase tracking-wider leading-tight line-clamp-1">{r.label}</p>
          </button>
        ))}
      </div>

      <div className="bg-panel border border-line rounded-2xl p-6 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted">Data Inicial</label>
          <input 
            type="date" 
            className="bg-bg border-line text-sm rounded-lg px-3 py-2" 
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted">Data Final</label>
          <input 
            type="date" 
            className="bg-bg border-line text-sm rounded-lg px-3 py-2" 
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted">Empresa</label>
          <select 
            value={selectedCompanyId}
            onChange={e => {
              setSelectedCompanyId(e.target.value);
              setSelectedBranchId('all');
            }}
            className="bg-bg border-line text-sm rounded-lg px-3 py-2 min-w-[200px]"
          >
            <option value="all">Selecionar Tudo (Empresas)</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted">Filial</label>
          <select 
            value={selectedBranchId}
            onChange={e => setSelectedBranchId(e.target.value)}
            className="bg-bg border-line text-sm rounded-lg px-3 py-2 min-w-[200px]"
            disabled={selectedCompanyId === 'all'}
          >
            <option value="all">Selecionar Tudo (Filiais)</option>
            {branches.filter(b => b.companyId === selectedCompanyId).map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => {
              setAppliedStartDate(startDate);
              setAppliedEndDate(endDate);
              setAppliedCompanyId(selectedCompanyId);
              setAppliedBranchId(selectedBranchId);
            }}
            className="px-6 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 transition-all"
          >
            GERAR
          </button>
          <button 
            onClick={() => { 
              setStartDate(''); 
              setEndDate(''); 
              setAppliedStartDate('');
              setAppliedEndDate('');
              setSelectedCompanyId('all');
              setSelectedBranchId('all');
              setAppliedCompanyId('all');
              setAppliedBranchId('all');
              if (reportType === 'notas_explicativas') {
                const lastMonth = new Date();
                lastMonth.setMonth(lastMonth.getMonth() - 1);
                const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
                setReportDate(lastDay.toISOString().split('T')[0]);
              }
            }}
            className="px-4 py-2 bg-line hover:bg-line/80 text-muted rounded-lg text-sm font-bold"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-panel border border-line rounded-2xl p-4 card-gradient flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Package size={20} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase font-bold">Quantidade</p>
            <p className="text-lg font-black">{displayData.length}</p>
          </div>
        </div>
        <div className="bg-panel border border-line rounded-2xl p-4 card-gradient flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase font-bold">Total Aquisição</p>
            <p className="text-lg font-black">{formatValue(totals.acquisition)}</p>
          </div>
        </div>
        <div className="bg-panel border border-line rounded-2xl p-4 card-gradient flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center text-danger">
            <TrendingDown size={20} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase font-bold">Depr. Acumulada</p>
            <p className="text-lg font-black">{formatValue(totals.accumulated)}</p>
          </div>
        </div>
        <div className="bg-panel border border-line rounded-2xl p-4 card-gradient flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
            <DollarSign size={20} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase font-bold">Valor Contábil</p>
            <p className="text-lg font-black">{formatValue(totals.bookValue)}</p>
          </div>
        </div>
      </div>

      <div className="bg-panel border border-line rounded-2xl overflow-hidden card-gradient">
        <div className="p-6 border-b border-line flex items-center justify-between bg-bg/30">
          <h3 className="font-bold uppercase tracking-widest text-xs">Visualização: {reports.find(r => r.id === reportType)?.label}</h3>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-line rounded-lg transition-all text-muted"><Search size={18} /></button>
            <button 
              onClick={() => exportToCSV(getExportData(), `report-${reportType}`)}
              className="p-2 hover:bg-line rounded-lg transition-all text-muted"
            >
              <Download size={18} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {reportType === 'notas_explicativas' ? (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] text-muted uppercase border-b border-line bg-bg/10">
                  <th className="p-6 font-bold">Conta Contábil</th>
                  <th className="p-6 font-bold">Descrição da Conta</th>
                  <th className="p-6 font-bold text-right">Saldo Inicial</th>
                  <th className="p-6 font-bold text-right">Adições</th>
                  <th className="p-6 font-bold text-right">Baixas</th>
                  <th className="p-6 font-bold text-right">Transferências</th>
                  <th className="p-6 font-bold text-right">Saldo Final</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {notasExplicativasData.map((row: any) => (
                  <tr key={row.accountCode} className="border-b border-line/50 hover:bg-line/20 transition-all">
                    <td className="p-6 font-mono text-xs font-bold text-primary">{row.accountCode}</td>
                    <td className="p-6 font-bold">{row.accountDescription}</td>
                    <td className="p-6 text-right font-bold">{formatValue(row.initialBalance)}</td>
                    <td className="p-6 text-right text-success">{formatValue(row.additions)}</td>
                    <td className="p-6 text-right text-danger">{formatValue(row.disposals)}</td>
                    <td className="p-6 text-right">{formatValue(row.transfers)}</td>
                    <td className="p-6 text-right font-black text-primary">{formatValue(row.finalBalance)}</td>
                  </tr>
                ))}
                <tr className="bg-bg/50 font-black">
                  <td colSpan={2} className="p-6 text-right uppercase tracking-widest text-xs">Total Geral</td>
                  <td className="p-6 text-right">{formatValue(notasExplicativasData.reduce((acc: number, r: any) => acc + r.initialBalance, 0))}</td>
                  <td className="p-6 text-right text-success">{formatValue(notasExplicativasData.reduce((acc: number, r: any) => acc + r.additions, 0))}</td>
                  <td className="p-6 text-right text-danger">{formatValue(notasExplicativasData.reduce((acc: number, r: any) => acc + r.disposals, 0))}</td>
                  <td className="p-6 text-right">{formatValue(notasExplicativasData.reduce((acc: number, r: any) => acc + r.transfers, 0))}</td>
                  <td className="p-6 text-right text-primary">{formatValue(notasExplicativasData.reduce((acc: number, r: any) => acc + r.finalBalance, 0))}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] text-muted uppercase border-b border-line bg-bg/10">
                  <th className="p-6 font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('id')}>
                    <div className="flex items-center">Ativo <SortIcon column="id" /></div>
                  </th>
                  <th className="p-6 font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('acquisitionDate')}>
                    <div className="flex items-center">Data Aquisição <SortIcon column="acquisitionDate" /></div>
                  </th>
                  <th className="p-6 font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('name')}>
                    <div className="flex items-center">Denominação <SortIcon column="name" /></div>
                  </th>
                  <th className="p-6 font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('classDescription')}>
                    <div className="flex items-center">Classe <SortIcon column="classDescription" /></div>
                  </th>
                  <th className="p-6 font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('costCenterDescription')}>
                    <div className="flex items-center">C. Custo <SortIcon column="costCenterDescription" /></div>
                  </th>
                  <th className="p-6 font-bold text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('totalValue')}>
                    <div className="flex items-center justify-end">V. Aquisição <SortIcon column="totalValue" /></div>
                  </th>
                  <th className="p-6 font-bold text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('accumulated')}>
                    <div className="flex items-center justify-end">Depr. Acumulada <SortIcon column="accumulated" /></div>
                  </th>
                  <th className="p-6 font-bold text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('bookValue')}>
                    <div className="flex items-center justify-end">Valor Contábil <SortIcon column="bookValue" /></div>
                  </th>
                  <th className="p-6 font-bold cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('status')}>
                    <div className="flex items-center">Status <SortIcon column="status" /></div>
                  </th>
                  {reportType === 'baixas' && (
                    <th className="p-6 font-bold">Motivo</th>
                  )}
                  {reportType === 'documentos' && (
                    <th className="p-6 font-bold">Dias Fora</th>
                  )}
                  {reportType === 'seguros' && (
                    <>
                      <th className="p-6 font-bold">Seguradora</th>
                      <th className="p-6 font-bold">Fim Vigência</th>
                    </>
                  )}
                  {reportType === 'leasing' && (
                    <>
                      <th className="p-6 font-bold">Contrato</th>
                      <th className="p-6 font-bold">Fim Contrato</th>
                    </>
                  )}
                  {reportType === 'manutencao' && (
                    <>
                      <th className="p-6 font-bold">Próxima Manut.</th>
                      <th className="p-6 font-bold">Programação</th>
                    </>
                  )}
                  {reportType === 'fiscal' && (
                    <>
                      <th className="p-6 font-bold">NCM</th>
                      <th className="p-6 font-bold">Taxa Fiscal</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="text-sm">
                {displayData.length === 0 ? (
                  <tr><td colSpan={reportType === 'baixas' ? 10 : 9} className="p-12 text-center text-muted italic">Nenhum dado encontrado para este relatório.</td></tr>
                ) : (
                  displayData.map((asset: any) => {
                    const { accumulated, bookValue } = calculateDepreciation(asset, reportDate, depreciationMethod, currency);
                    
                    // Find reason for disposal if it's a disposal report
                    let disposalReason = '-';
                    if (reportType === 'baixas') {
                      const request = baixaRequests.find(r => r.assetId === asset.id && r.assetSub === asset.sub);
                      if (request) {
                        disposalReason = request.reason;
                      }
                    }

                    return (
                      <tr key={`${asset.id}-${asset.sub}`} className="border-b border-line/50 hover:bg-line/20 transition-all">
                        <td className="p-6 font-mono text-xs">{asset.id}/{asset.sub}</td>
                        <td className="p-6 text-xs font-bold">{new Date(asset.acquisitionDate).toLocaleDateString('pt-BR')}</td>
                        <td className="p-6">
                          <p className="font-bold text-primary">{asset.name}</p>
                        </td>
                        <td className="p-6 text-muted text-xs uppercase">{asset.classDescription}</td>
                        <td className="p-6 text-muted text-xs uppercase">{asset.costCenterDescription}</td>
                        <td className="p-6 text-right font-bold">
                          {formatValue(currency === 'BRL' ? asset.acquisitionValueBRL : asset.acquisitionValueUSD)}
                        </td>
                        <td className="p-6 text-right font-bold text-danger">
                          {formatValue(accumulated)}
                        </td>
                        <td className="p-6 text-right font-bold text-success">
                          {formatValue(bookValue)}
                        </td>
                        <td className="p-6">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            asset.status === 'ATIVO' ? "bg-success/10 text-success" : 
                            asset.status === 'BAIXADO' ? "bg-danger/10 text-danger" : 
                            asset.status === 'EM_VALIDACAO' ? "bg-amber-400/10 text-amber-400" :
                            asset.status === 'EM_ALTERACAO' ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"
                          )}>
                            {asset.status.replace('_', ' ')}
                          </span>
                        </td>
                        {reportType === 'baixas' && (
                          <td className="p-6 text-xs font-bold text-danger uppercase">{disposalReason}</td>
                        )}
                        {reportType === 'documentos' && (
                          <td className="p-6 text-xs font-black text-danger uppercase">{asset.daysOut} dias</td>
                        )}
                        {reportType === 'seguros' && (
                          <>
                            <td className="p-6 text-xs font-bold uppercase">{asset.insurance?.companyName}</td>
                            <td className="p-6 text-xs font-bold uppercase">{asset.insurance?.endDate ? new Date(asset.insurance.endDate).toLocaleDateString('pt-BR') : '-'}</td>
                          </>
                        )}
                        {reportType === 'leasing' && (
                          <>
                            <td className="p-6 text-xs font-bold uppercase">{asset.leasing?.contractNumber}</td>
                            <td className="p-6 text-xs font-bold uppercase">{asset.leasing?.endDate ? new Date(asset.leasing.endDate).toLocaleDateString('pt-BR') : '-'}</td>
                          </>
                        )}
                        {reportType === 'manutencao' && (
                          <>
                            <td className="p-6 text-xs font-bold uppercase">{asset.maintenance?.nextMaintenanceDate ? new Date(asset.maintenance.nextMaintenanceDate).toLocaleDateString('pt-BR') : '-'}</td>
                            <td className="p-6 text-xs font-bold uppercase">{asset.maintenance?.programming}</td>
                          </>
                        )}
                        {reportType === 'fiscal' && (
                          <>
                            <td className="p-6 text-xs font-bold uppercase">{asset.ncm}</td>
                            <td className="p-6 text-xs font-bold uppercase">{(asset.fiscalAnnualRate * 100).toFixed(2)}%</td>
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Portal({ 
  onSelectAsset, 
  onSelectAccounting,
  onEnterSystem
}: { 
  onSelectAsset: () => void, 
  onSelectAccounting: () => void,
  onEnterSystem: () => void
}) {
  return (
    <div className="min-h-screen bg-[#080e1a] text-white flex flex-col items-center justify-center p-6 py-20 relative overflow-hidden font-sans">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16 relative z-10 max-w-5xl px-4"
      >
        <h1 className="text-5xl md:text-8xl font-black tracking-tighter uppercase mb-6 italic">
          TRÍADE <span className="text-primary italic">GROUP</span>
        </h1>
        <p className="text-muted text-sm md:text-lg font-bold uppercase tracking-widest opacity-80 leading-relaxed italic max-w-3xl mx-auto mb-4">
          Ecossistema de soluções integradas em inteligência patrimonial, contabilidade estratégica e tecnologia corporativa, com atuação multissetorial, focado em controle, governança e crescimento sustentável.
        </p>
        <p className="text-primary text-[10px] md:text-xs font-black uppercase tracking-[0.4em] italic opacity-60">
          Conheça nossas soluções especializadas.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl w-full relative z-10 mb-20 px-4">
        <PortalCard 
          label="CONSULTORIA"
          title="ASSET SOLUTION"
          subtitle="Gestão e Inteligência Patrimonial"
          desc="Soluções estratégicas para controle, organização, valorização e governança do patrimônio empresarial, apoiando a tomada de decisão e a eficiência operacional."
          icon={<Package size={44} />}
          onClick={onSelectAsset}
          color="amber"
        />
        <PortalCard 
          label="SOFTWARE"
          title="ASSET SYSTEM"
          subtitle="Gestão de Ativos em Tempo Real"
          desc="Plataforma enterprise PRO para inventário, controle, rastreabilidade e análise de ativos, integrando dados patrimoniais em tempo real para suporte à gestão, auditoria e decisão estratégica."
          icon={<Monitor size={44} />}
          onClick={onEnterSystem}
          color="purple"
        />
        <PortalCard 
          label="SERVIÇOS"
          title="ASSET ACCOUNTING"
          subtitle="Contabilidade como plataforma de apoio à gestão empresarial"
          desc="Modelo de contabilidade CaaS estratégica orientado a dados, conformidade e informação gerencial, atuando como base de apoio contínuo à gestão e ao desempenho do negócio."
          icon={<Briefcase size={44} />}
          onClick={onSelectAccounting}
          color="blue"
        />
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="relative z-10 text-center flex flex-col items-center gap-4"
      >
        <button 
          onClick={() => window.open('https://www.asscon.org.br', '_blank')}
          className="group flex flex-col items-center gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-black tracking-[0.3em] text-muted/40 italic">Apoio pass:</span>
            <span className="text-xl md:text-4xl font-black tracking-tighter uppercase text-primary transition-colors flex items-center gap-2 italic">
              ASSCON <ArrowUpRight size={24} className="text-muted group-hover:text-primary transition-all" />
            </span>
          </div>
          <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] text-muted/50 group-hover:text-white/50 transition-colors italic">
            ASSOCIAÇÃO NACIONAL DOS PROFISSIONAIS DA CONTABILIDADE
          </span>
        </button>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="mt-20 text-[10px] uppercase font-black tracking-[0.4em] text-muted/10 italic"
      >
        © 2026 – Tríade Group – Todos os direitos reservados.
      </motion.div>
    </div>
  );
}

function PortalCard({ title, subtitle, badge, desc, icon, onClick, color, isExternal, label }: any) {
  const colors: any = {
    amber: "hover:border-amber-500/40 hover:shadow-amber-500/5",
    blue: "hover:border-blue-500/40 hover:shadow-blue-500/5",
    purple: "hover:border-purple-500/40 hover:shadow-purple-500/5"
  };

  const iconColors: any = {
    amber: "text-amber-500 bg-amber-500/10",
    blue: "text-blue-500 bg-blue-500/10",
    purple: "text-purple-500 bg-purple-500/10"
  };

  return (
    <motion.button
      whileHover={{ y: -12 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "bg-white/[0.03] border border-white/5 rounded-[48px] p-10 md:p-12 text-left transition-all group flex flex-col gap-8 h-full shadow-2xl relative overflow-hidden backdrop-blur-sm",
        colors[color]
      )}
    >
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-white/5 to-transparent blur-3xl -mr-20 -mt-20 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      <div className="flex justify-between items-start">
        <div className={cn("w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-xl", iconColors[color])}>
          {icon}
        </div>
        <span className={cn("text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border opacity-40 group-hover:opacity-100 transition-opacity", 
          color === 'amber' ? 'border-amber-500/30 text-amber-500' :
          color === 'blue' ? 'border-blue-500/30 text-blue-500' :
          'border-purple-500/30 text-purple-500'
        )}>
          {label}
        </span>
      </div>
      
      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-3xl font-black tracking-tighter uppercase transition-colors flex items-center gap-2 italic leading-none text-white">
            {title}
            {isExternal && <ArrowUpRight size={20} className="text-muted group-hover:text-white transition-all transform group-hover:translate-x-1 group-hover:-translate-y-1" />}
          </h3>
          {badge && (
            <span className="text-[10px] font-black uppercase tracking-widest bg-white/10 text-white px-3 py-1 rounded-full italic">
              {badge}
            </span>
          )}
        </div>
        <p className="text-primary font-black text-[11px] leading-tight uppercase tracking-wider italic">
          {subtitle}
        </p>
      </div>

      <div className="relative z-10">
        <p className="text-muted font-medium text-xs md:text-sm leading-relaxed italic opacity-80 group-hover:opacity-100 transition-opacity">
          {desc}
        </p>
      </div>

      <div className="mt-auto pt-8">
        <div className={cn("w-12 h-1.5 bg-white/5 rounded-full group-hover:w-full transition-all duration-700 ease-in-out",
          color === 'amber' ? 'group-hover:bg-amber-500' :
          color === 'blue' ? 'group-hover:bg-blue-500' :
          'group-hover:bg-purple-500'
        )} />
      </div>
    </motion.button>
  );
}

function AccountingLanding({ onBack, onEnterSystem, onSelectAsset, onSelectPortal }: any) {
  const [modalContent, setModalContent] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <div className="bg-[#0b1220] text-white selection:bg-primary/30 font-sans scroll-smooth">
      {/* Mini Nav */}
      <nav className="fixed top-0 left-0 w-full z-[100] px-6 py-6 transition-all duration-500 bg-[#0b1220]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <button onClick={onSelectPortal} className="flex items-center gap-4 group text-left">
            <div className="p-3 bg-white/5 rounded-2xl group-hover:bg-primary transition-all shadow-lg">
              <LogOut size={20} className="text-primary group-hover:text-white rotate-180" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-3xl tracking-tighter uppercase text-white italic leading-none">ASSET</span>
              <span className="font-black text-xl tracking-tighter uppercase text-primary italic leading-none mt-1">ACCOUNTING</span>
            </div>
          </button>
          
          <div className="hidden md:flex items-center gap-6">
            <a href="#about" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:text-primary transition-colors italic">Inovação</a>
            <span className="text-white/10 text-xs">|</span>
            <a href="#caas" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:text-primary transition-colors italic">Contabilidade</a>
            <span className="text-white/10 text-xs">|</span>
            <a href="#caas" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:text-primary transition-colors italic">Como Funciona</a>
            <span className="text-white/10 text-xs">|</span>
            <a href="#faq" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:text-primary transition-colors italic">Dúvidas</a>
            <span className="text-white/10 text-xs">|</span>
            <a href="#contact" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:text-primary transition-colors italic">Contato</a>
            <button 
              onClick={onEnterSystem}
              className="ml-6 px-6 py-3 bg-primary text-black font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all text-[10px] shadow-2xl shadow-primary/30 italic"
            >
              Acessar Sistema
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-60 pb-40 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-primary/5 rounded-full blur-[160px] -mr-96 -mt-96" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <span className="inline-block px-4 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-[0.3em] mb-8 italic">
                Modern Accounting Infrastructure
              </span>
              <h1 className="text-4xl md:text-7xl font-black mb-8 leading-[0.95] tracking-tighter uppercase italic">
                <span className="text-white">A contabilidade</span> <br /> 
                <span className="text-white">da sua empresa,</span> <br /> 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60a5fa] via-[#a78bfa] to-[#c084fc]">reestruturada como plataforma.</span>
              </h1>
              <p className="text-muted text-lg mb-10 max-w-xl leading-relaxed font-medium italic">
                Accounting as a Service (CaaS) combina contabilidade especializada, processos estruturados e tecnologia própria para transformar conformidade fiscal em inteligência de gestão.
              </p>
              <div className="flex flex-wrap gap-8">
                <a href="#contact" className="px-12 py-6 bg-white text-black font-black uppercase tracking-widest rounded-3xl hover:bg-primary hover:text-white transition-all text-xs shadow-2xl shadow-white/5 italic">
                  Solicitar proposta CaaS
                </a>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1 }}
              className="relative"
            >
              <div className="aspect-[4/3] bg-gradient-to-br from-primary/10 to-blue-500/10 rounded-[64px] border border-white/10 p-1 bg-[#0d1627] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden group">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1454165833767-1316b321d021?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay opacity-20 group-hover:scale-110 transition-transform duration-[2000ms] ease-out" />
                <div className="relative h-full flex flex-col p-8 justify-center gap-6">
                  {/* ESCALABILIDADE */}
                  <motion.div 
                    animate={{ y: [0, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                    className="p-6 bg-white/[0.03] backdrop-blur-xl rounded-[32px] border border-white/10 shadow-2xl relative overflow-hidden group/card max-w-[280px]"
                  >
                    <motion.div 
                      animate={{ x: ['-200%', '200%'] }} 
                      transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-[-20deg]"
                    />
                    <TrendingUp className="text-primary mb-3" size={28} />
                    <h3 className="text-lg font-black uppercase italic mb-1 tracking-tighter text-white">Escalabilidade</h3>
                    <p className="text-[9px] text-muted font-bold uppercase tracking-widest leading-relaxed">Sua estrutura contábil cresce junto com a operação, sem necessidade de ampliar equipe.</p>
                  </motion.div>

                  {/* REAL-TIME */}
                  <motion.div 
                    animate={{ x: [0, 8, 0] }}
                    transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 0.5 }}
                    className="p-6 bg-primary/10 backdrop-blur-xl rounded-[32px] border border-primary/20 self-end max-w-[260px] shadow-2xl relative translate-x-4 overflow-hidden group/card"
                  >
                    <div className="absolute -top-3 -right-3 w-8 h-8 bg-primary rounded-full flex items-center justify-center animate-pulse z-10 text-white shadow-lg">
                      <Zap size={14} />
                    </div>
                    <h3 className="text-lg font-black uppercase italic mb-1 tracking-tighter text-white">Real-Time</h3>
                    <p className="text-[9px] text-muted font-bold uppercase tracking-widest leading-relaxed">Indicadores consolidados e atualizados em D+1, acessíveis de forma segura.</p>
                  </motion.div>
                  
                  {/* ESPECIALISTAS */}
                  <motion.div 
                    animate={{ y: [0, 8, 0], rotate: [-0.5, 0.5, -0.5] }}
                    transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 1 }}
                    className="p-6 bg-white/[0.03] backdrop-blur-xl rounded-[32px] border border-white/10 shadow-2xl absolute bottom-8 left-8 max-w-[240px] overflow-hidden group/card z-20"
                  >
                    <Users className="text-purple-400 mb-3" size={24} />
                    <h3 className="text-base font-black uppercase italic mb-1 tracking-tighter text-white">Especialistas</h3>
                    <p className="text-[9px] text-muted font-bold uppercase tracking-widest leading-relaxed">Suporte técnico de contadores especialistas com visão estratégica contínua.</p>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Intro CaaS */}
      <section id="caas" className="py-40 px-6 bg-[#080e1a] relative">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-4xl">
            <h2 className="text-[10px] text-primary font-black uppercase tracking-[0.4em] mb-8 italic opacity-50">Discovery phase</h2>
            <h3 className="text-4xl md:text-7xl font-black mb-12 leading-tight italic uppercase tracking-tighter">O que é Contabilidade como Serviço (CaaS)?</h3>
            <div className="space-y-8 text-muted text-xl leading-relaxed font-medium italic">
              <p>
                Contabilidade como Serviço (CaaS) é um modelo moderno de prestação contábil que integra especialistas, processos padronizados e infraestrutura tecnológica em uma única plataforma.
              </p>
              <p>
                Diferente da contabilidade tradicional, o CaaS opera de forma contínua, digital e estruturada, entregando informações contábeis, fiscais e financeiras integradas, com acesso remoto e alto nível de confiabilidade.
              </p>
              <p className="text-white border-l-4 border-primary pl-10 py-4 bg-white/5 rounded-r-3xl">
                O modelo elimina a separação entre o operacional, o fiscal e o estratégico, permitindo que a contabilidade deixe de ser apenas uma obrigação legal e passe a apoiar ativamente a gestão empresarial.
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-32">
            <motion.div 
              whileHover={{ y: -10 }}
              className="p-16 bg-white/[0.02] border border-white/5 rounded-[64px] transition-all group shadow-2xl"
            >
              <h4 className="text-3xl font-black uppercase mb-8 italic text-white/20 group-hover:text-white transition-colors tracking-tighter">Contabilidade Tradicional</h4>
              <p className="text-muted text-lg leading-relaxed italic font-medium">
                Modelo baseado em processos manuais, troca de arquivos, planilhas e informações desconectadas. Entrega dados com atraso, baixa transparência, dependência de equipe interna e dificuldade para escalar operações sem aumento significativo de custos e riscos.
              </p>
            </motion.div>
            <motion.div 
              whileHover={{ y: -10 }}
              className="p-16 bg-primary/[0.03] border border-primary/10 rounded-[64px] transition-all group shadow-2xl shadow-primary/5"
            >
              <h4 className="text-3xl font-black uppercase mb-8 italic text-primary tracking-tighter">CaaS (Moderno)</h4>
              <p className="text-muted text-lg leading-relaxed italic font-medium">
                Modelo integrado, contínuo e orientado por dados. Processos automatizados, especialistas dedicados e informações consolidadas em ambiente seguro, com previsibilidade, escalabilidade e apoio à tomada de decisão.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-40 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-32">
            <h2 className="text-[10px] text-primary font-black uppercase tracking-[0.4em] mb-8 italic opacity-50">Frequent inquiries</h2>
            <h3 className="text-4xl md:text-7xl font-black mb-10 leading-tight italic uppercase tracking-tighter">Esclarecendo o Modelo</h3>
          </div>
          
          <div className="max-w-4xl mx-auto space-y-6">
            <FAQItem 
              q="CaaS: como ajuda minha empresa?"
              a="O CaaS reduz riscos, aumenta eficiência operacional e transforma dados contábeis em apoio real à gestão, melhorando a tomada de decisão e o controle do negócio."
            />
            <FAQItem 
              q="Quais serviços o CaaS oferece?"
              a="Serviços contábeis completos, área fiscal, obrigações acessórias, relatórios gerenciais, dashboards financeiros e suporte técnico especializado."
            />
            <FAQItem 
              q="Custos em comparação ao modelo tradicional?"
              a="Modelo previsível e escalável, geralmente mais eficiente que estruturas internas fragmentadas, reduzindo retrabalho e custos ocultos."
            />
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="py-40 px-6 bg-[#0b1220] relative border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-40">
            <div>
              <h2 className="text-3xl md:text-5xl font-black mb-12 leading-[1.1] tracking-tighter uppercase italic">
                <span className="text-white">Leve sua </span> <br />
                <span className="text-white">contabilidade para</span> <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60a5fa] via-[#a78bfa] to-[#c084fc]">um modelo estruturado, moderno e orientado por dados.</span>
              </h2>
              <p className="text-muted text-xl mb-16 leading-relaxed max-w-md italic">
                Pronto para dar o próximo passo? Nossa equipe de especialistas aguarda seu contato.
              </p>
              
              <div className="space-y-12">
                <div className="flex items-center gap-6 group cursor-pointer" onClick={() => window.location.href = 'mailto:helio@assetbr.com.br'}>
                  <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center group-hover:bg-primary transition-all shadow-xl">
                    <Mail size={24} className="text-primary group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">Fale com um especialista</p>
                    <p className="text-xl font-black group-hover:text-primary transition-colors italic">helio@assetbr.com.br</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 group cursor-pointer" onClick={() => window.open('https://wa.me/5565996414400', '_blank')}>
                  <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center group-hover:bg-primary transition-all shadow-xl">
                    <MessageCircle size={24} className="text-primary group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">WhatsApp Business</p>
                    <p className="text-xl font-black group-hover:text-primary transition-colors italic">+55 (65) 99641-4400</p>
                  </div>
                </div>

                <div className="flex items-start gap-6 group">
                  <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center shrink-0 shadow-xl">
                    <MapPin size={24} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">Visite nossa sede</p>
                    <p className="text-lg font-black italic max-w-xs leading-tight">Rua Trinta e Dois, Sl 201 Bloco 09, Santa Cruz II – Cuiabá/MT</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/10 p-12 md:p-16 rounded-[64px] shadow-3xl relative">
               <div className="absolute top-0 left-0 w-full h-3 bg-primary rounded-t-full" />
               <h3 className="text-3xl font-black uppercase mb-12 tracking-tighter italic">Solicitar proposta CaaS</h3>
               <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.4em] text-muted/50 ml-1 italic">Organização</label>
                    <input type="text" placeholder="Nome da organização" className="w-full bg-[#080e1a] border border-white/5 rounded-3xl p-6 focus:border-primary outline-none text-white transition-all shadow-inner font-medium italic" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.4em] text-muted/50 ml-1 italic">Email corporativo</label>
                    <input type="email" placeholder="seuemail@empresa.com.br" className="w-full bg-[#080e1a] border border-white/5 rounded-3xl p-6 focus:border-primary outline-none text-white transition-all shadow-inner font-medium italic" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.4em] text-muted/50 ml-1 italic">Mensagem</label>
                    <textarea rows={5} placeholder="Como o CaaS pode apoiar sua empresa hoje?" className="w-full bg-[#080e1a] border border-white/5 rounded-3xl p-6 focus:border-primary outline-none text-white transition-all resize-none shadow-inner font-medium italic" />
                  </div>
                  <button type="submit" className="w-full py-6 bg-primary text-white font-black uppercase tracking-widest rounded-3xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-primary/20 italic">Fale com um especialista CaaS</button>
                </form>
              </div>
          </div>
        </div>
      </section>

      <GroupFooter 
        brand="ASSET ACCOUNTING" 
        onSelectAsset={onSelectAsset}
        onSelectAccounting={() => {}}
        onSelectPortal={onSelectPortal}
        setModalContent={setModalContent}
        onEnterSystem={onEnterSystem}
      />

      {/* Floating Elements */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-4">
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={scrollToTop}
              className="w-16 h-16 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-3xl flex items-center justify-center hover:bg-primary transition-all shadow-2xl"
            >
              <ArrowUp size={28} />
            </motion.button>
          )}
        </AnimatePresence>
        <motion.a
          href="https://wa.me/5565996414400"
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.1 }}
          className="w-20 h-20 bg-[#25d366] text-white rounded-[32px] flex items-center justify-center shadow-2xl shadow-green-500/20 group relative overflow-hidden"
        >
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
            <MessageCircle size={40} />
          </motion.div>
          <span className="absolute right-full mr-8 px-6 py-3 bg-white text-black text-[10px] font-black uppercase tracking-[0.4em] rounded-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all shadow-2xl pointer-events-none italic translate-x-4 group-hover:translate-x-0">
            Dúvidas? Fale com Hélio
          </span>
        </motion.a>
      </div>

      <AnimatePresence>
        {modalContent && (
          <TermsModal content={modalContent} onClose={() => setModalContent(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function FAQItem({ q, a }: { q: string, a: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-white/5 bg-white/[0.02] rounded-[32px] overflow-hidden shadow-2xl transition-all hover:bg-white/[0.04]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-10 text-left group"
      >
        <span className="text-xl font-black uppercase tracking-tight group-hover:text-primary transition-colors italic leading-tight">{q}</span>
        <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            className="text-primary p-3 bg-white/5 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all shadow-lg"
          >
          <ChevronDown size={28} />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: "circOut" }}
          >
            <div className="px-10 pb-10 text-muted text-lg font-medium italic leading-relaxed pt-2">
              {a}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupFooter({ brand, onSelectAsset, onSelectAccounting, onSelectPortal, setModalContent, onEnterSystem }: any) {
  return (
    <footer className="py-40 bg-[#080e1a] border-t border-white/5 px-6 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-24 mb-40">
          <div className="col-span-1 md:col-span-2">
            <button onClick={onSelectPortal} className="text-left group mb-10 transition-transform hover:scale-105 active:scale-95">
              <span className="font-black text-5xl md:text-7xl tracking-tighter uppercase text-white block italic">
                {brand === 'ASSET SOLUTION' ? (
                  <>ASSET <span className="text-primary">SOLUTION</span></>
                ) : brand === 'ASSET ACCOUNTING' ? (
                  <>ASSET <span className="text-primary">ACCOUNTING</span></>
                ) : brand}
              </span>
              {(brand === 'ASSET SOLUTION' || brand === 'ASSET ACCOUNTING') && (
                <p className="text-primary font-black text-[10px] md:text-[12px] leading-tight uppercase tracking-widest italic mt-3 ml-1">
                  {brand === 'ASSET SOLUTION' ? 'GESTÃO E INTELIGÊNCIA PATRIMONIAL' : 'CONTABILIDADE COMO PLATAFORMA DE APOIO À GESTÃO EMPRESARIAL'}
                </p>
              )}
            </button>
          </div>
          
          <div>
            <h5 className="text-[10px] font-black uppercase tracking-[0.6em] text-white mb-12 opacity-30 italic">Links</h5>
            <ul className="space-y-8">
              <li>
                <button onClick={onSelectAsset} className="text-sm font-black uppercase tracking-[0.3em] transition-all italic hover:text-primary text-muted">
                  Asset Solution
                </button>
              </li>
              <li>
                <button onClick={onEnterSystem} className="text-sm font-black uppercase tracking-[0.3em] transition-all italic hover:text-primary text-muted">
                  Asset System
                </button>
              </li>
              <li>
                <button onClick={onSelectAccounting} className="text-sm font-black uppercase tracking-[0.3em] transition-all italic hover:text-primary text-muted">
                  Asset Accounting
                </button>
              </li>
              <li>
                <a href="https://www.asscon.org.br" target="_blank" rel="noopener noreferrer" className="text-sm font-black uppercase tracking-[0.3em] text-muted hover:text-primary transition-all italic flex items-center gap-3">
                  Asscon
                </a>
              </li>
            </ul>
          </div>

          <div>
             <h5 className="text-[10px] font-black uppercase tracking-[0.6em] text-white mb-12 opacity-30 italic">Compliance</h5>
             <ul className="space-y-8 text-sm font-black text-muted uppercase tracking-[0.3em]">
                <li><button onClick={() => setModalContent('privacy')} className="hover:text-primary transition-all italic">Privacidade</button></li>
                <li><button onClick={() => setModalContent('terms')} className="hover:text-primary transition-all italic">Termos de Uso</button></li>
             </ul>
          </div>
        </div>
        
        <div className="pt-20 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="text-center md:text-left">
            <p className="text-[10px] uppercase font-black tracking-[0.6em] text-primary italic mb-2">
              {brand === 'ASSET ACCOUNTING' ? 'ASSET ACCOUNTING' : 'ASSET SOLUTION'}
            </p>
            {brand === 'ASSET ACCOUNTING' && (
              <p className="text-white/40 text-[9px] uppercase font-bold tracking-[0.2em] mb-4">
                Contabilidade como plataforma de apoio à gestão empresarial
              </p>
            )}
            <p className="text-muted/50 text-[10px] font-bold uppercase tracking-widest">
              © 2026 – Todos os direitos reservados
            </p>
          </div>
          <div className="flex gap-10">
            <a href="https://www.linkedin.com/company/assetsolution" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-primary transition-all hover:scale-125">
              <Linkedin size={28} />
            </a>
            <a href="https://www.instagram.com/assetbr/" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-primary transition-all hover:scale-125">
              <Instagram size={28} />
            </a>
            <a href="https://www.facebook.com/AssetConsultoriaBR" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-primary transition-all hover:scale-125">
              <Facebook size={28} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function TermsModal({ content, onClose }: { content: string, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#0b1220]/95 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 40 }}
        className="relative w-full max-w-4xl bg-[#0d1627]/98 backdrop-blur-3xl border border-white/10 p-16 md:p-24 rounded-[80px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9)] max-h-[85vh] overflow-y-auto custom-scrollbar"
      >
        <button onClick={onClose} className="absolute top-12 right-12 p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all text-white">
          <X size={24} />
        </button>
        <h2 className="text-5xl font-black uppercase tracking-tighter mb-12 italic leading-none">
          {content === 'privacy' ? 'Política de Privacidade' : 'Termos de Uso'}
        </h2>
        <div className="prose prose-invert prose-lg text-muted/80 leading-relaxed space-y-10 font-medium italic">
          {content === 'privacy' ? (
            <>
              <p className="text-xl">O <span className="text-white">TRÍADE GROUP</span> e suas verticais de negócio (Asset Solution, Accounting, Asscon) estabelecem este compromisso com a proteção integral de dados.</p>
              <div className="space-y-6">
                <p><strong>1. Coleta Ética:</strong> Capturamos informações estritamente necessárias para a prestação de serviços de alta performance em inteligência patrimonial e fiscal.</p>
                <p><strong>2. Rastreabilidade LGPD:</strong> Nossa infraestrutura é moldada pelo princípio de Privacy by Design, garantindo transparência total e conformidade com a regulamentação brasileira.</p>
                <p><strong>3. Muralha Tecnológica:</strong> Seus dados são processados em ambientes isolados com camadas de criptografia AES-256 e monitoramento SOC 24/7.</p>
              </div>
            </>
          ) : (
            <>
              <p className="text-xl">As disposições abaixo regem a relação comercial e técnica entre o <span className="text-white">TRÍADE GROUP</span> e seus parceiros corporativos.</p>
              <div className="space-y-6">
                <p><strong>1. Propriedade Intelectual:</strong> Metodologias, matrizes de cálculo e softwares proprietary como o Asset System são ativos intelectuais protegidos internacionalmente.</p>
                <p><strong>2. Escopo de Entrega:</strong> Nossos laudos e consultorias são assinados por responsáveis técnicos qualificados, garantindo validade jurídica e contábil conforme as IFRS.</p>
                <p><strong>3. Sigilo Industrial:</strong> Vigora o compromisso mútuo de confidencialidade sobre processos de negócio e segredos industriais expostos durante a prestação do serviço.</p>
              </div>
            </>
          )}
        </div>
        <button 
          onClick={onClose}
          className="mt-20 w-full py-8 bg-white text-black font-black uppercase tracking-[0.4em] rounded-[32px] hover:bg-primary hover:text-white transition-all text-sm shadow-3xl italic"
        >
          Entendido e Aceito
        </button>
      </motion.div>
    </div>
  );
}

function LandingPage({ onEnterSystem, onSelectAccounting, onSelectPortal }: any) {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showAllAbout, setShowAllAbout] = React.useState(false);
  const [expandedService, setExpandedService] = React.useState<number | null>(null);
  const [modalContent, setModalContent] = React.useState<'privacy' | 'terms' | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const services = [
    { 
      title: 'Consultoria Patrimonial', 
      description: 'Eliminamos inconsistências patrimoniais e estruturamos normas, políticas e processos para garantir conformidade e governança estratégica.', 
      icon: <Shield size={24} className="text-primary" />,
      tag: 'Estratégia'
    },
    { 
      title: 'Inventário Físico Patrimonial', 
      description: 'Inventário completo, padronizado e conciliado. Levantamento físico com acuracidade comprovada, pronto para processos de auditoria.', 
      icon: <Package size={24} className="text-amber-500" />,
      tag: 'Operacional'
    },
    { 
      title: 'Revisão de Vida Útil e Valor Residual', 
      description: 'Atendimento obrigatório (CPC 27) com impacto direto no resultado e na confiabilidade das demonstrações financeiras da sua organização.', 
      icon: <History size={24} className="text-purple-500" />,
      tag: 'Contábil'
    },
    { 
      title: 'Teste de Impairment (CPC 01)', 
      description: 'Garantia de que nenhum ativo esteja superavaliado contabilmente. Avaliação pelo valor líquido de venda e pelo valor de uso.', 
      icon: <TrendingDown size={24} className="text-danger" />,
      tag: 'Compliance'
    },
    { 
      title: 'Relatórios Regulatórios', 
      description: 'Conformidade com RCP – ANEEL (PCH e concessões) e SisPAT / SEI – ANTAQ. Atendimento rigoroso aos prazos e normas vigentes.', 
      icon: <Zap size={24} className="text-amber-400" />,
      tag: 'Regulatório'
    },
    { 
      title: 'Avaliação de Bens', 
      description: 'Laudos técnicos em conformidade com as normas ABNT NBR 14.653, IBAPE e legislação vigente (Leis 11.638/07 e 11.941/09).', 
      icon: <DollarSign size={24} className="text-amber-600" />,
      tag: 'Avaliação'
    }
  ];

  const solutions = [
    { 
      title: 'Asset System', 
      description: 'A plataforma definitiva para gestão do ativo imobilizado. Controle total de aquisições, transferências, baixas e ordens de serviço com dashboards inteligentes.', 
      icon: <Monitor size={32} className="text-primary" />,
      features: ['Dashboards em tempo real', 'Sincronismo Online', 'Segurança Jurídica']
    },
    { 
      title: 'App de Inventário (Mobile)', 
      description: 'Inventário físico digital, rápido e confiável. Coleta em campo sem papel com integração QR Code ou RFID e sincronização instantânea com a nuvem.', 
      icon: <Smartphone size={32} className="text-info" />,
      features: ['Coleta Offline', 'QR Code / RFID', 'Redução de erros em 90%']
    }
  ];

  const processSteps = [
    { title: 'DIRETRIZES & POLÍTICA', desc: 'Definição de normas, manuais de procedimentos e governança patrimonial.', icon: <Search size={20} /> },
    { title: 'INVENTÁRIO (SANEAMENTO)', desc: 'Levantamento físico padronizado e conciliação físico x contábil de alta precisão.', icon: <ClipboardCheck size={20} /> },
    { title: 'AVALIAÇÃO & VIDA ÚTIL', desc: 'Revisão técnica, laudos normativos e atendimento rigoroso ao CPC 27.', icon: <BarChart3 size={20} /> },
    { title: 'ASSET SYSTEM', desc: 'Monitoramento contínuo, dashboards BI e controle total via software.', icon: <CheckCircle size={20} /> }
  ];

  const segments = [
    { name: 'Energia', desc: 'PCHs e Concessões', icon: <Zap size={20} /> },
    { name: 'Portos', desc: 'Infraestrutura Portuária', icon: <Anchor size={20} /> },
    { name: 'Indústria', desc: 'Manufatura e Produção', icon: <Building2 size={20} /> },
    { name: 'Agronegócio', desc: 'Complexos Industriais', icon: <Target size={20} /> },
    { name: 'Logística', desc: 'Transporte e Armazém', icon: <Globe size={20} /> },
    { name: 'Varejo', desc: 'Grandes Redes', icon: <Package size={20} /> },
    { name: 'Hospitalar', desc: 'Saúde e Tecnologia', icon: <Activity size={20} /> },
    { name: 'Órgãos Públicos', desc: 'Gestão de Ativos Estatais', icon: <Shield size={20} /> }
  ];

  return (
    <div className="min-h-screen bg-[#0b1220] text-white selection:bg-primary/30 scroll-smooth">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#0b1220]/80 backdrop-blur-xl border-b border-white/10 px-6 py-6 flex items-center transition-all duration-500">
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button onClick={onSelectPortal} className="flex items-center gap-4 group">
              <div className="p-3 bg-white/5 rounded-2xl group-hover:bg-primary transition-all shadow-lg">
                <LogOut size={20} className="text-primary group-hover:text-white rotate-180" />
              </div>
              <span className="font-extrabold text-3xl tracking-tighter uppercase text-white italic">Asset <span className="text-primary italic">Solution</span></span>
            </button>
          </div>
          <div className="hidden lg:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.2em] text-muted italic">
            <a href="#solutions" className="hover:text-primary transition-colors">Soluções</a>
            <a href="#services" className="hover:text-primary transition-colors">Serviços</a>
            <a href="#process" className="hover:text-primary transition-colors">Como Funciona</a>
            <a href="#about" className="hover:text-primary transition-colors">Sobre</a>
            <a href="#contact" className="hover:text-primary transition-colors">Contato</a>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={onEnterSystem}
              className="px-8 py-4 bg-primary text-black rounded-2xl font-black text-[11px] transition-all uppercase tracking-widest flex items-center gap-2 shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 italic"
            >
              ACESSAR SISTEMA <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-40 right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-10 left-[-10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block px-4 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-widest mb-8">
              Excelência em Gestão Patrimonial
            </span>
            <h1 className="text-4xl md:text-7xl font-black mb-8 leading-[0.95] tracking-tighter uppercase italic">
              <span className="text-white">Controle total</span> <br /> 
              <span className="text-white">do ativo imobilizado,</span> <br /> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60a5fa] via-[#a78bfa] to-[#c084fc]">do inventário à decisão.</span>
            </h1>
            <p className="text-muted text-lg mb-10 max-w-lg leading-relaxed font-medium">
              A <strong>Asset Solution</strong> transforma o ativo imobilizado em informação confiável, auditável e valorizada, combinando consultoria especializada e tecnologia própria para eliminar riscos, retrabalho e perdas patrimoniais.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <button 
                onClick={onEnterSystem}
                className="w-full sm:w-auto px-10 py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all text-center text-sm shadow-xl"
              >
                ACESSAR SISTEMA
              </button>
              <a href="#contact" className="w-full sm:w-auto px-10 py-5 border border-white/20 text-white flex items-center justify-center font-black uppercase tracking-widest rounded-2xl hover:bg-white/5 transition-all text-sm">
                Solicitar Proposta
              </a>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center text-success"><Check size={14} /></div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Acuracidade Comprovada</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center text-success"><Check size={14} /></div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Conformidade Contábil</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center text-success"><Check size={14} /></div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Dashboards em tempo real</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-square bg-gradient-to-br from-primary/10 to-transparent border border-white/10 rounded-[48px] p-6 md:p-10 glass overflow-hidden shadow-2xl relative">
              <div className="relative z-10 grid grid-cols-2 gap-4 md:gap-6 h-full font-sans">
                {/* Dashboard Widget */}
                <motion.div 
                  animate={{ y: [0, -10, 0], scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  className="bg-panel border border-white/10 p-5 rounded-3xl flex flex-col justify-between shadow-xl relative overflow-hidden group"
                >
                  <motion.div 
                    animate={{ x: ['-200%', '200%'] }} 
                    transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]"
                  />
                  <div className="flex justify-between items-center relative z-10">
                    <PieChartIcon className="text-primary" size={20} />
                    <span className="text-[8px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black">AUDITADO</span>
                  </div>
                  <div className="py-2 relative z-10">
                    <p className="text-[9px] font-bold text-muted uppercase tracking-widest">Base de Ativos</p>
                    <motion.p 
                      animate={{ opacity: [1, 0.5, 1] }} 
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="text-3xl font-black tracking-tighter"
                    >
                      99.8%
                    </motion.p>
                    <p className="text-[8px] text-success font-bold mt-1 tracking-widest uppercase">Acuracidade Física</p>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden relative z-10">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: ['80%', '99.8%', '92%', '99.8%'] }} 
                      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} 
                      className="h-full bg-success shadow-[0_0_15px_rgba(34,197,94,0.6)]" 
                    />
                  </div>
                </motion.div>

                {/* Status Widget */}
                <motion.div 
                  animate={{ y: [0, 10, 0], rotate: [-1, 1, -1] }}
                  transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
                  className="bg-panel border border-white/10 p-5 rounded-3xl flex flex-col justify-between shadow-xl group overflow-hidden relative"
                >
                  <div className="flex justify-between items-center relative z-10">
                    <Smartphone className="text-info" size={20} />
                    <motion.div animate={{ opacity: [0.3, 1, 0.3], scale: [1, 2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 rounded-full bg-info shadow-[0_0_12px_rgba(0,186,211,1)]" />
                  </div>
                  <div className="text-center py-4 relative z-10">
                    <motion.p 
                      animate={{ scale: [1, 1.1, 1], letterSpacing: ['0.1em', '0.3em', '0.1em'] }}
                      transition={{ repeat: Infinity, duration: 4 }}
                      className="text-[24px] font-black tracking-tighter text-info sm:text-[28px]"
                    >
                      LIVE
                    </motion.p>
                    <p className="text-[8px] uppercase font-bold text-muted tracking-[0.2em]">Sincronismo Social</p>
                  </div>
                  <div className="flex justify-center gap-1.5 relative z-10">
                    {[1, 2, 3, 4].map(i => (
                      <motion.div 
                        key={i} 
                        animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
                        className="w-1.5 h-1.5 rounded-full bg-info" 
                      />
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-info/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </motion.div>

                {/* Big Indicator Chart */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  className="col-span-2 bg-[#0b1220]/60 border border-white/10 p-6 rounded-[32px] flex flex-col justify-between shadow-inner group relative overflow-hidden"
                >
                  <div className="flex justify-between items-start relative z-10">
                    <div>
                      <h4 className="text-[12px] font-black uppercase tracking-widest text-white/50 mb-1">Crescimento Patrimonial</h4>
                      <p className="text-2xl font-black tracking-tighter leading-tight text-white italic">+15 ANOS <span className="text-primary not-italic">EXP</span></p>
                    </div>
                    <motion.div 
                      animate={{ rotate: 360, scale: [1, 1.2, 1] }} 
                      transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
                      className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10"
                    >
                      <BarChart3 size={16} className="text-primary" />
                    </motion.div>
                  </div>
                  
                  <div className="flex items-end gap-1.5 h-24 mt-4 relative z-10">
                    {[40, 70, 45, 95, 65, 85, 55, 100].map((h, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ height: 0 }} 
                        animate={{ height: [`${h * 0.7}%`, `${h}%`, `${h * 0.85}%`] }} 
                        transition={{ delay: i * 0.1, duration: 2.5, repeat: Infinity, ease: "easeInOut" }} 
                        className="flex-1 bg-gradient-to-t from-primary/30 via-primary/60 to-primary rounded-t-lg relative group/bar" 
                      >
                        <motion.div 
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                          className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_12px_white]"
                        />
                      </motion.div>
                    ))}
                  </div>
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
                </motion.div>
              </div>
            </div>
            {/* Abstract Shapes */}
            <div className="absolute -top-6 -right-6 w-12 h-12 bg-primary/20 rounded-full blur-xl" />
            <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-purple-500/20 rounded-full blur-2xl" />
          </motion.div>
        </div>
      </section>

      {/* Prova Rápida (Stats) */}
      <section className="py-12 bg-[#0d1627] border-y border-white/5 shadow-inner">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center md:text-left">
              <p className="text-3xl md:text-5xl font-black text-white">99,8%</p>
              <p className="text-[10px] uppercase font-bold text-muted tracking-widest mt-1">Acuracidade do Inventário</p>
            </div>
            <div className="text-center md:text-left">
              <p className="text-3xl md:text-5xl font-black text-primary">Live</p>
              <p className="text-[10px] uppercase font-bold text-muted tracking-widest mt-1">Sincronismo Online</p>
            </div>
            <div className="text-center md:text-left">
              <p className="text-3xl md:text-5xl font-black text-white">+15 Anos</p>
              <p className="text-[10px] uppercase font-bold text-muted tracking-widest mt-1">De Experiência Patrimonial</p>
            </div>
            <div className="text-center md:text-left border-l md:border-l-0 border-white/10 pl-4 md:pl-0">
              <p className="text-3xl md:text-5xl font-black text-amber-500">Nacional</p>
              <p className="text-[10px] uppercase font-bold text-muted tracking-widest mt-1">Atuação em todo Brasil</p>
            </div>
          </div>
        </div>
      </section>

      {/* O Problema */}
      <section className="py-32 px-6 relative">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="max-w-4xl mx-auto text-center mb-20">
          <h2 className="text-[10px] text-primary font-black uppercase tracking-[0.3em] mb-6">Auditoria e Governança</h2>
          <h3 className="text-3xl md:text-5xl font-black mb-8 leading-tight">O custo de não ter controle <br /> é maior do que você imagina.</h3>
          <p className="text-muted text-lg max-w-2xl mx-auto italic">
            "Patrimônio sem gestão é lucro que escorre pelos dedos e risco que trava a sua auditoria."
          </p>
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { t: 'Ativos Fantasmas', d: 'Bens que constam no balanço mas não existem no físico, distorcendo o valor real da empresa.', icon: <AlertTriangle className="text-danger" /> },
            { t: 'Riscos de Auditoria', d: 'Exposição a multas e ressalvas em auditorias externas (PWC, EY, Deloitte, KPMG).', icon: <Shield className="text-amber-500" /> },
            { t: 'Inventários Caros', d: 'Processos manuais, demorados e que já nascem desatualizados pela falta de tecnologia.', icon: <Clock className="text-muted" /> },
            { t: 'Decisões no Escuro', d: 'Dificuldade em visualizar o ciclo de vida do ativo para decisões inteligentes de CAPEX.', icon: <BarChart3 className="text-primary" /> }
          ].map((item, i) => (
            <div key={i} className="p-8 bg-white/5 border border-white/5 rounded-3xl flex flex-col gap-6 hover:bg-white/10 transition-all group">
              <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-xl">{item.icon}</div>
              <div>
                <h4 className="text-lg font-black uppercase mb-3 tracking-tighter leading-tight">{item.t}</h4>
                <p className="text-muted text-xs leading-relaxed font-medium">{item.d}</p>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-20 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-primary/10 border border-primary/20 rounded-full text-primary font-black text-xs uppercase tracking-widest">
            <Rocket size={16} /> A Asset Solution elimina o retrabalho e protege seu valor.
          </div>
        </div>
      </section>

      {/* As Soluções (Product) */}
      <section id="solutions" className="py-32 px-6 bg-[#080e1a] relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-[10px] text-primary font-black uppercase tracking-[0.3em] mb-6">Tecnologia Própria</h2>
            <h3 className="text-3xl md:text-5xl font-black mb-8 leading-[0.9]">Sistemas de Alta Performance</h3>
            <p className="text-muted text-lg max-w-2xl mx-auto italic">
              "Desenvolvemos tecnologia para trazer a precisão da era digital para o dia a dia da sua gestão."
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
            {solutions.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="p-10 bg-white/5 border border-white/10 rounded-[40px] hover:border-primary/50 transition-all group flex flex-col relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                  {idx === 0 ? <Globe size={120} /> : <Zap size={120} />}
                </div>
                
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-primary/20 transition-all text-primary">
                  {item.icon}
                </div>
                <h3 className="text-2xl font-black uppercase mb-6 tracking-tight">{item.title}</h3>
                <p className="text-muted text-lg leading-relaxed mb-8 flex-grow">
                  {item.description}
                </p>
                
                <div className="space-y-4 mb-10">
                  {item.features.map(f => (
                    <div key={f} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center text-success"><Check size={12} /></div>
                      <span className="text-xs font-bold text-white/80">{f}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-8 border-t border-white/5 flex items-center justify-between">
                  <button onClick={onEnterSystem} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline flex items-center gap-2">
                    Saiba Mais <ArrowRight size={12} />
                  </button>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
             {[
               { t: 'Dashboards BI', d: 'Visão executiva do seu patrimônio em poucos cliques.', i: <BarChart3 /> },
               { t: 'Gestão Offline', d: 'Trabalhe em áreas sem conexão com sincronização posterior.', i: <Smartphone /> },
               { t: 'Prazos Legais', d: 'Alertas de revisão e atendimentos regulatórios.', i: <Clock /> },
               { t: 'Suporte Técnico', d: 'Consultores especializados acompanhando sua equipe.', i: <Headphones /> }
             ].map((feature, i) => (
                <div key={i} className="p-6 bg-white/5 border border-white/5 rounded-2xl flex flex-col items-center text-center">
                  <div className="text-primary mb-4">{feature.i}</div>
                  <h5 className="font-black uppercase text-sm mb-2">{feature.t}</h5>
                  <p className="text-xs text-muted leading-relaxed">{feature.d}</p>
                </div>
             ))}
          </div>
        </div>
      </section>

      {/* Como Funciona (Process) */}
      <section id="process" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-16 items-center">
            <div className="lg:w-1/2">
               <h2 className="text-[10px] text-primary font-black uppercase tracking-[0.3em] mb-6">Metodologia</h2>
               <h3 className="text-3xl md:text-5xl font-black mb-8 leading-tight italic">Do diagnóstico à gestão automatizada.</h3>
               <p className="text-muted text-lg mb-8 leading-relaxed italic">
                 "Nossa entrega não termina no laudo. Nós transformamos o processo em cultura patrimonial dentro da sua organização."
               </p>
               <button onClick={onEnterSystem} className="px-8 py-4 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:bg-white/90 transition-all text-xs">
                 Conhecer o Processo
               </button>
            </div>
            
            <div className="lg:w-1/2 grid grid-cols-1 gap-6 relative">
               <div className="absolute left-[26px] top-8 bottom-8 w-px bg-white/10 hidden sm:block" />
               {processSteps.map((step, i) => (
                 <motion.div 
                   key={i}
                   initial={{ opacity: 0, x: 20 }}
                   whileInView={{ opacity: 1, x: 0 }}
                   viewport={{ once: true }}
                   transition={{ delay: i * 0.1 }}
                   className="flex gap-6 items-start relative z-10"
                 >
                   <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center shrink-0 text-primary shadow-xl">
                     {step.icon}
                   </div>
                   <div>
                     <h4 className="text-lg font-black uppercase mb-1">{step.title}</h4>
                     <p className="text-muted text-sm leading-relaxed">{step.desc}</p>
                   </div>
                 </motion.div>
               ))}
            </div>
          </div>
        </div>
      </section>

      {/* Serviços (Authority) */}
      <section id="services" className="py-32 px-6 bg-[#0d1627]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
            <div className="max-w-2xl">
               <h2 className="text-[10px] text-primary font-black uppercase tracking-[0.3em] mb-4">Serviços Especializados</h2>
               <h3 className="text-3xl md:text-5xl font-black leading-[0.9]">Excelência Técnica e Normativa</h3>
            </div>
            <div className="hidden md:block">
              <p className="text-muted text-xs max-w-xs font-medium uppercase tracking-widest leading-relaxed">
                Seguimos rigorosamente os padrões CPC, IFRS e normas brasileiras de avaliação.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, idx) => (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.05 }}
                className="p-10 bg-white/5 border border-white/10 rounded-[32px] hover:border-primary/50 transition-all flex flex-col group"
              >
                <div className="flex justify-between items-start mb-8">
                  <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    {service.icon}
                  </div>
                  <span className="text-[8px] px-2 py-1 bg-white/5 border border-white/10 rounded-full font-black text-muted tracking-widest group-hover:text-primary transition-colors">
                    {service.tag}
                  </span>
                </div>
                <h4 className="text-xl font-black uppercase mb-4 leading-tight">{service.title}</h4>
                <p className="text-muted text-sm leading-relaxed mb-6 flex-grow italic">
                  {service.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* Segmentos (Scale) */}
      <section id="segments" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-[10px] text-primary font-black uppercase tracking-[0.3em] mb-6">Expertise Multissetorial</h2>
            <h3 className="text-3xl md:text-5xl font-black mb-8 leading-tight">Soluções Adaptadas <br /> para o seu Negócio</h3>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4">
            {segments.map((s, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="px-8 py-6 bg-white/5 border border-white/5 rounded-3xl flex items-center gap-4 hover:bg-primary/10 hover:border-primary/20 transition-all cursor-default"
              >
                <div className="text-primary italic shrink-0">{s.icon}</div>
                <div>
                   <p className="font-black uppercase text-xs tracking-widest">{s.name}</p>
                   <p className="text-[10px] text-muted font-bold">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Sobre (History) */}
      <section id="about" className="py-32 px-6 bg-[#080e1a] relative overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
           <div className="relative">
              <div className="aspect-video bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-[48px] border border-white/10 flex items-center justify-center overflow-hidden shadow-2xl">
                 <div className="text-center p-12 relative z-10">
                    <p className="text-6xl font-black text-white/10 mb-4 tracking-tighter italic whitespace-nowrap">EST. 2009</p>
                    <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Asset Solution</p>
                 </div>
                 <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay opacity-20" />
              </div>
              <div className="absolute -bottom-6 -right-6 p-10 bg-white shadow-2xl rounded-3xl hidden md:block">
                 <p className="text-black font-black text-4xl tracking-tighter leading-none italic">+15 ANOS</p>
                 <p className="text-black/50 text-[10px] font-bold uppercase tracking-widest mt-1">Impactando o Mercado</p>
              </div>
           </div>
           <div>
              <h2 className="text-[10px] text-primary font-black uppercase tracking-[0.3em] mb-6 tracking-widest">Legado e Inovação</h2>
              <h3 className="text-3xl md:text-5xl font-black mb-8 leading-tight italic">Nossa História: Rigor técnico e visão estratégica.</h3>
              <div className="space-y-6 text-muted leading-relaxed font-medium">
                <p>
                  A <strong>Asset Solution</strong> surgiu para preencher o gap entre a necessidade técnica de auditoria e a praticidade da gestão operacional. Somos mais que uma consultoria; somos parceiros estratégicos dos nossos clientes na proteção de seus ativos.
                </p>
                <p>
                  Com uma equipe que soma décadas de experiência nos maiores projetos de infraestrutura do país, entregamos laudos e sistemas que resistem ao mais rigoroso crivo institucional, atendendo normas como CPC 27, CPC 01, CPC 04, CPC 06 e ABNT NBR 14653.
                </p>
                <div className="grid grid-cols-2 gap-6 pt-6">
                   <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                      <p className="text-2xl font-black text-white italic">PP&E</p>
                      <p className="text-[10px] uppercase font-bold text-muted tracking-widest">Property, Plant and Equipment</p>
                   </div>
                   <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                      <p className="text-2xl font-black text-white italic">100%</p>
                      <p className="text-[10px] uppercase font-bold text-muted tracking-widest">Aprovação Auditoria</p>
                   </div>
                </div>
              </div>
           </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-32 px-6 bg-[#0b1220] relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 md:gap-32">
            <div>
              <h2 className="text-3xl md:text-5xl font-black mb-12 leading-[1.1] tracking-tighter uppercase italic">
                <span className="text-white">Controle total</span> <br /> 
                <span className="text-white">do ativo imobilizado,</span> <br /> 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60a5fa] via-[#a78bfa] to-[#c084fc]">do inventário à decisão.</span>
              </h2>
              <p className="text-muted text-xl mb-16 leading-relaxed max-w-md">
                Pronto para dar o próximo passo? Nossa equipe de especialistas aguarda seu contato.
              </p>
              
              <div className="space-y-12">
                <div className="flex items-center gap-6 group cursor-pointer">
                  <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center group-hover:bg-primary transition-all shadow-xl">
                    <Mail size={24} className="text-primary group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">Fale conosco</p>
                    <p className="text-xl font-black group-hover:text-primary transition-colors italic">contato@assetbr.com.br</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-6 group cursor-pointer" onClick={() => window.open('https://wa.me/556521298243', '_blank')}>
                  <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center group-hover:bg-primary transition-all shadow-xl">
                    <MessageCircle size={24} className="text-primary group-hover:text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">WhatsApp Business</p>
                    <p className="text-xl font-black group-hover:text-primary transition-colors italic leading-tight">+55 (65) 2129-8243<br />+55 (65) 99205-8727</p>
                  </div>
                </div>

                <div className="flex items-start gap-6 group">
                  <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center shrink-0 shadow-xl">
                    <MapPin size={24} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-[0.2em] mb-1">Localização</p>
                    <p className="text-lg font-black italic max-w-xs leading-tight">Rua Trinta e Dois, Sl 201 Bloco 09, Santa Cruz II - Cuiabá/MT</p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-6 mt-16">
                 <a href="https://www.linkedin.com/company/assetsolution" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary transition-all text-white group shadow-lg">
                    <Linkedin size={20} className="group-hover:scale-110 transition-transform" />
                 </a>
                 <a href="https://www.instagram.com/assetbr/" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary transition-all text-white group shadow-lg">
                    <Instagram size={20} className="group-hover:scale-110 transition-transform" />
                 </a>
                 <a href="https://www.facebook.com/AssetConsultoriaBR" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-primary transition-all text-white group shadow-lg">
                    <Facebook size={20} className="group-hover:scale-110 transition-transform" />
                 </a>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 p-10 rounded-[48px] shadow-2xl relative">
               <div className="absolute top-0 left-0 w-full h-2 bg-primary rounded-t-full" />
               <h3 className="text-2xl font-black uppercase mb-10 tracking-tight">Envie sua mensagem</h3>
               <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-1">Nome Completo</label>
                    <input type="text" placeholder="Como podemos te chamar?" className="w-full bg-[#0b1220] border border-white/10 rounded-2xl p-5 focus:border-primary outline-none text-white transition-all shadow-inner" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-1">E-mail Corporativo</label>
                    <input type="email" placeholder="seuemail@empresa.com.br" className="w-full bg-[#0b1220] border border-white/10 rounded-2xl p-5 focus:border-primary outline-none text-white transition-all shadow-inner" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted ml-1">Mensagem</label>
                    <textarea rows={4} placeholder="Descreva brevemente sua necessidade..." className="w-full bg-[#0b1220] border border-white/10 rounded-2xl p-5 focus:border-primary outline-none text-white transition-all resize-none shadow-inner" />
                  </div>
                  <button type="submit" className="w-full py-5 bg-primary text-white font-black uppercase tracking-widest rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/20">Enviar Mensagem</button>
                </form>
              </div>
            </div>
          </div>
        </section>

      {/* CTA Final */}
      <section className="py-32 px-6 bg-primary relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/10 rounded-full blur-[120px] -mr-48 -mt-48" />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-6xl font-black text-white mb-8 tracking-tighter uppercase leading-[1.1]">
            "Transformamos o ativo imobilizado em informação confiável, auditável e valorizada."
          </h2>
          <p className="text-white/80 text-xl md:text-2xl mb-12 font-medium max-w-3xl mx-auto">
            Não deixe para amanhã a segurança que sua auditoria exige hoje. Fale com um especialista e descubra o poder da inteligência patrimonial.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
             <a href="#contact" className="px-12 py-6 bg-[#0b1220] text-white font-black uppercase tracking-widest shadow-2xl rounded-2xl hover:scale-105 transition-all text-sm text-center italic">Agendar Demonstração</a>
             <a href="#contact" className="px-12 py-6 border-2 border-[#0b1220] text-[#0b1220] font-black uppercase tracking-widest rounded-2xl hover:bg-[#0b1220]/10 transition-all text-sm text-center italic">Solicitar Proposta</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <GroupFooter 
        brand="ASSET SOLUTION" 
        onSelectAsset={() => {}}
        onSelectAccounting={onSelectAccounting}
        onSelectPortal={onSelectPortal}
        setModalContent={setModalContent}
        onEnterSystem={onEnterSystem}
      />

      {/* Floating Elements */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-4">
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={scrollToTop}
              className="w-16 h-16 bg-white/10 backdrop-blur-xl border border-white/20 text-white rounded-3xl flex items-center justify-center hover:bg-primary transition-all shadow-2xl"
            >
              <ArrowUp size={28} />
            </motion.button>
          )}
        </AnimatePresence>
        <motion.a
          href="https://wa.me/556521298243"
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.1 }}
          className="w-20 h-20 bg-[#25d366] text-white rounded-[32px] flex items-center justify-center shadow-2xl shadow-green-500/20 group relative overflow-hidden"
        >
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
            <MessageCircle size={40} />
          </motion.div>
          <span className="absolute right-full mr-8 px-6 py-3 bg-white text-black text-[10px] font-black uppercase tracking-[0.4em] rounded-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all shadow-2xl pointer-events-none italic translate-x-4 group-hover:translate-x-0">
            Fale com um especialista
          </span>
        </motion.a>
      </div>

      {/* Privacy/Terms Modal */}
      <AnimatePresence>
        {modalContent && (
          <TermsModal content={modalContent} onClose={() => setModalContent(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
function InternalApp({ onGoBack }: { onGoBack: () => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setFbUser(user);
      if (!user) {
        setUser(null);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;

    async function syncProfile() {
      if (!fbUser) return;
      
      setLoading(true);
      const userRef = doc(db, 'users', fbUser.uid);
      
      try {
        const docSnap = await getDoc(userRef);
        
        if (!docSnap.exists()) {
          // Migration or Creation phase (one-time logic)
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', fbUser.email));
          const querySnap = await getDocs(q);

          if (!querySnap.empty) {
            const preProfile = querySnap.docs[0].data();
            const preId = querySnap.docs[0].id;
            
            const userData: User = {
              ...preProfile as User,
              id: fbUser.uid
            };
            
            await setDoc(userRef, {
              ...userData,
              lastLogin: serverTimestamp()
            });

            if (preId !== fbUser.uid) {
              await deleteDoc(doc(db, 'users', preId));
            }
          } else {
            const userData: User = {
              id: fbUser.uid,
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Novo Usuário',
              email: fbUser.email || '',
              role: fbUser.email?.toLowerCase() === 'rodrigomaciel.sousa@gmail.com' ? 'ADMINISTRADOR' : 'USUARIO',
              avatar: fbUser.photoURL || `https://ui-avatars.com/api/?name=${fbUser.displayName || fbUser.email}&background=random`
            };
            await setDoc(userRef, {
              ...userData,
              lastLogin: serverTimestamp()
            });
          }
        } else {
          // Ensure admin role for owner even if already exists
          const currentData = docSnap.data() as User;
          if (fbUser.email?.toLowerCase() === 'rodrigomaciel.sousa@gmail.com' && currentData.role !== 'ADMINISTRADOR') {
            await updateDoc(userRef, { role: 'ADMINISTRADOR' });
          }
        }

        // After creation/migration/check, start real-time listener
        unsubscribeUser = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUser(snapshot.data() as User);
            setLoading(false);
          }
        }, (err) => {
          console.error("Profile listener error:", err);
          setLoading(false);
        });

      } catch (error) {
        console.error("Critical error in syncProfile:", error);
        // Fallback for owner
        if (fbUser.email?.toLowerCase() === 'rodrigomaciel.sousa@gmail.com') {
          setUser({
            id: fbUser.uid,
            name: fbUser.displayName || 'Admin',
            email: fbUser.email!,
            role: 'ADMINISTRADOR',
            avatar: fbUser.photoURL || ''
          });
        }
        setLoading(false);
      }
    }

    syncProfile();

    return () => {
      if (unsubscribeUser) unsubscribeUser();
    };
  }, [fbUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const email = (e.target as any)[0].value;
    const password = (e.target as any)[1].value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setLoginError("E-mail ou senha incorretos.");
      } else {
        setLoginError("Erro ao tentar entrar. Tente novamente mais tarde.");
      }
      console.error(error);
    }
  };

  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleResetPassword = async () => {
    const email = prompt("Digite seu e-mail para receber as instruções de senha:");
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      setNotification({ message: 'E-mail de recuperação enviado! Confira sua caixa de entrada.', type: 'success' });
      setTimeout(() => setNotification(null), 5000);
    } catch (error: any) {
      setNotification({ message: 'Erro ao enviar e-mail. Verifique se o e-mail está correto.', type: 'error' });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      setLoginError("Erro ao autenticar com o Google.");
      console.error(error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const [view, setView] = useState<'dashboard' | 'assets' | 'form' | 'movements' | 'baixa' | 'reports' | 'settings' | 'inventory' | 'bi' | 'compliance' | 'collector' | 'users' | 'companies'>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  
  const [assets, setAssets] = useState<Asset[]>(INITIAL_ASSETS);
  
  // Hooks para Alertas e Logs de Auditoria
  const { alerts, unreadCount, markAsRead, deleteAlert } = useAssetAlerts(assets);
  const { logs, addLog } = useAuditLog();

  const unreadAlertsCount = unreadCount;
  const [movements, setMovements] = useState<Movement[]>([
    {
      id: 'MV-001',
      number: '1',
      type: 'TRANSFERENCIA',
      status: 'PENDENTE',
      requestDate: '2024-04-05',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel',
      origin: { company: 'Empresa Matriz SP', branch: 'Sede Principal', responsible: 'João Silva' },
      destination: { company: 'Empresa Matriz SP', branch: 'Filial Rio de Janeiro', responsible: 'Pedro Lima' },
      isThirdParty: false,
      items: [
        {
          assetId: '121',
          assetSub: 0,
          assetName: 'Servidor PowerEdge R740',
          currentCostCenter: 'TI - Infraestrutura',
          bookValue: 45000,
          acquisitionValueBRL: 45000,
          acquisitionValueUSD: 9000
        }
      ]
    },
    {
      id: 'MV-002',
      number: '2',
      type: 'COMODATO',
      status: 'PENDENTE',
      requestDate: '2024-04-06',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel',
      origin: { company: 'Empresa Matriz SP', branch: 'Sede Principal', responsible: 'João Silva' },
      destination: { company: 'Cliente Externo', branch: 'Cliente Externo', responsible: 'José Cliente' },
      isThirdParty: true,
      thirdParty: { name: 'Empresa Parceira Ltda', cnpj: '12.345.678/0001-90' },
      items: [
        {
          assetId: '125',
          assetSub: 0,
          assetName: 'Impressora Laser Industrial',
          currentCostCenter: 'Administrativo',
          bookValue: 12000,
          acquisitionValueBRL: 12000,
          acquisitionValueUSD: 2400
        }
      ]
    },
    {
      id: 'MV-003',
      number: '3',
      type: 'CONSERTO',
      status: 'EXECUTADO',
      requestDate: '2024-01-10',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel',
      origin: { company: 'Empresa Matriz SP', branch: 'Sede Principal', responsible: 'João Silva' },
      destination: { company: 'Oficina Especializada', branch: 'Oficina Especializada', responsible: 'Técnico Responsável' },
      isThirdParty: true,
      items: [
        {
          assetId: '124',
          assetSub: 0,
          assetName: 'Veículo Utilitário Fiorino',
          currentCostCenter: 'Logística',
          bookValue: 85000,
          acquisitionValueBRL: 85000,
          acquisitionValueUSD: 17000
        }
      ]
    },
    {
      id: 'MV-004',
      number: '4',
      type: 'EMPRESTIMO',
      status: 'PENDENTE',
      requestDate: '2024-04-07',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel',
      origin: { company: 'Empresa Matriz SP', branch: 'Sede Principal', responsible: 'João Silva' },
      destination: { company: 'Filial Rio de Janeiro', branch: 'Escritório Centro', responsible: 'Pedro Lima' },
      isThirdParty: false,
      items: [
        {
          assetId: '120',
          assetSub: 0,
          assetName: 'Notebook Dell Latitude',
          currentCostCenter: 'TI - Infraestrutura',
          bookValue: 4500,
          acquisitionValueBRL: 4500,
          acquisitionValueUSD: 900
        }
      ]
    },
    {
      id: 'MV-005',
      number: '5',
      type: 'CONSERTO',
      status: 'PENDENTE',
      requestDate: '2024-04-08',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel',
      origin: { company: 'CD Barueri', branch: 'CD Barueri', responsible: 'Carlos Oliveira' },
      destination: { company: 'Oficina Autorizada', branch: 'Oficina Autorizada', responsible: 'Técnico' },
      isThirdParty: true,
      thirdParty: { name: 'Manutenção Pesada S.A.', cnpj: '98.765.432/0001-10' },
      items: [
        {
          assetId: '128',
          assetSub: 0,
          assetName: 'Empilhadeira Elétrica',
          currentCostCenter: 'Logística',
          bookValue: 120000,
          acquisitionValueBRL: 120000,
          acquisitionValueUSD: 24000
        }
      ]
    },
    {
      id: 'MV-006',
      number: '6',
      type: 'ALTERACAO',
      status: 'PENDENTE',
      requestDate: '2024-04-10',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel',
      origin: { company: 'Empresa Matriz SP', branch: 'Sede Principal', responsible: 'João Silva' },
      destination: { company: 'Empresa Matriz SP', branch: 'Sede Principal', responsible: 'João Silva' },
      isThirdParty: false,
      details: 'Alteração de Localização de Sede - 2º Andar para Sede - 3º Andar',
      items: [
        {
          assetId: '120',
          assetSub: 0,
          assetName: 'Notebook Dell Latitude',
          currentCostCenter: 'TI - Infraestrutura',
          bookValue: 4500,
          acquisitionValueBRL: 4500,
          acquisitionValueUSD: 900
        }
      ]
    }
  ]);
  const [baixaRequests, setBaixaRequests] = useState<BaixaRequest[]>([
    {
      id: 'BX-001',
      assetId: '120',
      assetSub: 0,
      assetName: 'Notebook Dell Latitude',
      acquisitionValueBRL: 4500,
      acquisitionValueUSD: 900,
      reason: 'OBSOLESCENCIA',
      date: '2024-04-01',
      status: 'PENDENTE',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel'
    },
    {
      id: 'BX-002',
      assetId: '122',
      assetSub: 0,
      assetName: 'Cadeira Ergonômica Pro',
      acquisitionValueBRL: 1200,
      acquisitionValueUSD: 240,
      reason: 'DANO',
      date: '2024-04-09',
      status: 'PENDENTE',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel'
    },
    {
      id: 'BX-003',
      assetId: '124',
      assetSub: 0,
      assetName: 'Veículo Utilitário Fiorino',
      acquisitionValueBRL: 85000,
      acquisitionValueUSD: 17000,
      reason: 'VENDA',
      date: '2024-04-10',
      status: 'PENDENTE',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel'
    },
    {
      id: 'BX-004',
      assetId: '127',
      assetSub: 0,
      assetName: 'Ar Condicionado Central VRF',
      acquisitionValueBRL: 125000,
      acquisitionValueUSD: 25000,
      reason: 'DOACAO',
      date: '2024-04-12',
      status: 'PENDENTE',
      requesterId: '1',
      requesterName: 'Rodrigo Maciel'
    }
  ]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [menuVisibility, setMenuVisibility] = useState({
    dashboard: true,
    assets: true,
    movements: true,
    baixa: true,
    collector: true,
    inventory: true,
    reports: true,
    bi: true,
    compliance: true,
    settings: true
  });
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>(DEFAULT_FIELD_CONFIG);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>(INITIAL_COMPANIES);

  // Real-time Companies Fetching
  useEffect(() => {
    const q = query(collection(db, 'companies'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const companiesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company));
      if (companiesList.length > 0) {
        setCompanies(companiesList);
      }
    });
    return () => unsubscribe();
  }, []);
  
  // Real-time Users Fetching
  useEffect(() => {
    if (user?.role !== 'ADMINISTRADOR') return;
    
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({ ...doc.data() } as User));
      setUsers(usersList);
    });
    
    return () => unsubscribe();
  }, [user]);

  const [inventorySessions, setInventorySessions] = useState<InventorySession[]>([
    { 
      id: 'INV-2024-001', 
      date: '2024-03-15', 
      deadline: '2024-03-30',
      companyId: '1',
      companyName: 'Empresa Matriz',
      branchId: '1-1',
      branchName: 'Sede Principal',
      executorId: '1',
      executorName: 'Rodrigo Maciel',
      status: 'CONCLUÍDO', 
      accuracy: 98.5, 
      totalItems: 1250, 
      found: 1232, 
      missing: 18, 
      surplus: 5, 
      retired: 2 
    },
    { 
      id: 'INV-2024-002', 
      date: '2024-06-20', 
      deadline: '2024-07-05',
      companyId: '2',
      companyName: 'Filial Norte',
      branchId: '2-1',
      branchName: 'Escritório Centro',
      executorId: '2',
      executorName: 'Aprovador Teste',
      status: 'EM ANDAMENTO', 
      accuracy: 45.2, 
      totalItems: 850, 
      found: 384, 
      missing: 0, 
      surplus: 0, 
      retired: 0 
    },
  ]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [consultingAsset, setConsultingAsset] = useState<Asset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
  const [deletionReason, setDeletionReason] = useState('OBSOLESCENCIA');
  const [pendingEdit, setPendingEdit] = useState<{ original: Asset, updated: Asset } | null>(null);
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    d.setDate(0); // Last day of previous month
    return d.toISOString().split('T')[0];
  });
  const [depreciationMethod, setDepreciationMethod] = useState<'FISCAL' | 'ACCOUNTING'>('FISCAL');
  const [globalCompanyId, setGlobalCompanyId] = useState<string>('ALL');
  const [globalBranchId, setGlobalBranchId] = useState<string>('ALL');

  const filteredAssets = assets.filter(a => {
    if (globalCompanyId !== 'ALL' && a.companyId !== globalCompanyId) return false;
    if (globalBranchId !== 'ALL' && a.branchId !== globalBranchId) return false;
    return true;
  });

  const filteredMovements = movements.filter(m => {
    if (globalCompanyId !== 'ALL') {
      const company = companies.find(c => c.id === globalCompanyId);
      if (company && m.origin.company !== company.name && m.destination.company !== company.name) return false;
    }
    return true;
  });

  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currency, setCurrency] = useState<'BRL' | 'USD'>('BRL');
  const [searchTerm, setSearchTerm] = useState('');

  // Master Data States
  const [branches, setBranches] = useState<Branch[]>([
    { id: '1-1', companyId: '1', name: 'Sede Principal', cnpj: '00.000.000/0001-01' },
    { id: '2-1', companyId: '2', name: 'Escritório Centro', cnpj: '00.000.000/0002-01' },
    { id: '3-1', companyId: '3', name: 'CD Barueri', cnpj: '00.000.000/0003-01' },
    { id: '4-1', companyId: '4', name: 'Lab Inovação', cnpj: '00.000.000/0004-01' },
    { id: '5-1', companyId: '5', name: 'Unidade Operacional', cnpj: '00.000.000/0005-01' }
  ]);
  const [accounts, setAccounts] = useState<AccountingAccount[]>(ACCOUNTS.map((a, i) => ({ id: String(i), code: a.code, description: a.description })));
  const [classes, setClasses] = useState<AssetClass[]>(CLASSES.map((c, i) => ({ id: String(i), code: c.code, description: c.description })));
  const [costCenters, setCostCenters] = useState<CostCenter[]>(COST_CENTERS.map((cc, i) => ({ id: String(i), code: cc.code, description: cc.description })));
  const [ncms, setNcms] = useState<NCM[]>(NCM_DATA.map((n, i) => ({ 
    id: String(i), 
    code: n.code, 
    description: n.description,
    fiscalYears: n.fiscalYears,
    fiscalRate: n.fiscalRate
  })));

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
  }, [isDarkMode]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Workflow Handlers
  const handleCreateMovement = (movement: Movement) => {
    if (movements.find(m => m.id === movement.id)) {
      setMovements(movements.map(m => m.id === movement.id ? movement : m));
    } else {
      setMovements([...movements, movement]);
    }
    setView('movements');
  };

  const handleApproveMovement = (movementId: string) => {
    const movement = movements.find(m => m.id === movementId);
    if (!movement) return;

    if (movement.type === 'ALTERACAO' && movement.details?.updatedAsset) {
      addLog(
        user?.id || '1',
        user?.name || 'Sistema',
        `Aprovação de alteração do ativo ${movement.details.updatedAsset.id}`,
        'ASSET',
        movement.details.updatedAsset.id,
        `Alteração aprovada pelo supervisor.`
      );
      const updatedAsset = {
        ...movement.details.updatedAsset,
        status: 'ATIVO' as const,
        history: [
          {
            id: Math.random().toString(36).substr(2, 9),
            date: new Date().toISOString(),
            type: 'APROVACAO' as const,
            user: user?.name || 'Sistema',
            description: `Alteração de dados aprovada pelo supervisor.`
          },
          ...movement.details.updatedAsset.history
        ]
      };

      setAssets(assets.map(asset => 
        (asset.id === updatedAsset.id && asset.sub === updatedAsset.sub) ? updatedAsset : asset
      ));
    } else {
      addLog(
        user?.id || '1',
        user?.name || 'Sistema',
        `Aprovação de transferência: ${movement.number}`,
        'MOVEMENT',
        movement.id,
        `${movement.origin.branch} -> ${movement.destination.branch} (${movement.items.length} itens)`
      );
      const updatedAssets = assets.map(asset => {
        const item = movement.items.find(i => i.assetId === asset.id && i.assetSub === asset.sub);
        if (item) {
          return {
            ...asset,
            location: movement.destination.branch,
            responsible: movement.destination.responsible,
            status: 'ATIVO' as const,
            history: [
              ...asset.history,
              {
                id: Math.random().toString(36).substr(2, 9),
                date: new Date().toISOString(),
                type: 'TRANSFERENCIA' as const,
                user: user?.name || 'Sistema',
                description: `Transferência aprovada: ${movement.origin.branch} -> ${movement.destination.branch}`
              }
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          };
        }
        return asset;
      });

      setAssets(updatedAssets);
    }

    setMovements(movements.map(m => m.id === movementId ? { ...m, status: 'APROVADO' as const, approverId: user?.id, approvalDate: new Date().toISOString() } : m));
  };

  const handleBaixaRequest = (baixa: BaixaRequest) => {
    if (baixaRequests.find(r => r.id === baixa.id)) {
      setBaixaRequests(baixaRequests.map(r => r.id === baixa.id ? baixa : r));
    } else {
      setBaixaRequests([...baixaRequests, baixa]);
    }
    setView('baixa');
  };

  const handleApproveBaixa = (baixaId: string) => {
    const request = baixaRequests.find(r => r.id === baixaId);
    if (!request) return;

    addLog(
      user?.id || '1',
      user?.name || 'Sistema',
      `Aprovação de baixa definitiva: ${request.id}`,
      'BAIXA',
      request.assetId,
      `Motivo: ${request.reason}, Valor Baixado: ${request.acquisitionValueBRL}`
    );

    setAssets(assets.map(asset => {
      if (asset.id === request.assetId && asset.sub === request.assetSub) {
        return {
          ...asset,
          status: 'BAIXADO' as const,
          deactivationDate: new Date().toISOString().split('T')[0],
          history: [
            ...asset.history,
            {
              id: Math.random().toString(36).substr(2, 9),
              date: new Date().toISOString(),
              type: 'BAIXA' as const,
              user: user?.name || 'Sistema',
              description: `Baixa aprovada: ${request.reason}`
            }
          ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        };
      }
      return asset;
    }));

    setBaixaRequests(baixaRequests.map(r => r.id === baixaId ? { ...r, status: 'APROVADO' as const, approverId: user?.id, approvalDate: new Date().toISOString() } : r));
  };

  const handleDeleteMovement = (id: string) => {
    setMovements(movements.filter(m => m.id !== id));
  };

  const handleDeleteBaixa = (id: string) => {
    setBaixaRequests(baixaRequests.filter(r => r.id !== id));
  };

  // Auth Mock removed, using Firebase above

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1220] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 rounded-2xl border border-line bg-panel card-gradient shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <Package className="text-white" />
            </div>
              <div className="flex flex-col">
                <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic leading-none">Asset System</h1>
                <span className="text-[10px] text-primary uppercase tracking-[0.4em] font-black italic mt-1 ml-0.5">Enterprise Pro</span>
              </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-[10px] font-black uppercase text-center italic"
              >
                {loginError}
              </motion.div>
            )}
            <div>
              <label className="block text-[9px] font-black text-muted mb-1 uppercase tracking-[0.2em] ml-1">E-mail Corporativo</label>
              <input 
                type="email" 
                className="w-full bg-[#0d121f] border-white/5 focus:border-primary/50 text-white rounded-xl py-3 px-4 transition-all" 
                placeholder="seu@empresa.com.br" 
                required
              />
            </div>
            <div>
              <label className="block text-[9px] font-black text-muted mb-1 uppercase tracking-[0.2em] ml-1">Senha de Acesso</label>
              <input 
                type="password" 
                className="w-full bg-[#0d121f] border-white/5 focus:border-primary/50 text-white rounded-xl py-3 px-4 transition-all" 
                placeholder="••••••••" 
                required
              />
            </div>
            <button type="submit" className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-primary/20 text-xs mt-2 italic flex items-center justify-center gap-2">
              Entrar no Sistema
              <ArrowRight size={14} />
            </button>

            <div className="text-center pt-2">
              <button 
                type="button" 
                onClick={handleResetPassword}
                className="text-[9px] font-black text-primary hover:text-white transition-colors uppercase tracking-[0.2em] italic"
              >
                Esqueci minha senha / Primeiro Acesso
              </button>
            </div>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <div className="relative flex justify-center text-[9px] uppercase font-black tracking-widest">
                <span className="bg-[#1a2333] px-4 text-muted/60">Ou entrar com</span>
              </div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleLogin} 
              className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-3 text-[10px] italic"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google Account
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-white/5 text-center flex flex-col items-center gap-6">
            <button 
              type="button"
              onClick={onGoBack}
              className="group flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white/5 group-hover:border-primary/30 transition-all shadow-xl">
                <ArrowLeft size={18} className="text-muted group-hover:text-primary" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted group-hover:text-white transition-colors italic">
                  Voltar ao Portal Tríade
                </span>
                <span className="text-[8px] text-muted/40 uppercase font-bold tracking-widest mt-1">Retornar à página inicial</span>
              </div>
            </button>
            
            <p className="text-[9px] text-muted/60 uppercase tracking-[0.4em] font-black">
              Acesso Restrito • v1.0.0
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen flex bg-bg transition-colors duration-300", !isDarkMode && "light")}>
      <div className={cn("fixed inset-0 pointer-events-none transition-colors duration-300", !isDarkMode ? "bg-white" : "bg-bg")} style={{ zIndex: -1 }} />
      
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "bg-panel border-r border-line transition-all duration-300 flex flex-col fixed inset-y-0 left-0 z-[101] lg:sticky lg:top-0 lg:h-screen",
        isSidebarCollapsed ? "w-20" : "w-64",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-6 flex flex-col gap-6 border-b border-line">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary/40">
              <Package className="text-black" size={28} />
            </div>
            {!isSidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col">
                <h1 className="font-black text-3xl leading-none tracking-tighter uppercase text-white italic">Asset System</h1>
                <span className="text-[9px] text-primary uppercase tracking-[0.3em] font-black italic -mt-0.5 ml-0.5">Enterprise Pro</span>
              </motion.div>
            )}
          </div>
          {!isSidebarCollapsed && (
            <button 
              onClick={onGoBack}
              className="flex items-center gap-2 text-[10px] font-black uppercase text-muted hover:text-primary transition-colors text-left"
            >
              <Globe size={14} /> Voltar ao Site
            </button>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuVisibility.dashboard && (
            <NavItem 
              icon={<LayoutDashboard size={20} />} 
              label="Dashboard" 
              active={view === 'dashboard'} 
              collapsed={isSidebarCollapsed}
              onClick={() => setView('dashboard')}
            />
          )}
          {menuVisibility.assets && (
            <NavItem 
              icon={<Package size={20} />} 
              label="Ativos" 
              active={view === 'assets'} 
              collapsed={isSidebarCollapsed}
              onClick={() => setView('assets')}
            />
          )}
          {menuVisibility.assets && (user.role === 'ADMINISTRADOR' || user.role === 'GESTOR' || user.role === 'ANALISTA') && (
            <NavItem 
              icon={<PlusCircle size={20} />} 
              label="Novo Cadastro" 
              active={view === 'form'} 
              collapsed={isSidebarCollapsed}
              onClick={() => { setSelectedAsset(null); setView('form'); }}
            />
          )}
          {menuVisibility.movements && (user.role === 'ADMINISTRADOR' || user.role === 'GESTOR' || user.role === 'ANALISTA') && (
            <NavItem 
              icon={<ArrowLeftRight size={20} />} 
              label="Movimentações" 
              active={view === 'movements'} 
              collapsed={isSidebarCollapsed}
              onClick={() => setView('movements')}
            />
          )}
          {menuVisibility.baixa && (user.role === 'ADMINISTRADOR' || user.role === 'GESTOR') && (
            <NavItem 
              icon={<Trash2 size={20} />} 
              label="Baixas" 
              active={view === 'baixa'} 
              collapsed={isSidebarCollapsed}
              onClick={() => setView('baixa')}
            />
          )}
          {menuVisibility.collector && (
            <NavItem 
              icon={<Smartphone size={20} />} 
              label="Coletor de Dados" 
              active={view === 'collector'} 
              collapsed={isSidebarCollapsed}
              onClick={() => setView('collector')}
            />
          )}
          {menuVisibility.inventory && (
            <NavItem 
              icon={<ClipboardCheck size={20} />} 
              label="Inventário" 
              active={view === 'inventory'} 
              collapsed={isSidebarCollapsed}
              onClick={() => setView('inventory')}
            />
          )}
          {(user.role === 'ADMINISTRADOR' || user.role === 'GESTOR' || user.role === 'ANALISTA' || user.role === 'USUARIO') && (
            <div className="pt-4 border-t border-line mt-4">
              {menuVisibility.reports && (
                <NavItem 
                  icon={<FileText size={20} />} 
                  label="Relatórios" 
                  active={view === 'reports'} 
                  collapsed={isSidebarCollapsed}
                  onClick={() => setView('reports')}
                />
              )}
              {menuVisibility.bi && (
                <NavItem 
                  icon={<BarChart3 size={20} />} 
                  label="BI & Analytics" 
                  active={view === 'bi'}
                  collapsed={isSidebarCollapsed}
                  onClick={() => setView('bi')}
                />
              )}
              {menuVisibility.compliance && (
                <NavItem 
                  icon={<Shield size={20} />} 
                  label="Compliance" 
                  active={view === 'compliance'}
                  collapsed={isSidebarCollapsed}
                  onClick={() => setView('compliance')}
                />
              )}
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-line space-y-2">
          {user.role === 'ADMINISTRADOR' && (
            <NavItem 
              icon={<Building2 size={20} />} 
              label="Gestão de Empresas" 
              active={view === 'companies'}
              collapsed={isSidebarCollapsed}
              onClick={() => setView('companies')}
            />
          )}
          {user.role === 'ADMINISTRADOR' && (
            <NavItem 
              icon={<Users size={20} />} 
              label="Gestão de Usuários" 
              active={view === 'users'}
              collapsed={isSidebarCollapsed}
              onClick={() => setView('users')}
            />
          )}
          {user.role === 'ADMINISTRADOR' && (
            <NavItem 
              icon={<Settings size={20} />} 
              label="Configurações" 
              active={view === 'settings'}
              collapsed={isSidebarCollapsed}
              onClick={() => setView('settings')}
            />
          )}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-danger hover:bg-danger/10 transition-all"
          >
            <LogOut size={20} />
            {!isSidebarCollapsed && <span className="font-medium">Sair</span>}
          </button>
        </div>
        <div className="p-6 border-t border-line mt-auto">
          {!isSidebarCollapsed && (
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted text-center italic opacity-40 hover:opacity-100 transition-opacity">
              Developed by <span className="text-primary">ASSET SOLUTION</span>
            </p>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-line bg-panel/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-line rounded-lg transition-all lg:hidden"
            >
              <Menu size={20} />
            </button>
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 hover:bg-line rounded-lg transition-all hidden lg:block"
            >
              {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
            <div className="h-4 w-[1px] bg-line mx-2 hidden sm:block" />
            
            <div className="flex items-center gap-2">
              <select 
                value={globalCompanyId}
                onChange={(e) => {
                  setGlobalCompanyId(e.target.value);
                  setGlobalBranchId('ALL');
                }}
                className="bg-bg/50 border border-line rounded-lg px-3 py-1.5 text-xs font-bold w-40"
              >
                <option value="ALL">Todas Empresas</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select 
                value={globalBranchId}
                onChange={(e) => setGlobalBranchId(e.target.value)}
                className="bg-bg/50 border border-line rounded-lg px-3 py-1.5 text-xs font-bold w-40"
              >
                <option value="ALL">Todas Filiais</option>
                {branches
                  .filter(b => globalCompanyId === 'ALL' || b.companyId === globalCompanyId)
                  .map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
              </select>
            </div>

            <h2 className="font-bold text-lg capitalize truncate max-w-[120px] sm:max-w-none ml-4">{view}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por nome ou código..." 
                className="pl-10 pr-10 py-1.5 w-64 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 mr-4">
              <div className="h-6 w-[1px] bg-line mx-2" />
              <button 
                onClick={() => setCurrency('BRL')}
                className={cn("px-3 py-1 text-xs font-bold rounded-lg transition-all", currency === 'BRL' ? "bg-primary text-white" : "bg-line text-muted")}
              >
                BRL
              </button>
              <button 
                onClick={() => setCurrency('USD')}
                className={cn("px-3 py-1 text-xs font-bold rounded-lg transition-all", currency === 'USD' ? "bg-primary text-white" : "bg-line text-muted")}
              >
                USD
              </button>
            </div>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 hover:bg-line rounded-lg transition-all text-muted"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="relative">
              <button 
                onClick={() => setIsAlertsOpen(!isAlertsOpen)}
                className={cn(
                  "p-2 hover:bg-line rounded-lg transition-all text-muted relative",
                  isAlertsOpen && "bg-primary/10 text-primary"
                )}
              >
                <Bell size={20} />
                {unreadAlertsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-danger text-white text-[8px] flex items-center justify-center rounded-full border-2 border-bg font-bold animate-pulse">
                    {unreadAlertsCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {isAlertsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsAlertsOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-panel border border-line rounded-2xl shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-line bg-bg/50 flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-widest text-primary">Notificações</h3>
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                          {alerts.length} Alertas
                        </span>
                      </div>
                      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                        {alerts.length === 0 ? (
                          <div className="p-8 text-center">
                            <CheckCircle size={32} className="mx-auto text-success mb-2 opacity-50" />
                            <p className="text-xs text-muted font-bold">Tudo em dia!</p>
                            <p className="text-[10px] text-muted uppercase">Nenhum alerta pendente.</p>
                          </div>
                        ) : (
                          alerts.map(alert => (
                            <div key={alert.id} className="p-4 border-b border-line hover:bg-bg/40 transition-all group relative">
                              <div className="flex gap-3">
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                  alert.severity === 'DANGER' ? "bg-danger/10 text-danger" : alert.severity === 'WARNING' ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"
                                )}>
                                  {alert.type === 'INSURANCE' ? <Shield size={16} /> : <AlertTriangle size={16} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold truncate">{alert.title}</p>
                                  <p className="text-[10px] text-muted truncate">{alert.description}</p>
                                  <div className="flex items-center justify-between mt-2">
                                    <span className={cn(
                                      "text-[8px] font-black uppercase px-1.5 py-0.5 rounded",
                                      alert.severity === 'DANGER' ? "bg-danger text-white" : "bg-amber-500 text-white"
                                    )}>
                                      {alert.severity === 'DANGER' ? 'Urgente' : 'Aviso'}
                                    </span>
                                    <button 
                                      onClick={() => deleteAlert(alert.id)}
                                      className="text-[10px] font-bold text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                      Remover
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      {alerts.length > 0 && (
                        <div className="p-3 bg-bg/30 text-center border-t border-line">
                          <button 
                            onClick={() => {
                              setView('dashboard');
                              setIsAlertsOpen(false);
                            }}
                            className="text-[10px] font-bold text-primary hover:underline uppercase tracking-widest"
                          >
                            Ver no Painel Geral
                          </button>
                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-3 pl-4 border-l border-line">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold leading-none">{user.name}</p>
                <p className="text-[10px] text-muted uppercase tracking-wider mt-1">{user.role}</p>
              </div>
              <img src={user.avatar} alt={user.name} className="w-9 h-9 rounded-xl border border-line" />
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-8 overflow-y-auto flex-1 relative">
          <AnimatePresence>
            {notification && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={cn(
                  "fixed top-20 right-8 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border font-bold",
                  notification.type === 'success' ? "bg-success/10 border-success text-success" : "bg-danger/10 border-danger text-danger"
                )}
              >
                {notification.type === 'success' ? <Package size={20} /> : <Trash2 size={20} />}
                {notification.message}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {consultingAsset && (
              <AssetFormView 
                asset={consultingAsset} 
                fieldConfigs={fieldConfigs}
                companies={companies}
                branches={branches}
                accounts={accounts}
                classes={classes}
                costCenters={costCenters}
                ncms={ncms}
                currency={currency}
                onSave={() => setConsultingAsset(null)} 
                onCancel={() => setConsultingAsset(null)}
                readOnly={true}
              />
            )}
            {!consultingAsset && view === 'collector' && (
              <CollectorView 
                assets={filteredAssets} 
                user={user} 
                fieldConfigs={fieldConfigs} 
                sessions={inventorySessions.filter(s => s.status === 'EM ANDAMENTO')}
                onInventoryAction={(asset, session, status, obs) => {
                  setAssets(assets.map(a => a.id === asset.id && a.sub === asset.sub ? { ...a, status: status === 'BAIXA' ? 'BAIXADO' : a.status } : a));
                  
                  // Update Session Stats
                  setInventorySessions(prev => prev.map(s => {
                    if (s.id === session.id) {
                      const newFound = (s.found || 0) + 1;
                      return {
                        ...s,
                        found: newFound,
                        accuracy: Math.min(100, parseFloat(((newFound / (s.totalItems || 1)) * 100).toFixed(2)))
                      }
                    }
                    return s;
                  }));

                  setNotification({ message: `Ativo ${asset.id} coletado na sessão ${session.id}`, type: 'success' });
                  setTimeout(() => setNotification(null), 3000);
                }}
              />
            )}
            {view === 'users' && (
              <UsersManagementView 
                users={users} 
                companies={companies}
                onAddUser={async (newUser) => {
                  try {
                    // Creating a pre-profile in users collection
                    // We don't have UID yet, but we'll use email as document ID
                    // or generate a random one. Best to use a placeholder and InternalApp will merge by email later.
                    const tempId = `temp_${Date.now()}`;
                    await setDoc(doc(db, 'users', tempId), {
                      ...newUser,
                      id: tempId,
                      uid: tempId, // Adding uid to satisfy isValidUser check
                      avatar: `https://ui-avatars.com/api/?name=${newUser.name}&background=random`,
                      createdAt: serverTimestamp()
                    });
                    setNotification({ message: 'Usuário cadastrado com sucesso!', type: 'success' });
                  } catch (e) {
                    setNotification({ message: 'Erro ao cadastrar usuário.', type: 'error' });
                  }
                  setTimeout(() => setNotification(null), 3000);
                }}
                onUpdateRole={async (uid, role) => {
                  try {
                    await updateDoc(doc(db, 'users', uid), { role });
                    setNotification({ message: 'Permissão atualizada com sucesso!', type: 'success' });
                  } catch (e) {
                    setNotification({ message: 'Erro ao atualizar permissão.', type: 'error' });
                  }
                  setTimeout(() => setNotification(null), 3000);
                }}
                onUpdateCompany={async (uid, companyId) => {
                  try {
                    await updateDoc(doc(db, 'users', uid), { companyId });
                    setNotification({ message: 'Vínculo com empresa atualizado!', type: 'success' });
                  } catch (e) {
                    setNotification({ message: 'Erro ao vincular empresa.', type: 'error' });
                  }
                  setTimeout(() => setNotification(null), 3000);
                }}
                onDeleteUser={async (uid) => {
                  try {
                    await deleteDoc(doc(db, 'users', uid));
                    setNotification({ message: 'Usuário removido do sistema.', type: 'success' });
                  } catch (e) {
                    setNotification({ message: 'Erro ao remover usuário.', type: 'error' });
                  }
                  setTimeout(() => setNotification(null), 3000);
                }}
              />
            )}
            {view === 'companies' && (
              <CompaniesManagementView 
                companies={companies}
                onAdd={async (company) => {
                  try {
                    await addDoc(collection(db, 'companies'), company);
                    setNotification({ message: 'Empresa adicionada com sucesso!', type: 'success' });
                  } catch (e) {
                    setNotification({ message: 'Erro ao adicionar empresa.', type: 'error' });
                  }
                  setTimeout(() => setNotification(null), 3000);
                }}
                onUpdate={async (id, company) => {
                  try {
                    await updateDoc(doc(db, 'companies', id), company);
                    setNotification({ message: 'Dados da empresa atualizados!', type: 'success' });
                  } catch (e) {
                    setNotification({ message: 'Erro ao atualizar empresa.', type: 'error' });
                  }
                  setTimeout(() => setNotification(null), 3000);
                }}
                onDelete={async (id) => {
                  try {
                    await deleteDoc(doc(db, 'companies', id));
                    setNotification({ message: 'Empresa removida!', type: 'success' });
                  } catch (e) {
                    setNotification({ message: 'Erro ao remover.', type: 'error' });
                  }
                  setTimeout(() => setNotification(null), 3000);
                }}
              />
            )}
            {view === 'dashboard' && (
              <DashboardView 
                assets={filteredAssets} 
                movements={filteredMovements} 
                baixaRequests={baixaRequests} 
                currency={currency} 
                searchTerm={searchTerm} 
                setView={setView} 
                reportDate={reportDate}
                depreciationMethod={depreciationMethod}
                companies={companies}
                branches={branches}
                user={user}
                isDarkMode={isDarkMode}
              />
            )}
            {!consultingAsset && view === 'assets' && (
              <AssetsListView 
                assets={filteredAssets} 
                currency={currency} 
                searchTerm={searchTerm} 
                reportDate={reportDate}
                setReportDate={setReportDate}
                depreciationMethod={depreciationMethod}
                onEdit={(a) => { setSelectedAsset(a); setView('form'); }} 
                onConsult={(a) => setConsultingAsset(a)}
                onDelete={(a) => setDeletingAsset(a)}
                onImport={(imported) => {
                  setAssets([...imported, ...assets]);
                  setNotification({ message: `${imported.length} ativos importados com sucesso!`, type: 'success' });
                  setTimeout(() => setNotification(null), 5000);
                }}
                user={user}
              />
            )}
            {!consultingAsset && view === 'form' && (
              <AssetFormView 
                asset={selectedAsset} 
                assets={assets}
                fieldConfigs={fieldConfigs}
                companies={companies}
                branches={branches}
                accounts={accounts}
                classes={classes}
                costCenters={costCenters}
                ncms={ncms}
                currency={currency}
                onImport={(imported) => {
                  setAssets([...imported, ...assets]);
                  setNotification({ message: `${imported.length} ativos importados com sucesso!`, type: 'success' });
                  setTimeout(() => setNotification(null), 5000);
                  setView('assets');
                }}
                onSave={(a) => {
                  if (selectedAsset) {
                    addLog(
                      user.id,
                      user.name,
                      `Solicitação de alteração do ativo ${a.id}/${a.sub}`,
                      'ASSET',
                      a.id,
                      `Alterações pendentes de aprovação.`
                    );
                    setPendingEdit({ original: selectedAsset, updated: a });
                    return;
                  }

                  const historyEntry: AssetHistory = { 
                    id: Math.random().toString(36).substr(2, 9), 
                    date: new Date().toISOString(), 
                    type: selectedAsset ? 'EDICAO' : 'CRIACAO', 
                    user: user.name, 
                    description: selectedAsset ? 'Ativo atualizado no sistema.' : 'Ativo cadastrado no sistema.' 
                  };
                  
                  if (selectedAsset) {
                    // Detect changes for history
                    const changes: string[] = [];
                    Object.keys(a).forEach(key => {
                      const k = key as keyof Asset;
                      if (JSON.stringify(a[k]) !== JSON.stringify(selectedAsset[k])) {
                        changes.push(`${k}: ${JSON.stringify(selectedAsset[k])} -> ${JSON.stringify(a[k])}`);
                      }
                    });
                    if (changes.length > 0) {
                      historyEntry.description = `Alterações: ${changes.join(', ')}`;
                    }

                    addLog(
                      user.id,
                      user.name,
                      `Ativo ${a.id}/${a.sub} atualizado diretamente`,
                      'ASSET',
                      a.id,
                      historyEntry.description
                    );

                    setAssets(assets.map(item => (item.id === a.id && item.sub === a.sub) ? { ...a, history: [historyEntry, ...a.history] } : item));
                  } else {
                    addLog(
                      user.id,
                      user.name,
                      `Novo ativo ${a.id}/${a.sub} cadastrado`,
                      'ASSET',
                      a.id,
                      `Nome: ${a.name}, Valor: ${a.acquisitionValueBRL}`
                    );
                    setAssets([{ ...a, history: [historyEntry] }, ...assets]);
                  }
                  setView('assets');
                }} 
                onCancel={() => setView('assets')} 
              />
            )}
            {!consultingAsset && view === 'movements' && (
              <MovementsView 
                movements={movements} 
                assets={assets} 
                user={user}
                currency={currency}
                companies={companies}
                branches={branches}
                onCreate={handleCreateMovement}
                onApprove={handleApproveMovement}
                onDelete={handleDeleteMovement}
                onConsult={(assetId) => {
                  const asset = assets.find(a => a.id === assetId);
                  if (asset) setConsultingAsset(asset);
                }}
              />
            )}
            {!consultingAsset && view === 'baixa' && (
              <BaixaView 
                requests={baixaRequests.filter(b => {
                  const asset = assets.find(a => a.id === b.assetId);
                  if (!asset) return true;
                  if (globalCompanyId !== 'ALL' && asset.companyId !== globalCompanyId) return false;
                  if (globalBranchId !== 'ALL' && asset.branchId !== globalBranchId) return false;
                  return true;
                })}
                assets={assets}
                user={user}
                currency={currency}
                onCreate={handleBaixaRequest}
                onApprove={handleApproveBaixa}
                onDelete={handleDeleteBaixa}
                onConsult={(assetId) => {
                  const asset = assets.find(a => a.id === assetId);
                  if (asset) setConsultingAsset(asset);
                }}
                onImport={(imported) => {
                  setBaixaRequests([...imported, ...baixaRequests]);
                  setNotification({ message: `${imported.length} solicitações de baixa importadas com sucesso!`, type: 'success' });
                  setTimeout(() => setNotification(null), 5000);
                }}
              />
            )}
            {view === 'settings' && (
              <SettingsView 
                fieldConfigs={fieldConfigs}
                onUpdate={setFieldConfigs}
                menuVisibility={menuVisibility}
                setMenuVisibility={setMenuVisibility}
                companies={companies}
                setCompanies={setCompanies}
                branches={branches}
                setBranches={setBranches}
                accounts={accounts}
                setAccounts={setAccounts}
                classes={classes}
                setClasses={setClasses}
                costCenters={costCenters}
                setCostCenters={setCostCenters}
                ncms={ncms}
                setNcms={setNcms}
                users={users}
                setUsers={setUsers}
                depreciationMethod={depreciationMethod}
                setDepreciationMethod={setDepreciationMethod}
              />
            )}
            {view === 'inventory' && (
              <InventoryView 
                assets={filteredAssets} 
                sessions={inventorySessions.filter(s => {
                  if (globalCompanyId !== 'ALL' && s.companyId !== globalCompanyId) return false;
                  if (globalBranchId !== 'ALL' && s.branchId !== globalBranchId) return false;
                  return true;
                })}
                onSaveSession={(s) => {
                  const exists = inventorySessions.find(sess => sess.id === s.id);
                  if (exists) {
                    setInventorySessions(inventorySessions.map(sess => sess.id === s.id ? s : sess));
                  } else {
                    setInventorySessions([...inventorySessions, s]);
                  }
                }}
                companies={companies}
                branches={branches}
                users={users}
                user={user}
              />
            )}
            {view === 'bi' && (
              <BIAnalyticsView 
                assets={filteredAssets} 
                movements={filteredMovements} 
                currency={currency} 
                reportDate={reportDate}
                depreciationMethod={depreciationMethod}
                companies={companies}
                branches={branches}
              />
            )}
            {view === 'compliance' && (
              <ComplianceView logs={logs} user={user} />
            )}
            {view === 'reports' && (
              <ReportsView 
                assets={filteredAssets} 
                currency={currency} 
                baixaRequests={baixaRequests.filter(b => {
                  const asset = assets.find(a => a.id === b.assetId);
                  if (!asset) return true;
                  if (globalCompanyId !== 'ALL' && asset.companyId !== globalCompanyId) return false;
                  if (globalBranchId !== 'ALL' && asset.branchId !== globalBranchId) return false;
                  return true;
                })} 
                movements={filteredMovements}
                reportDate={reportDate}
                setReportDate={setReportDate}
                depreciationMethod={depreciationMethod}
                companies={companies}
                branches={branches}
                accounts={accounts}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      {pendingEdit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-panel border border-line rounded-3xl p-8 max-w-2xl w-full shadow-2xl"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-6">
              <Edit size={32} />
            </div>
            <h3 className="text-xl font-black text-center mb-2">Confirmar Alterações?</h3>
            <p className="text-muted text-center text-sm mb-6">
              As alterações no ativo <span className="text-white font-bold">{pendingEdit.original.id}/{pendingEdit.original.sub}</span> serão enviadas para aprovação. 
              O ativo ficará com status <span className="text-warning font-bold">"EM ALTERAÇÃO"</span>.
            </p>
            
            <div className="bg-bg/50 rounded-xl p-4 mb-8 max-h-48 overflow-y-auto border border-line custom-scrollbar">
              <p className="text-[10px] font-bold uppercase text-muted mb-2">Resumo das Alterações:</p>
              <div className="space-y-2">
                {Object.keys(pendingEdit.updated).map(key => {
                  const k = key as keyof Asset;
                  const fieldLabels: { [key: string]: string } = {
                    name: 'Nome',
                    acquisitionDate: 'Data Aquisição',
                    acquisitionValueBRL: 'Valor BRL',
                    acquisitionValueUSD: 'Valor USD',
                    accountCode: 'Conta Contábil',
                    accountDescription: 'Descrição Conta',
                    costCenterCode: 'Centro de Custo',
                    costCenterDescription: 'Descrição C. Custo',
                    responsible: 'Responsável',
                    location: 'Localização',
                    condition: 'Estado Conservação',
                    fiscalUsefulLifeYears: 'Vida Útil Fiscal (Anos)',
                    accountingUsefulLifeYears: 'Vida Útil Contábil (Anos)',
                    residualPercentageBRL: '% Valor Residual',
                    color: 'Cor',
                    brand: 'Marca',
                    model: 'Modelo',
                    serialNumber: 'Nº Série'
                  };

                  const originalValue = pendingEdit.original[k];
                  const updatedValue = pendingEdit.updated[k];

                  if (fieldLabels[k] && JSON.stringify(updatedValue) !== JSON.stringify(originalValue)) {
                    return (
                      <div key={k} className="text-xs flex flex-wrap gap-1 items-center">
                        <span className="font-bold text-primary uppercase">{fieldLabels[k]}:</span>
                        <span className="text-muted line-through opacity-50">{String(originalValue || 'Vazio')}</span>
                        <span className="text-white font-bold">→ {String(updatedValue || 'Vazio')}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setPendingEdit(null)}
                className="flex-1 px-6 py-3 bg-line hover:bg-line/80 rounded-xl font-bold transition-all"
              >
                Cancelar
              </button>
                  <button 
                onClick={() => {
                  const changes: string[] = [];
                  const fieldLabels: { [key: string]: string } = {
                    name: 'Nome',
                    acquisitionDate: 'Data Aquisição',
                    acquisitionValueBRL: 'Valor BRL',
                    acquisitionValueUSD: 'Valor USD',
                    accountCode: 'Conta Contábil',
                    accountDescription: 'Descrição Conta',
                    costCenterCode: 'Centro de Custo',
                    costCenterDescription: 'Descrição C. Custo',
                    responsible: 'Responsável',
                    location: 'Localização',
                    condition: 'Estado Conservação',
                    fiscalUsefulLifeYears: 'Vida Útil Fiscal (Anos)',
                    accountingUsefulLifeYears: 'Vida Útil Contábil (Anos)',
                    residualPercentageBRL: '% Valor Residual',
                    color: 'Cor',
                    brand: 'Marca',
                    model: 'Modelo',
                    serialNumber: 'Nº Série'
                  };

                  Object.keys(pendingEdit.updated).forEach(key => {
                    const k = key as keyof Asset;
                    const originalValue = pendingEdit.original[k];
                    const updatedValue = pendingEdit.updated[k];

                    // Skip internal fields and history
                    if (['history', 'lastUpdate', 'photo', 'photo2', 'supplierAttachment', 'nfeAttachment'].includes(k as string)) return;

                    // Deep comparison for objects/arrays if needed, but mostly primitives here
                    if (JSON.stringify(originalValue) !== JSON.stringify(updatedValue)) {
                      // Only add if it's a field we want to show and has a meaningful change
                      if (fieldLabels[k]) {
                        changes.push(`${fieldLabels[k]}: ${originalValue || 'Vazio'} -> ${updatedValue || 'Vazio'}`);
                      }
                    }
                  });

                  const updatedAssetForMovement = {
                    ...pendingEdit.updated,
                    status: 'ATIVO' as const,
                    history: [
                      { 
                        id: Math.random().toString(36).substr(2, 9), 
                        date: new Date().toISOString(), 
                        type: 'EDICAO' as const, 
                        user: user.name, 
                        description: `Alteração de dados solicitada. Mudanças: ${changes.join('; ')}` 
                      },
                      ...pendingEdit.original.history
                    ]
                  };

                  // Update status in list but KEEP original data
                  setAssets(assets.map(asset => 
                    (asset.id === pendingEdit.original.id && asset.sub === pendingEdit.original.sub) 
                      ? { ...asset, status: 'EM_ALTERACAO' as const } 
                      : asset
                  ));
                  
                  // Create a Movement request of type ALTERACAO
                  const nextId = `MV-${(Math.max(0, ...movements.map(m => parseInt(m.id.split('-')[1]) || 0)) + 1).toString().padStart(3, '0')}`;
                  const newMovement: Movement = {
                    id: nextId,
                    number: String(movements.length + 1),
                    type: 'ALTERACAO',
                    status: 'PENDENTE',
                    requestDate: new Date().toISOString(),
                    requesterId: user.id,
                    requesterName: user.name,
                    origin: { 
                      company: pendingEdit.original.companyName || '',
                      branch: pendingEdit.original.branchName || '', 
                      responsible: pendingEdit.original.responsible || '' 
                    },
                    destination: { 
                      company: pendingEdit.original.companyName || '',
                      branch: pendingEdit.original.branchName || '', 
                      responsible: pendingEdit.original.responsible || '' 
                    },
                    isThirdParty: false,
                    items: [{
                      assetId: pendingEdit.original.id,
                      assetSub: pendingEdit.original.sub,
                      assetName: pendingEdit.original.name,
                      currentCostCenter: pendingEdit.original.costCenterDescription,
                      bookValue: currency === 'BRL' ? pendingEdit.original.acquisitionValueBRL : pendingEdit.original.acquisitionValueUSD,
                      acquisitionValueBRL: pendingEdit.original.acquisitionValueBRL,
                      acquisitionValueUSD: pendingEdit.original.acquisitionValueUSD
                    }],
                    observations: `ALTERAÇÃO DE DADOS: ${changes.join('; ')}`,
                    details: { updatedAsset: updatedAssetForMovement }
                  };
                  setMovements([...movements, newMovement]);

                  setPendingEdit(null);
                  setView('assets');
                  setSelectedAsset(null);
                  alert('Solicitação de alteração enviada com sucesso para o menu de Movimentações.');
                }}
                className="flex-1 px-6 py-3 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all"
              >
                Confirmar
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {deletingAsset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-panel border border-line rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center text-danger mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-xl font-black text-center mb-2">Confirmar Exclusão?</h3>
            <p className="text-muted text-center text-sm mb-6">
              Você tem certeza que deseja excluir o ativo <span className="text-white font-bold">{deletingAsset.id}/{deletingAsset.sub} - {deletingAsset.name}</span>? 
              Esta ação enviará uma solicitação de baixa para aprovação.
            </p>

            <div className="space-y-2 mb-8">
              <label className="text-[10px] font-bold uppercase text-muted">Motivo da Exclusão</label>
              <select 
                className="w-full bg-bg border-line text-sm rounded-xl p-3"
                value={deletionReason}
                onChange={e => setDeletionReason(e.target.value)}
              >
                <option value="OBSOLESCENCIA">Obsolescência</option>
                <option value="DANO">Dano / Quebra</option>
                <option value="VENDA">Venda</option>
                <option value="FURTO_ROUBO">Furto / Roubo</option>
                <option value="DOACAO">Doação</option>
                <option value="OUTROS">Outros</option>
              </select>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setDeletingAsset(null)}
                className="flex-1 px-6 py-3 bg-line hover:bg-line/80 rounded-xl font-bold transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  addLog(
                    user.id,
                    user.name,
                    `Solicitação de baixa emitida para ativo ${deletingAsset.id}/${deletingAsset.sub}`,
                    'BAIXA',
                    deletingAsset.id,
                    `Motivo: ${deletionReason}`
                  );

                  // Update asset status
                  setAssets(assets.map(a => 
                    (a.id === deletingAsset.id && a.sub === deletingAsset.sub) 
                      ? { ...a, status: 'EM_EXCLUSAO' as const } 
                      : a
                  ));
                  
                  // Create Baixa Request
                  const nextId = `BX-${(Math.max(0, ...baixaRequests.map(r => parseInt(r.id.split('-')[1]) || 0)) + 1).toString().padStart(3, '0')}`;
                  const newRequest: BaixaRequest = {
                    id: nextId,
                    assetId: deletingAsset.id,
                    assetSub: deletingAsset.sub,
                    assetName: deletingAsset.name,
                    assetCostCenter: deletingAsset.costCenterDescription,
                    acquisitionValueBRL: deletingAsset.acquisitionValueBRL,
                    acquisitionValueUSD: deletingAsset.acquisitionValueUSD,
                    reason: deletionReason as any,
                    date: new Date().toISOString().split('T')[0],
                    status: 'PENDENTE',
                    requesterId: user?.id || '1',
                    requesterName: user?.name || 'Rodrigo Maciel'
                  };
                  setBaixaRequests([...baixaRequests, newRequest]);
                  
                  setDeletingAsset(null);
                  setDeletionReason('OBSOLESCENCIA');
                }}
                className="flex-1 px-6 py-3 bg-danger hover:bg-danger/80 text-white rounded-xl font-bold shadow-lg shadow-danger/20 transition-all"
              >
                Confirmar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function MovementsView({ 
  movements, 
  assets, 
  user, 
  currency, 
  companies,
  branches,
  onCreate, 
  onApprove,
  onDelete,
  onConsult
}: { 
  movements: Movement[], 
  assets: Asset[], 
  user: User, 
  currency: 'BRL' | 'USD', 
  companies: Company[],
  branches: Branch[],
  onCreate: (m: Movement) => void, 
  onApprove: (id: string) => void,
  onDelete: (id: string) => void,
  onConsult: (assetId: string) => void
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newMovement, setNewMovement] = useState<Partial<Movement>>({
    id: `MV-${(Math.max(0, ...movements.map(m => parseInt(m.id.split('-')[1]) || 0)) + 1).toString().padStart(3, '0')}`,
    type: 'TRANSFERENCIA',
    status: 'PENDENTE',
    requestDate: new Date().toISOString(),
    requesterId: user.id,
    items: [],
    origin: { company: '', branch: '', responsible: '' },
    destination: { company: '', branch: '', responsible: '' },
    isThirdParty: false
  });

  const handleAddItem = (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (asset && !newMovement.items?.find(i => i.assetId === assetId)) {
      setNewMovement({
        ...newMovement,
        items: [...(newMovement.items || []), { 
          assetId: asset.id, 
          assetSub: asset.sub, 
          assetName: asset.name,
          currentCostCenter: asset.costCenterDescription,
          bookValue: currency === 'BRL' ? asset.acquisitionValueBRL : asset.acquisitionValueUSD,
          acquisitionValueBRL: asset.acquisitionValueBRL,
          acquisitionValueUSD: asset.acquisitionValueUSD
        }]
      });
    }
  };

  const [viewingMovement, setViewingMovement] = useState<Movement | null>(null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {viewingMovement && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-panel border border-line rounded-3xl p-8 w-full max-w-4xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-widest text-primary">Detalhes da Movimentação: {viewingMovement.id}</h3>
              <button onClick={() => setViewingMovement(null)} className="p-2 hover:bg-line rounded-full transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-bg rounded-xl border border-line">
                <p className="text-xs text-muted font-bold uppercase">Solicitante</p>
                <p className="font-bold">{viewingMovement.requesterName || viewingMovement.requesterId}</p>
              </div>
              <div className="p-4 bg-bg rounded-xl border border-line">
                <p className="text-xs text-muted font-bold uppercase">Data Solicitação</p>
                <p className="font-bold">{new Date(viewingMovement.requestDate).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="p-4 bg-bg rounded-xl border border-line">
                <p className="text-xs text-muted font-bold uppercase">Status</p>
                <p className={cn("font-bold", viewingMovement.status === 'APROVADO' ? "text-success" : "text-amber-400")}>{viewingMovement.status}</p>
              </div>
            </div>

            {viewingMovement.type !== 'ALTERACAO' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-primary uppercase tracking-widest">Origem</h4>
                  <div className="p-4 bg-bg rounded-xl border border-line">
                    <p className="text-xs text-muted font-bold uppercase">Filial</p>
                    <p className="font-bold">{viewingMovement.origin.branch}</p>
                    <p className="text-xs text-muted font-bold uppercase mt-2">Responsável</p>
                    <p className="font-bold">{viewingMovement.origin.responsible}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-success uppercase tracking-widest">Destino</h4>
                  <div className="p-4 bg-bg rounded-xl border border-line">
                    <p className="text-xs text-muted font-bold uppercase">Filial</p>
                    <p className="font-bold">{viewingMovement.destination.branch}</p>
                    <p className="text-xs text-muted font-bold uppercase mt-2">Responsável</p>
                    <p className="font-bold">{viewingMovement.destination.responsible}</p>
                    {viewingMovement.isThirdParty && viewingMovement.thirdParty && (
                      <>
                        <p className="text-xs text-muted font-bold uppercase mt-2">Empresa Terceira</p>
                        <p className="font-bold text-primary">{viewingMovement.thirdParty.name}</p>
                        <p className="text-[10px] text-muted">{viewingMovement.thirdParty.cnpj}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-widest">
                {viewingMovement.type === 'ALTERACAO' ? 'Dados Alterados' : 'Itens Movimentados'}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {viewingMovement.items.map(item => (
                  <div key={item.assetId} className="flex items-center justify-between p-4 bg-bg rounded-xl border border-line">
                    <div>
                      <p className="font-bold">{item.assetId} - {item.assetName}</p>
                      <p className="text-[10px] text-muted uppercase">C. Custo: {item.currentCostCenter}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-primary">BRL: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.acquisitionValueBRL)}</p>
                      <p className="text-xs font-bold text-success">USD: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(item.acquisitionValueUSD)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {viewingMovement.observations && (
              <div className="p-6 bg-primary/5 rounded-2xl border border-primary/20">
                <p className="text-xs text-primary font-black uppercase mb-3 tracking-widest">
                  {viewingMovement.type === 'ALTERACAO' ? 'Detalhamento das Alterações' : 'Observações'}
                </p>
                <div className="space-y-2">
                  {viewingMovement.type === 'ALTERACAO' ? (
                    viewingMovement.observations.split('; ').map((obs, i) => {
                      const cleanObs = obs.replace('Alteração de dados solicitada. Mudanças: ', '').replace('Alteração de dados solicitada. ', '');
                      if (!cleanObs) return null;
                      return (
                        <div key={i} className="flex items-center gap-2 text-sm font-bold">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          {cleanObs}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm font-bold">{viewingMovement.observations}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button onClick={() => setViewingMovement(null)} className="px-8 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all">Fechar</button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Movimentações de Ativos</h2>
        {user.role !== 'USUARIO' && (
          <button 
            onClick={() => {
              const nextId = `MV-${(Math.max(0, ...movements.map(m => parseInt(m.id.split('-')[1]) || 0)) + 1).toString().padStart(3, '0')}`;
              setNewMovement({
                id: nextId,
                type: 'TRANSFERENCIA',
                status: 'PENDENTE',
                requestDate: new Date().toISOString(),
                requesterId: user.id,
                items: [],
                origin: { company: '', branch: '', responsible: '' },
                destination: { company: '', branch: '', responsible: '' },
                isThirdParty: false
              });
              setIsCreating(true);
            }}
            className="px-6 py-2 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold flex items-center gap-2"
          >
            <PlusCircle size={20} /> Nova Movimentação
          </button>
        )}
      </div>

      {isCreating ? (
        <div className="bg-panel border border-line rounded-2xl p-8 card-gradient space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-muted mb-2 uppercase">Tipo de Movimento</label>
              <select className="w-full" value={newMovement.type} onChange={e => setNewMovement({...newMovement, type: e.target.value as any})}>
                <option value="TRANSFERENCIA">Transferência Interna</option>
                <option value="COMODATO">Comodato</option>
                <option value="EMPRESTIMO">Empréstimo</option>
                <option value="CONSERTO">Conserto / Manutenção</option>
                <option value="OUTROS">Outros</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={newMovement.isThirdParty} 
                  onChange={e => setNewMovement({...newMovement, isThirdParty: e.target.checked})}
                  className="w-5 h-5 accent-primary"
                />
                <span className="text-sm font-bold uppercase">Empresa Terceira?</span>
              </label>
            </div>
          </div>

          {newMovement.isThirdParty && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-bg/30 rounded-xl border border-dashed border-line">
              <div>
                <label className="block text-xs font-bold text-muted mb-2 uppercase">CNPJ da Terceira</label>
                <input type="text" className="w-full" placeholder="00.000.000/0000-00" value={newMovement.thirdParty?.cnpj} onChange={e => setNewMovement({...newMovement, thirdParty: { name: newMovement.thirdParty?.name || '', cnpj: e.target.value }})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-2 uppercase">Nome da Empresa Terceira</label>
                <input type="text" className="w-full" value={newMovement.thirdParty?.name} onChange={e => setNewMovement({...newMovement, thirdParty: { cnpj: newMovement.thirdParty?.cnpj || '', name: e.target.value }})} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-primary uppercase tracking-widest">Origem</h4>
              <select className="w-full" value={newMovement.origin?.branch} onChange={e => setNewMovement({...newMovement, origin: {...newMovement.origin!, branch: e.target.value}})}>
                <option value="">Selecione a Filial de Origem...</option>
                {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
              <input type="text" placeholder="Responsável na Origem" className="w-full" value={newMovement.origin?.responsible} onChange={e => setNewMovement({...newMovement, origin: {...newMovement.origin!, responsible: e.target.value}})} />
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-success uppercase tracking-widest">Destino</h4>
              <select className="w-full" value={newMovement.destination?.branch} onChange={e => setNewMovement({...newMovement, destination: {...newMovement.destination!, branch: e.target.value}})}>
                <option value="">Selecione a Filial de Destino...</option>
                {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
              <input type="text" placeholder="Responsável no Destino" className="w-full" value={newMovement.destination?.responsible} onChange={e => setNewMovement({...newMovement, destination: {...newMovement.destination!, responsible: e.target.value}})} />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-widest">Itens para Movimentar</h4>
            <div className="flex gap-2">
              <select className="flex-1" onChange={e => handleAddItem(e.target.value)} value="">
                <option value="">Selecione um ativo para adicionar...</option>
                {assets.filter(a => a.status === 'ATIVO').map(a => <option key={a.id} value={a.id}>{a.id} - {a.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {newMovement.items?.map(item => (
                <div key={item.assetId} className="flex items-center justify-between p-3 bg-bg rounded-xl border border-line">
                  <div>
                    <p className="text-sm font-medium">{item.assetId} - {item.assetName}</p>
                    <p className="text-[10px] text-muted font-bold">BRL: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.acquisitionValueBRL)} | USD: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(item.acquisitionValueUSD)}</p>
                  </div>
                  <button onClick={() => setNewMovement({...newMovement, items: newMovement.items?.filter(i => i.assetId !== item.assetId)})} className="text-danger hover:bg-danger/10 p-1 rounded">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PhotoUpload 
              label="Foto da Movimentação / Comprovante" 
              value={newMovement.photo} 
              onChange={val => setNewMovement({...newMovement, photo: val})} 
            />
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-line">
            <button onClick={() => setIsCreating(false)} className="px-6 py-2 bg-line hover:bg-line/80 rounded-xl font-bold">Cancelar</button>
            <button 
              onClick={() => { onCreate(newMovement as Movement); setIsCreating(false); }}
              className="px-8 py-2 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold"
            >
              {movements.find(m => m.id === newMovement.id) ? 'Salvar Alterações' : 'Solicitar Movimentação'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-panel border border-line rounded-2xl overflow-hidden card-gradient">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-muted uppercase border-b border-line bg-bg/30">
                <th className="p-6 font-medium">ID SOLICITAÇÃO</th>
                <th className="p-6 font-medium">Data Solicitação</th>
                <th className="p-6 font-medium">Ativo</th>
                <th className="p-6 font-medium">Origem / Destino</th>
                <th className="p-6 font-medium">Valor Total</th>
                <th className="p-6 font-medium">Status</th>
                <th className="p-6 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {movements.length === 0 ? (
                <tr><td colSpan={7} className="p-12 text-center text-muted">Nenhuma movimentação registrada.</td></tr>
              ) : (
                movements.map(m => (
                  <tr key={m.id} className="border-b border-line/50 hover:bg-line/10 transition-all">
                    <td className="p-6 font-mono text-xs font-bold text-primary">{m.id}</td>
                    <td className="p-6 text-muted">{new Date(m.requestDate).toLocaleDateString('pt-BR')}</td>
                    <td className="p-6">
                      {m.items.length > 0 ? (
                        <div>
                          <p className="font-bold">{m.items[0].assetName}</p>
                          {m.items.length > 1 && <p className="text-[10px] text-muted">+{m.items.length - 1} outros itens</p>}
                        </div>
                      ) : (
                        <span className="text-muted italic">Sem itens</span>
                      )}
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <span className="text-muted">{m.origin.branch}</span>
                        <ArrowLeftRight size={12} className="text-primary" />
                        <span>{m.isThirdParty ? m.thirdParty?.name : m.destination.branch}</span>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="text-[10px] font-bold">
                        <p className="text-primary">BRL: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.items.reduce((s, i) => s + i.acquisitionValueBRL, 0))}</p>
                        <p className="text-success">USD: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(m.items.reduce((s, i) => s + i.acquisitionValueUSD, 0))}</p>
                      </div>
                    </td>
                    <td className="p-6">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        m.status === 'APROVADO' ? "bg-success/10 text-success" : "bg-amber-400/10 text-amber-400"
                      )}>
                        {m.type === 'ALTERACAO' && m.status === 'PENDENTE' ? 'SOLICITAÇÃO DE ALTERAÇÃO' : m.status}
                      </span>
                    </td>
                    <td className="p-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {(user.role === 'ADMINISTRADOR' || user.role === 'GESTOR' || user.role === 'ANALISTA') && (
                          <button 
                            onClick={() => setViewingMovement(m)}
                            className="px-3 py-1 bg-line hover:bg-primary/20 text-primary rounded-lg text-xs font-bold"
                          >
                            Consultar
                          </button>
                        )}
                        {m.status === 'PENDENTE' && m.requesterId === user.id && (
                          <>
                            <button 
                              onClick={() => {
                                setNewMovement(m);
                                setIsCreating(true);
                              }}
                              className="px-3 py-1 bg-line hover:bg-amber-400/20 text-amber-400 rounded-lg text-xs font-bold"
                            >
                              Editar
                            </button>
                            <button 
                              onClick={() => onDelete(m.id)}
                              className="px-3 py-1 bg-line hover:bg-danger/20 text-danger rounded-lg text-xs font-bold"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                        {m.status === 'PENDENTE' && (user.role === 'ADMINISTRADOR' || user.role === 'GESTOR') && (
                          <button 
                            onClick={() => onApprove(m.id)}
                            className="px-4 py-1 bg-success hover:bg-success/80 text-white rounded-lg text-xs font-bold"
                          >
                            Aprovar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

function BaixaView({ 
  requests, 
  assets, 
  user, 
  currency,
  onCreate, 
  onApprove,
  onDelete,
  onConsult,
  onImport
}: { 
  requests: BaixaRequest[], 
  assets: Asset[], 
  user: User, 
  currency: 'BRL' | 'USD',
  onCreate: (b: BaixaRequest) => void, 
  onApprove: (id: string) => void,
  onDelete: (id: string) => void,
  onConsult: (assetId: string) => void,
  onImport: (requests: BaixaRequest[]) => void
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newRequest, setNewRequest] = useState<Partial<BaixaRequest>>({
    id: `BX-${(Math.max(0, ...requests.map(r => parseInt(r.id.split('-')[1]) || 0)) + 1).toString().padStart(3, '0')}`,
    status: 'PENDENTE',
    date: new Date().toISOString(),
    requesterId: user.id
  });

  const downloadTemplate = () => {
    const headers = [
      'ID Ativo', 'Sub Ativo', 'Motivo (VENDA/OBSOLESCENCIA/DANO_IRREPARAVEL/ROUBO_FURTO/EXTRAVIO/DOACAO)', 
      'Data (AAAA-MM-DD)', 'Valor (Venda/Doação)', 'Nome Cliente', 'CNPJ Cliente'
    ];
    const csvContent = [headers].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "modelo_importacao_baixas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let lastIdNum = Math.max(0, ...requests.map(r => parseInt(r.id.split('-')[1]) || 0));
        const importedRequests: BaixaRequest[] = results.data.map((row: any) => {
          const assetId = row['ID Ativo'] || '';
          const assetSub = parseInt(row['Sub Ativo']) || 0;
          const asset = assets.find(a => a.id === assetId && a.sub === assetSub);
          
          lastIdNum++;
          return {
            id: `BX-${lastIdNum.toString().padStart(3, '0')}`,
            assetId,
            assetSub,
            assetName: asset?.name || 'Ativo não encontrado',
            assetCostCenter: asset?.costCenterDescription || '',
            acquisitionValueBRL: asset?.acquisitionValueBRL || 0,
            acquisitionValueUSD: asset?.acquisitionValueUSD || 0,
            reason: (row['Motivo (VENDA/OBSOLESCENCIA/DANO_IRREPARAVEL/ROUBO_FURTO/EXTRAVIO/DOACAO)'] || 'OBSOLESCENCIA') as any,
            date: row['Data (AAAA-MM-DD)'] || new Date().toISOString(),
            value: parseFloat(row['Valor (Venda/Doação)']) || 0,
            clientName: row['Nome Cliente'] || '',
            clientCnpj: row['CNPJ Cliente'] || '',
            status: 'PENDENTE',
            requesterId: user.id,
            requesterName: user.name
          };
        });
        onImport(importedRequests);
      }
    });
  };

  const [viewingRequest, setViewingRequest] = useState<BaixaRequest | null>(null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {viewingRequest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-panel border border-line rounded-3xl p-8 w-full max-w-2xl shadow-2xl space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-widest text-danger">Detalhes da Baixa: {viewingRequest.id}</h3>
              <button onClick={() => setViewingRequest(null)} className="p-2 hover:bg-line rounded-full transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-bg rounded-xl border border-line">
                <p className="text-xs text-muted font-bold uppercase">Solicitante</p>
                <p className="font-bold">{viewingRequest.requesterId}</p>
              </div>
              <div className="p-4 bg-bg rounded-xl border border-line">
                <p className="text-xs text-muted font-bold uppercase">Data Solicitação</p>
                <p className="font-bold">{new Date(viewingRequest.date).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="p-4 bg-bg rounded-xl border border-line">
                <p className="text-xs text-muted font-bold uppercase">Status</p>
                <p className={cn("font-bold", viewingRequest.status === 'APROVADO' ? "text-success" : "text-amber-400")}>{viewingRequest.status}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-widest text-danger">Itens para Baixa</h4>
              <div className="flex items-center justify-between p-4 bg-bg rounded-xl border border-line">
                <div>
                  <p className="font-bold">{viewingRequest.assetId} - {viewingRequest.assetName}</p>
                  <p className="text-[10px] text-muted uppercase">C. Custo: {viewingRequest.assetCostCenter || 'N/A'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-danger">BRL: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(viewingRequest.acquisitionValueBRL)}</p>
                  <p className="text-xs font-bold text-danger">USD: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(viewingRequest.acquisitionValueUSD)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-bg rounded-xl border border-line">
                <p className="text-xs text-muted font-bold uppercase">Motivo</p>
                <p className="font-bold">{viewingRequest.reason}</p>
                {(viewingRequest.reason === 'VENDA' || viewingRequest.reason === 'DOACAO') && (
                  <div className="mt-2 pt-2 border-t border-line/50">
                    <p className="text-[10px] text-muted font-bold uppercase">Destinatário</p>
                    <p className="text-xs font-bold">{viewingRequest.clientName}</p>
                    <p className="text-[10px] text-muted">{viewingRequest.clientCnpj}</p>
                  </div>
                )}
              </div>
              {viewingRequest.observations && (
                <div className="p-4 bg-bg rounded-xl border border-line">
                  <p className="text-xs text-muted font-bold uppercase mb-2">Observações</p>
                  <p className="text-sm">{viewingRequest.observations}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button onClick={() => setViewingRequest(null)} className="px-8 py-3 bg-danger text-white rounded-xl font-bold shadow-lg shadow-danger/20 transition-all">Fechar</button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Solicitações de Baixa</h2>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="px-4 py-2 bg-line hover:bg-line/80 rounded-xl text-xs font-bold flex items-center gap-2">
            <Download size={14} /> Modelo Importação
          </button>
          <div className="relative">
            <button className="px-4 py-2 bg-danger/10 hover:bg-danger/20 text-danger rounded-xl text-xs font-bold flex items-center gap-2 border border-danger/20">
              <Upload size={14} /> Importar Baixas
            </button>
            <input 
              type="file" 
              accept=".csv" 
              className="absolute inset-0 opacity-0 cursor-pointer" 
              onChange={handleFileUpload}
            />
          </div>
          {user.role !== 'USUARIO' && (
            <button 
              onClick={() => {
                const nextId = `BX-${(Math.max(0, ...requests.map(r => parseInt(r.id.split('-')[1]) || 0)) + 1).toString().padStart(3, '0')}`;
                setNewRequest({
                  id: nextId,
                  status: 'PENDENTE',
                  date: new Date().toISOString(),
                  requesterId: user.id
                });
                setIsCreating(true);
              }}
              className="px-6 py-2 bg-danger hover:bg-danger/80 text-white rounded-xl font-bold flex items-center gap-2"
            >
              <PlusCircle size={20} /> Nova Solicitação de Baixa
            </button>
          )}
        </div>
      </div>

      {isCreating ? (
        <div className="bg-panel border border-line rounded-2xl p-8 card-gradient space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-muted mb-2 uppercase">Ativo para Baixa</label>
              <select className="w-full" value={newRequest.assetId} onChange={e => {
                const asset = assets.find(a => a.id === e.target.value);
                if (asset) setNewRequest({
                  ...newRequest, 
                  assetId: asset.id, 
                  assetSub: asset.sub, 
                  assetName: asset.name, 
                  assetCostCenter: asset.costCenterDescription,
                  acquisitionValueBRL: asset.acquisitionValueBRL,
                  acquisitionValueUSD: asset.acquisitionValueUSD
                });
              }}>
                <option value="">Selecione um ativo...</option>
                {assets.filter(a => a.status === 'ATIVO').map(a => <option key={a.id} value={a.id}>{a.id} - {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-2 uppercase">Motivo da Baixa</label>
              <select className="w-full" value={newRequest.reason} onChange={e => setNewRequest({...newRequest, reason: e.target.value})}>
                <option value="">Selecione o motivo...</option>
                <option value="VENDA">Venda</option>
                <option value="OBSOLESCENCIA">Obsolescência</option>
                <option value="DANO_IRREPARAVEL">Dano Irreparável</option>
                <option value="ROUBO_FURTO">Roubo / Furto</option>
                <option value="EXTRAVIO">Extravio</option>
                <option value="DOACAO">Doação</option>
              </select>
            </div>
          </div>

          {(newRequest.reason === 'VENDA' || newRequest.reason === 'DOACAO') && (
            <div className="space-y-6 p-6 bg-bg/30 rounded-xl border border-dashed border-line">
              <h4 className="text-xs font-bold uppercase tracking-widest text-primary">Dados do Cliente / Destinatário</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Código Cliente</label>
                  <input type="text" className="w-full" value={newRequest.clientCode} onChange={e => setNewRequest({...newRequest, clientCode: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">CNPJ/CPF</label>
                  <input type="text" className="w-full" value={newRequest.clientCnpj} onChange={e => setNewRequest({...newRequest, clientCnpj: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Nome / Razão Social</label>
                  <input type="text" className="w-full" value={newRequest.clientName} onChange={e => setNewRequest({...newRequest, clientName: e.target.value})} />
                </div>
              </div>
                <InputWithClear 
                  label={`Valor da ${newRequest.reason === 'VENDA' ? 'Venda' : 'Doação'}`}
                  value={newRequest.value} 
                  onChange={v => setNewRequest({...newRequest, value: v})} 
                  type="currency"
                />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-bg rounded-xl border border-line">
              <p className="text-[10px] text-muted uppercase font-bold mb-1">Valor de Aquisição (BRL)</p>
              <p className="text-lg font-black text-danger">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(newRequest.acquisitionValueBRL || 0)}</p>
            </div>
            <div className="p-4 bg-bg rounded-xl border border-line">
              <p className="text-[10px] text-muted uppercase font-bold mb-1">Valor de Aquisição (USD)</p>
              <p className="text-lg font-black text-danger">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(newRequest.acquisitionValueUSD || 0)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PhotoUpload 
              label="Foto do Ativo (Obrigatório para Danos)" 
              value={newRequest.photo} 
              onChange={val => setNewRequest({...newRequest, photo: val})} 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted mb-2 uppercase">Observações Adicionais</label>
            <textarea className="w-full h-24" value={newRequest.observations} onChange={e => setNewRequest({...newRequest, observations: e.target.value})} />
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t border-line">
            <button onClick={() => setIsCreating(false)} className="px-6 py-2 bg-line hover:bg-line/80 rounded-xl font-bold">Cancelar</button>
            <button 
              onClick={() => { onCreate(newRequest as BaixaRequest); setIsCreating(false); }}
              className="px-8 py-2 bg-danger hover:bg-danger/80 text-white rounded-xl font-bold"
            >
              {requests.find(r => r.id === newRequest.id) ? 'Salvar Alterações' : 'Solicitar Baixa'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-panel border border-line rounded-2xl overflow-hidden card-gradient">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-muted uppercase border-b border-line bg-bg/30">
                <th className="p-6 font-medium">ID SOLICITAÇÃO</th>
                <th className="p-6 font-medium">Data Solicitação</th>
                <th className="p-6 font-medium">Ativo</th>
                <th className="p-6 font-medium">Motivo</th>
                <th className="p-6 font-medium">Valor Total</th>
                <th className="p-6 font-medium">Status</th>
                <th className="p-6 font-medium text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {requests.length === 0 ? (
                <tr><td colSpan={7} className="p-12 text-center text-muted">Nenhuma solicitação de baixa encontrada.</td></tr>
              ) : (
                requests.map(r => (
                  <tr key={r.id} className="border-b border-line/50 hover:bg-line/10 transition-all">
                    <td className="p-6 font-mono text-xs font-bold text-danger">{r.id}</td>
                    <td className="p-6 text-muted">{new Date(r.date).toLocaleDateString('pt-BR')}</td>
                    <td className="p-6">
                      <p className="font-bold">{r.assetName}</p>
                      <p className="text-[10px] text-muted">{r.assetId}/{r.assetSub}</p>
                    </td>
                    <td className="p-6"><span className="text-[10px] font-bold uppercase bg-line px-2 py-1 rounded">{r.reason}</span></td>
                    <td className="p-6">
                      <div className="text-[10px] font-bold">
                        <p className="text-primary">BRL: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.acquisitionValueBRL)}</p>
                        <p className="text-success">USD: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(r.acquisitionValueUSD)}</p>
                      </div>
                    </td>
                    <td className="p-6">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        r.status === 'APROVADO' ? "bg-success/10 text-success" : "bg-amber-400/10 text-amber-400"
                      )}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {(user.role === 'ADMINISTRADOR' || user.role === 'GESTOR' || user.role === 'ANALISTA') && (
                          <button 
                            onClick={() => setViewingRequest(r)}
                            className="px-3 py-1 bg-line hover:bg-primary/20 text-primary rounded-lg text-xs font-bold"
                          >
                            Consultar
                          </button>
                        )}
                        {r.status === 'PENDENTE' && r.requesterId === user.id && (
                          <>
                            <button 
                              onClick={() => {
                                setNewRequest(r);
                                setIsCreating(true);
                              }}
                              className="px-3 py-1 bg-line hover:bg-amber-400/20 text-amber-400 rounded-lg text-xs font-bold"
                            >
                              Editar
                            </button>
                            <button 
                              onClick={() => onDelete(r.id)}
                              className="px-3 py-1 bg-line hover:bg-danger/20 text-danger rounded-lg text-xs font-bold"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                        {r.status === 'PENDENTE' && (user.role === 'ADMINISTRADOR' || user.role === 'GESTOR') && (
                          <button 
                            onClick={() => onApprove(r.id)}
                            className="px-4 py-1 bg-success hover:bg-success/80 text-white rounded-lg text-xs font-bold"
                          >
                            Aprovar Baixa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

function NavItem({ icon, label, active, collapsed, onClick }: { icon: React.ReactNode, label: string, active?: boolean, collapsed?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl transition-all relative group",
        active ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-muted hover:bg-primary/10 hover:text-primary"
      )}
    >
      <div className="shrink-0">{icon}</div>
      {!collapsed && <span className="font-medium whitespace-nowrap">{label}</span>}
      {collapsed && (
        <div className="absolute left-full ml-4 px-2 py-1 bg-panel border border-line rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
          {label}
        </div>
      )}
    </button>
  );
}

function SuppliersView({ suppliers, onCreate }: { suppliers: Supplier[], onCreate: (s: Supplier) => void }) {
  const [isCreating, setIsCreating] = useState(false);
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({
    id: Math.random().toString(36).substr(2, 9),
    name: '',
    cnpj: '',
    contact: '',
    email: '',
    phone: ''
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Gestão de Fornecedores</h2>
        <button 
          onClick={() => setIsCreating(true)}
          className="px-6 py-2 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold flex items-center gap-2"
        >
          <PlusCircle size={20} /> Novo Fornecedor
        </button>
      </div>

      {isCreating ? (
        <div className="bg-panel border border-line rounded-2xl p-8 card-gradient space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-muted mb-2 uppercase">Razão Social</label>
              <input type="text" className="w-full" value={newSupplier.name} onChange={e => setNewSupplier({...newSupplier, name: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-2 uppercase">CNPJ</label>
              <input type="text" className="w-full" placeholder="00.000.000/0000-00" value={newSupplier.cnpj} onChange={e => setNewSupplier({...newSupplier, cnpj: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-muted mb-2 uppercase">Contato</label>
              <input type="text" className="w-full" value={newSupplier.contact} onChange={e => setNewSupplier({...newSupplier, contact: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-2 uppercase">E-mail</label>
              <input type="email" className="w-full" value={newSupplier.email} onChange={e => setNewSupplier({...newSupplier, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted mb-2 uppercase">Telefone</label>
              <input type="tel" className="w-full" value={newSupplier.phone} onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t border-line">
            <button onClick={() => setIsCreating(false)} className="px-6 py-2 bg-line hover:bg-line/80 rounded-xl font-bold">Cancelar</button>
            <button 
              onClick={() => { onCreate(newSupplier as Supplier); setIsCreating(false); }}
              className="px-8 py-2 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold"
            >
              Cadastrar Fornecedor
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {suppliers.map(s => (
            <div key={s.id} className="bg-panel border border-line rounded-2xl p-6 card-gradient space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <Users size={24} />
                </div>
                <div>
                  <h4 className="font-bold">{s.name}</h4>
                  <p className="text-xs text-muted font-mono">{s.cnpj}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p className="flex items-center gap-2"><Users size={14} /> {s.contact}</p>
                <p className="flex items-center gap-2"><FileText size={14} /> {s.email}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SettingsView({ 
  fieldConfigs, 
  onUpdate,
  menuVisibility,
  setMenuVisibility,
  companies, setCompanies,
  branches, setBranches,
  accounts, setAccounts,
  classes, setClasses,
  costCenters, setCostCenters,
  ncms, setNcms,
  users, setUsers,
  depreciationMethod, setDepreciationMethod
}: { 
  fieldConfigs: FieldConfig[], 
  onUpdate: (c: FieldConfig[]) => void,
  menuVisibility: any,
  setMenuVisibility: (m: any) => void,
  companies: Company[], setCompanies: (c: Company[]) => void,
  branches: Branch[], setBranches: (b: Branch[]) => void,
  accounts: AccountingAccount[], setAccounts: (a: AccountingAccount[]) => void,
  classes: AssetClass[], setClasses: (c: AssetClass[]) => void,
  costCenters: CostCenter[], setCostCenters: (cc: CostCenter[]) => void,
  ncms: NCM[], setNcms: (n: NCM[]) => void,
  users: User[], setUsers: (u: User[]) => void,
  depreciationMethod: 'FISCAL' | 'ACCOUNTING',
  setDepreciationMethod: (m: 'FISCAL' | 'ACCOUNTING') => void
}) {
  const [activeTab, setActiveTab] = useState('gerais');
  const [isAddingData, setIsAddingData] = useState<{ type: string, title: string, editingId?: string } | null>(null);
  const [newData, setNewData] = useState<any>({});
  const [isAddingField, setIsAddingField] = useState<{ category: string, editingId?: string } | null>(null);
  const [newField, setNewField] = useState<Partial<FieldConfig>>({});

  const toggleVisibility = (id: string, type: 'visible' | 'collectorVisible') => {
    onUpdate(fieldConfigs.map(c => c.id === id ? { ...c, [type]: !c[type] } : c));
  };

  const handleAddMasterData = () => {
    if (!isAddingData) return;
    
    if (isAddingData.editingId) {
      const updateList = (list: any[]) => list.map(item => item.id === isAddingData.editingId ? { ...item, ...newData } : item);
      switch (isAddingData.type) {
        case 'company': setCompanies(updateList(companies)); break;
        case 'branch': setBranches(updateList(branches)); break;
        case 'account': setAccounts(updateList(accounts)); break;
        case 'class': setClasses(updateList(classes)); break;
        case 'costCenter': setCostCenters(updateList(costCenters)); break;
        case 'ncm': setNcms(updateList(ncms)); break;
        case 'user': setUsers(updateList(users)); break;
      }
    } else {
      const id = Math.random().toString(36).substr(2, 9);
      const item = { id, ...newData };

      switch (isAddingData.type) {
        case 'company': setCompanies([...companies, item]); break;
        case 'branch': setBranches([...branches, item]); break;
        case 'account': setAccounts([...accounts, item]); break;
        case 'class': setClasses([...classes, item]); break;
        case 'costCenter': setCostCenters([...costCenters, item]); break;
        case 'ncm': setNcms([...ncms, item]); break;
        case 'user': setUsers([...users, item]); break;
      }
    }
    
    setIsAddingData(null);
    setNewData({});
  };

  const handleAddField = () => {
    if (!isAddingField) return;
    
    if (isAddingField.editingId) {
      onUpdate(fieldConfigs.map(c => c.id === isAddingField.editingId ? { ...c, ...newField } : c));
    } else {
      const id = newField.id || Math.random().toString(36).substr(2, 9);
      onUpdate([...fieldConfigs, { 
        id, 
        label: newField.label || 'Novo Campo', 
        visible: newField.visible ?? true, 
        collectorVisible: newField.collectorVisible ?? false,
        category: isAddingField.category 
      } as any]);
    }
    
    setIsAddingField(null);
    setNewField({});
  };

  const categories = [
    { id: 'gerais', label: 'Cadastro' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'localizacao', label: 'Localização' },
    { id: 'fiscal', label: 'Fiscal' },
    { id: 'vidautil', label: 'Vida Útil' },
    { id: 'outros', label: 'Outros' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'etiquetagem', label: 'Etiquetagem' },
    { id: 'historico', label: 'Histórico' },
    { id: 'usuarios', label: 'Usuários' },
    { id: 'masterdata', label: 'Dados Mestres' },
    { id: 'menu', label: 'Menu do Sistema' },
  ];

  const filteredConfigs = fieldConfigs.filter(c => (c as any).category === activeTab);

  const MasterDataList = ({ title, data, onAdd, onEdit, onDelete }: { title: string, data: any[], onAdd: () => void, onEdit: (item: any) => void, onDelete: (id: string) => void }) => {
    const [search, setSearch] = useState('');
    const filtered = data.filter(item => 
      (item.name || item.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.code || item.id || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold uppercase tracking-widest text-primary">{title}</h4>
          <button onClick={onAdd} className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all">
            <Plus size={16} />
          </button>
        </div>
        <div className="relative flex items-center">
          <Search className="absolute left-3 text-muted" size={14} />
          <input 
            type="text" 
            className="w-full pl-9 py-2 text-xs" 
            placeholder={`Buscar em ${title}...`} 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-3 p-1 hover:bg-line rounded-full text-muted hover:text-danger transition-all"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {filtered.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between p-3 bg-bg/50 rounded-xl border border-line group">
              <div>
                <p className="text-sm font-bold">{item.name || item.description}</p>
                <p className="text-[10px] text-muted uppercase">{item.code || item.id}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onEdit(item)} className="p-2 text-muted hover:text-primary">
                  <Settings size={14} />
                </button>
                <button onClick={() => onDelete(item.id)} className="p-2 text-muted hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-xs text-muted py-4 italic">Nenhum resultado.</p>}
        </div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black">Configurações do Sistema</h2>
          <p className="text-muted text-sm">Personalize a visibilidade dos campos e gerencie dados mestres.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-success/10 text-success rounded-xl text-xs font-bold flex items-center gap-2">
            <Download size={16} /> Exportar CSV
          </button>
          <button className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold flex items-center gap-2">
            <Download size={16} /> Exportar Excel
          </button>
        </div>
      </div>

      <div className="bg-panel border border-line rounded-2xl overflow-hidden card-gradient">
        <div className="flex border-b border-line bg-bg/30 overflow-x-auto scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={cn(
                "px-6 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap",
                activeTab === cat.id ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted hover:text-primary"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="p-8">
          {activeTab === 'financeiro' && (
            <div className="mb-8 p-6 bg-primary/5 border border-primary/20 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-primary uppercase tracking-widest text-xs">Parâmetros Financeiros</h4>
                  <p className="text-xs text-muted mt-1">Defina o comportamento padrão dos cálculos de depreciação.</p>
                </div>
                <div className="flex items-center gap-2 bg-bg border border-line p-1 rounded-xl">
                  <button 
                    onClick={() => setDepreciationMethod('FISCAL')}
                    className={cn(
                      "px-4 py-2 text-xs font-bold rounded-lg transition-all",
                      depreciationMethod === 'FISCAL' ? "bg-primary text-white shadow-lg" : "text-muted hover:text-primary"
                    )}
                  >
                    Fiscal
                  </button>
                  <button 
                    onClick={() => setDepreciationMethod('ACCOUNTING')}
                    className={cn(
                      "px-4 py-2 text-xs font-bold rounded-lg transition-all",
                      depreciationMethod === 'ACCOUNTING' ? "bg-primary text-white shadow-lg" : "text-muted hover:text-primary"
                    )}
                  >
                    Contábil
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-muted italic">
                * O método selecionado será aplicado como padrão em todos os relatórios e visualizações de valor contábil.
              </p>
            </div>
          )}

          {isAddingData && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-panel border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6"
              >
                <h3 className="text-xl font-black uppercase tracking-widest text-primary">{isAddingData.editingId ? 'Editar' : 'Novo'}: {isAddingData.title}</h3>
                
                <div className="space-y-4">
                  {isAddingData.type === 'user' ? (
                    <>
                      <div>
                        <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Nome Completo</label>
                        <input type="text" className="w-full" value={newData.name || ''} onChange={e => setNewData({ ...newData, name: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-muted mb-1 uppercase">E-mail</label>
                        <input type="email" className="w-full" value={newData.email || ''} onChange={e => setNewData({ ...newData, email: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Nível de Acesso</label>
                        <select className="w-full" value={newData.role || ''} onChange={e => setNewData({ ...newData, role: e.target.value })}>
                          <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                          <option value="GESTOR">GESTOR</option>
                          <option value="ANALISTA">ANALISTA</option>
                          <option value="USUARIO">USUÁRIO</option>
                        </select>
                      </div>
                      <div className="pt-4 border-t border-line/30 space-y-4">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">Restrições de Acesso</p>
                        <div>
                          <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Empresa</label>
                          <select className="w-full" value={newData.companyId || 'ALL'} onChange={e => setNewData({ ...newData, companyId: e.target.value })}>
                            <option value="ALL">TODAS AS EMPRESAS</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Filial</label>
                          <select className="w-full" value={newData.branchId || 'ALL'} onChange={e => setNewData({ ...newData, branchId: e.target.value })}>
                            <option value="ALL">TODAS AS FILIAIS</option>
                            {branches
                              .filter(b => newData.companyId === 'ALL' || b.companyId === newData.companyId)
                              .map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Centro de Custo</label>
                          <select className="w-full" value={newData.costCenterId || 'ALL'} onChange={e => setNewData({ ...newData, costCenterId: e.target.value })}>
                            <option value="ALL">TODOS OS CENTROS DE CUSTO</option>
                            {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.code} - {cc.description}</option>)}
                          </select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {(isAddingData.type === 'company' || isAddingData.type === 'branch' || isAddingData.type === 'ncm') && (
                        <div>
                          <label className="block text-[10px] font-bold text-muted mb-1 uppercase">CNPJ / Código</label>
                          <input 
                            type="text" 
                            className="w-full" 
                            value={newData.code || newData.cnpj || ''} 
                            onChange={e => setNewData({ ...newData, [isAddingData.type === 'ncm' ? 'code' : 'cnpj']: e.target.value })} 
                          />
                        </div>
                      )}
                      {(isAddingData.type === 'account' || isAddingData.type === 'class' || isAddingData.type === 'costCenter') && (
                        <div>
                          <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Código</label>
                          <input 
                            type="text" 
                            className="w-full" 
                            value={newData.code || ''} 
                            onChange={e => setNewData({ ...newData, code: e.target.value })} 
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Nome / Descrição</label>
                        <input 
                          type="text" 
                          className="w-full" 
                          value={newData.name || newData.description || ''} 
                          onChange={e => setNewData({ ...newData, [isAddingData.type === 'company' || isAddingData.type === 'branch' ? 'name' : 'description']: e.target.value })} 
                        />
                      </div>
                      {isAddingData.type === 'branch' && (
                        <div>
                          <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Empresa</label>
                          <select className="w-full" value={newData.companyId || ''} onChange={e => setNewData({ ...newData, companyId: e.target.value })}>
                            <option value="">Selecione...</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      )}
                      {isAddingData.type === 'ncm' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Anos</label>
                            <input type="number" className="w-full" value={newData.fiscalYears || ''} onChange={e => setNewData({ ...newData, fiscalYears: parseInt(e.target.value) })} />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Taxa (%)</label>
                            <input type="number" className="w-full" value={newData.fiscalRate || ''} onChange={e => setNewData({ ...newData, fiscalRate: parseFloat(e.target.value) || 0 })} />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={() => setIsAddingData(null)} className="flex-1 py-3 bg-line hover:bg-line/80 rounded-xl font-bold transition-all">Cancelar</button>
                  <button onClick={handleAddMasterData} className="flex-1 py-3 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all">Salvar</button>
                </div>
              </motion.div>
            </div>
          )}

          {isAddingField && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-panel border border-line rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6"
              >
                <h3 className="text-xl font-black uppercase tracking-widest text-primary">{isAddingField.editingId ? 'Editar' : 'Novo'} Campo</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-muted mb-1 uppercase">ID do Campo (Sistêmico)</label>
                    <input 
                      type="text" 
                      className="w-full" 
                      placeholder="ex: brand_name"
                      disabled={!!isAddingField.editingId}
                      value={newField.id || ''} 
                      onChange={e => setNewField({ ...newField, id: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-muted mb-1 uppercase">Rótulo (Label)</label>
                    <input 
                      type="text" 
                      className="w-full" 
                      placeholder="ex: Nome da Marca"
                      value={newField.label || ''} 
                      onChange={e => setNewField({ ...newField, label: e.target.value })} 
                    />
                  </div>

                  <div className="flex gap-4 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newField.visible ?? true} 
                        onChange={e => setNewField({ ...newField, visible: e.target.checked })}
                        className="w-4 h-4 rounded border-line"
                      />
                      <span className="text-xs font-bold text-muted uppercase">Visível no Form</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newField.collectorVisible ?? false} 
                        onChange={e => setNewField({ ...newField, collectorVisible: e.target.checked })}
                        className="w-4 h-4 rounded border-line"
                      />
                      <span className="text-xs font-bold text-muted uppercase">Visível no Coletor</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={() => setIsAddingField(null)} className="flex-1 py-3 bg-line hover:bg-line/80 rounded-xl font-bold transition-all">Cancelar</button>
                  <button onClick={handleAddField} className="flex-1 py-3 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all">Salvar</button>
                </div>
              </motion.div>
            </div>
          )}

          {activeTab === 'masterdata' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <MasterDataList 
                title="Empresas" 
                data={companies} 
                onAdd={() => { setNewData({}); setIsAddingData({ type: 'company', title: 'Empresa' }); }}
                onEdit={(item) => { setNewData(item); setIsAddingData({ type: 'company', title: 'Empresa', editingId: item.id }); }}
                onDelete={(id) => setCompanies(companies.filter(c => c.id !== id))}
              />
              <MasterDataList 
                title="Filiais" 
                data={branches.map(b => ({ ...b, name: `${b.name} (${companies.find(c => c.id === b.companyId)?.name || 'N/A'})` }))} 
                onAdd={() => { setNewData({}); setIsAddingData({ type: 'branch', title: 'Filial' }); }}
                onEdit={(item) => { setNewData(item); setIsAddingData({ type: 'branch', title: 'Filial', editingId: item.id }); }}
                onDelete={(id) => setBranches(branches.filter(b => b.id !== id))}
              />
              <MasterDataList 
                title="Contas Contábeis" 
                data={accounts} 
                onAdd={() => { setNewData({}); setIsAddingData({ type: 'account', title: 'Conta Contábil' }); }}
                onEdit={(item) => { setNewData(item); setIsAddingData({ type: 'account', title: 'Conta Contábil', editingId: item.id }); }}
                onDelete={(id) => setAccounts(accounts.filter(a => a.id !== id))}
              />
              <MasterDataList 
                title="Classes de Ativos" 
                data={classes} 
                onAdd={() => { setNewData({}); setIsAddingData({ type: 'class', title: 'Classe de Ativo' }); }}
                onEdit={(item) => { setNewData(item); setIsAddingData({ type: 'class', title: 'Classe de Ativo', editingId: item.id }); }}
                onDelete={(id) => setClasses(classes.filter(c => c.id !== id))}
              />
              <MasterDataList 
                title="Centros de Custo" 
                data={costCenters} 
                onAdd={() => { setNewData({}); setIsAddingData({ type: 'costCenter', title: 'Centro de Custo' }); }}
                onEdit={(item) => { setNewData(item); setIsAddingData({ type: 'costCenter', title: 'Centro de Custo', editingId: item.id }); }}
                onDelete={(id) => setCostCenters(costCenters.filter(cc => cc.id !== id))}
              />
              <MasterDataList 
                title="NCMs" 
                data={ncms} 
                onAdd={() => { setNewData({}); setIsAddingData({ type: 'ncm', title: 'NCM' }); }}
                onEdit={(item) => { setNewData(item); setIsAddingData({ type: 'ncm', title: 'NCM', editingId: item.id }); }}
                onDelete={(id) => setNcms(ncms.filter(n => n.id !== id))}
              />
            </div>
          ) : activeTab === 'usuarios' ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Gestão de Usuários</h4>
                <button onClick={() => { setNewData({ role: 'ANALISTA', companyId: 'ALL', branchId: 'ALL', costCenterId: 'ALL' }); setIsAddingData({ type: 'user', title: 'Usuário' }); }} className="px-4 py-2 bg-primary text-white rounded-xl font-bold text-xs flex items-center gap-2">
                  <Plus size={16} /> Novo Usuário
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-bg/50 rounded-xl border border-line group">
                    <div className="flex items-center gap-4">
                      <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-lg border border-line" />
                      <div>
                        <p className="font-bold text-sm">{u.name}</p>
                        <p className="text-xs text-muted">
                          {u.email} • <span className="text-primary font-bold">{u.role}</span>
                          <span className="ml-2 pl-2 border-l border-line opacity-60">
                            {u.companyId === 'ALL' || !u.companyId ? 'Todas Empresas' : companies.find(c => c.id === u.companyId)?.name} • 
                            {u.branchId === 'ALL' || !u.branchId ? 'Todas Filiais' : branches.find(b => b.id === u.branchId)?.name}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => { setNewData(u); setIsAddingData({ type: 'user', title: 'Usuário', editingId: u.id }); }} className="p-2 text-muted hover:text-primary">
                        <Settings size={16} />
                      </button>
                      <button onClick={() => setUsers(users.filter(user => user.id !== u.id))} className="p-2 text-muted hover:text-danger">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-bg/50 p-6 rounded-xl border border-line">
                <h4 className="text-sm font-bold uppercase tracking-widest text-primary mb-4">Níveis de Acesso e Permissões</h4>
                <div className="space-y-4">
                  {[
                    { role: 'ADMINISTRADOR', desc: 'Controle geral do sistema e todas as configurações.' },
                    { role: 'GESTOR', desc: 'Acesso total, edições e aprovações das ações do analista.' },
                    { role: 'ANALISTA', desc: 'Cadastra, solicita movimentações/baixas e realiza importação/exportação em massa.' },
                    { role: 'USUARIO', desc: 'Acesso restrito para visualização e análise de dados (BI/Relatórios).' },
                  ].map(item => (
                    <div key={item.role} className="flex items-start gap-4 p-4 bg-bg rounded-xl border border-line">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Users size={20} className="text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{item.role}</p>
                        <p className="text-xs text-muted">{item.desc}</p>
                      </div>
                      <div className="ml-auto flex gap-2">
                        <span className="px-2 py-1 bg-success/10 text-success text-[10px] font-bold rounded">CADASTRO</span>
                        <span className="px-2 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded">MOVIMENTAÇÃO</span>
                        <span className="px-2 py-1 bg-amber-400/10 text-amber-400 text-[10px] font-bold rounded">BAIXAS</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === 'menu' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Visibilidade do Menu</h4>
                  <p className="text-[10px] text-muted font-bold uppercase mt-1">Escolha quais módulos aparecerão na lateral</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(menuVisibility).map(([key, isVisible]) => {
                  const menuLabels: Record<string, string> = {
                    dashboard: 'Dashboard',
                    assets: 'Ativos',
                    movements: 'Movimentações',
                    baixa: 'Baixas',
                    collector: 'Coletor de Dados',
                    inventory: 'Inventário',
                    reports: 'Relatórios',
                    bi: 'BI & Analytics',
                    compliance: 'Compliance',
                    settings: 'Configurações'
                  };

                  return (
                    <label key={key} className="flex items-center justify-between p-4 bg-bg/50 rounded-xl border border-line group cursor-pointer hover:border-primary transition-all">
                      <span className="text-xs font-bold uppercase text-muted group-hover:text-primary transition-all">{menuLabels[key] || key}</span>
                      <div 
                        onClick={(e) => {
                          e.preventDefault();
                          setMenuVisibility({ ...menuVisibility, [key] : !isVisible });
                        }}
                        className={cn(
                          "w-10 h-5 rounded-full relative transition-all",
                          isVisible ? "bg-primary" : "bg-line"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                          isVisible ? "right-1" : "left-1"
                        )} />
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary">Visibilidade dos Campos</h3>
                <button 
                  onClick={() => { setNewField({}); setIsAddingField({ category: activeTab }); }}
                  className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold flex items-center gap-2"
                >
                  <Plus size={16} /> Novo Campo
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredConfigs.length > 0 ? filteredConfigs.map(config => (
                  <div key={config.id} className="flex items-center justify-between p-4 bg-bg/50 rounded-xl border border-line group">
                    <div>
                      <p className="text-sm font-bold">{config.label}</p>
                      <p className="text-[10px] text-muted uppercase">{config.id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setNewField(config); setIsAddingField({ category: activeTab, editingId: config.id }); }} className="p-2 text-muted hover:text-primary">
                          <Settings size={14} />
                        </button>
                        <button onClick={() => onUpdate(fieldConfigs.filter(c => c.id !== config.id))} className="p-2 text-muted hover:text-danger">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button 
                          onClick={() => toggleVisibility(config.id, 'visible')}
                          className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-bold transition-all w-24",
                            config.visible ? "bg-success/20 text-success border border-success/30" : "bg-danger/20 text-danger border border-danger/30"
                          )}
                        >
                          FORM: {config.visible ? 'VISÍVEL' : 'OCULTO'}
                        </button>
                        <button 
                          onClick={() => toggleVisibility(config.id, 'collectorVisible')}
                          className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-bold transition-all w-24",
                            config.collectorVisible ? "bg-primary/20 text-primary border border-primary/30" : "bg-bg/50 text-muted border border-line"
                          )}
                        >
                          COLETOR: {config.collectorVisible ? 'VISÍVEL' : 'OCULTO'}
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="col-span-2 py-12 text-center text-muted italic">Nenhum campo configurável nesta categoria.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
function ComplianceView({ logs, user }: { logs: AuditLog[], user: User }) {
  const [filter, setFilter] = useState<'ALL' | 'ASSET' | 'MOVEMENT' | 'BAIXA'>('ALL');
  
  const filteredLogs = logs.filter(log => filter === 'ALL' || log.entity === filter);

  const getEntityColor = (entity: string) => {
    switch(entity) {
      case 'ASSET': return 'text-primary bg-primary/10';
      case 'MOVEMENT': return 'text-success bg-success/10';
      case 'BAIXA': return 'text-danger bg-danger/10';
      default: return 'text-muted bg-bg';
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black">Audit Trails & Compliance</h2>
          <p className="text-muted text-sm">Histórico completo de ações para auditoria e prestação de contas.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => exportToCSV(logs, 'audit-logs')}
            className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold flex items-center gap-2"
          >
            <Download size={16} /> Exportar Logs
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard title="Total de Ações" value={logs.length} icon={<History className="text-primary" />} />
        <StatCard title="Ações de Ativos" value={logs.filter(l => l.entity === 'ASSET').length} icon={<Package className="text-success" />} />
        <StatCard title="Movimentações" value={logs.filter(l => l.entity === 'MOVEMENT').length} icon={<ArrowLeftRight className="text-purple-500" />} />
        <StatCard title="Baixas Auditadas" value={logs.filter(l => l.entity === 'BAIXA').length} icon={<Trash2 className="text-danger" />} />
      </div>

      <div className="bg-panel border border-line rounded-3xl overflow-hidden card-gradient">
        <div className="p-6 border-b border-line bg-bg/30 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary">Log de Atividades</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => setFilter('ALL')}
                className={cn("px-3 py-1 text-[10px] font-bold rounded-lg transition-all", filter === 'ALL' ? "bg-primary text-white" : "hover:bg-line text-muted")}
              >
                TODOS
              </button>
              <button 
                onClick={() => setFilter('ASSET')}
                className={cn("px-3 py-1 text-[10px] font-bold rounded-lg transition-all", filter === 'ASSET' ? "bg-primary text-white" : "hover:bg-line text-muted")}
              >
                ATIVOS
              </button>
              <button 
                onClick={() => setFilter('MOVEMENT')}
                className={cn("px-3 py-1 text-[10px] font-bold rounded-lg transition-all", filter === 'MOVEMENT' ? "bg-primary text-white" : "hover:bg-line text-muted")}
              >
                MOVIMENTAÇÕES
              </button>
              <button 
                onClick={() => setFilter('BAIXA')}
                className={cn("px-3 py-1 text-[10px] font-bold rounded-lg transition-all", filter === 'BAIXA' ? "bg-primary text-white" : "hover:bg-line text-muted")}
              >
                BAIXAS
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted font-bold uppercase">Última atualização: {new Date().toLocaleTimeString()}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg/20">
                <th className="p-4 text-[10px] font-black uppercase text-muted tracking-widest border-b border-line">Timestamp</th>
                <th className="p-4 text-[10px] font-black uppercase text-muted tracking-widest border-b border-line">Usuário</th>
                <th className="p-4 text-[10px] font-black uppercase text-muted tracking-widest border-b border-line">Entidade</th>
                <th className="p-4 text-[10px] font-black uppercase text-muted tracking-widest border-b border-line">Ação</th>
                <th className="p-4 text-[10px] font-black uppercase text-muted tracking-widest border-b border-line">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.slice().reverse().map(log => (
                <tr key={log.id} className="border-b border-line hover:bg-white/5 transition-colors group">
                  <td className="p-4">
                    <p className="text-xs font-mono font-bold whitespace-nowrap">{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}</p>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-bg border border-line flex items-center justify-center text-[10px] font-bold">
                        {log.userName.charAt(0)}
                      </div>
                      <p className="text-xs font-bold">{log.userName}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={cn("px-2 py-0.5 rounded text-[8px] font-black uppercase", getEntityColor(log.entity))}>
                      {log.entity}
                    </span>
                  </td>
                  <td className="p-4">
                    <p className="text-xs font-bold text-white">{log.action}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-xs text-muted truncate max-w-xs">{log.details}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredLogs.length === 0 && (
          <div className="p-20 text-center">
            <Lock size={48} className="mx-auto text-muted mb-4 opacity-10" />
            <p className="text-muted font-bold">Nenhum registro encontrado para este filtro.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function CollectorView({ assets, user, fieldConfigs, sessions, onInventoryAction }: { 
  assets: Asset[], 
  user: User, 
  fieldConfigs: FieldConfig[],
  sessions: InventorySession[],
  onInventoryAction: (asset: Asset, session: InventorySession, status: string, obs: string) => void
}) {
  const [collectorView, setCollectorView] = useState<'dash' | 'consult' | 'start'>('dash');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [inventoryPeriod, setInventoryPeriod] = useState({ start: '2026-04-01', end: '2026-04-30' });
  const [checkedAssets, setCheckedAssets] = useState<Record<string, { status: string, tagFixed: boolean, obs?: string, date: string }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [scanningId, setScanningId] = useState('');
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(null);
  const [checkStatus, setCheckStatus] = useState('LOCALIZADO');
  const [tagFixed, setTagFixed] = useState(true);
  const [obs, setObs] = useState('');

  const totalItems = assets.length;
  const checkedCount = Object.keys(checkedAssets).length;

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      alert('Inventário sincronizado com sucesso!');
    }, 2000);
  };

  const handleLoadBase = () => {
    alert('Base de dados carregada para uso offline!');
  };

  const statusCounts = Object.values(checkedAssets).reduce((acc, curr: any) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const chartData = [
    { name: 'Localizados', value: statusCounts['LOCALIZADO'] || 0, color: '#34d399' },
    { name: 'Não Localizados', value: statusCounts['NAO_LOCALIZADO'] || 0, color: '#f87171' },
    { name: 'Baixa', value: statusCounts['BAIXA'] || 0, color: '#fbbf24' },
    { name: 'Sobra Física', value: statusCounts['SOBRA_FISICA'] || 0, color: '#60a5fa' },
    { name: 'Outros', value: statusCounts['OUTROS'] || 0, color: '#a855f7' },
  ].filter(d => d.value > 0);

  const handleScan = () => {
    const asset = assets.find(a => a.id === scanningId || a.name.toLowerCase().includes(scanningId.toLowerCase()));
    if (asset) {
      setCurrentAsset(asset);
    } else {
      alert('Ativo não encontrado na base!');
    }
  };

  const handleCheck = () => {
    if (currentAsset) {
      const session = sessions.find(s => s.id === selectedSessionId);
      
      setCheckedAssets({
        ...checkedAssets,
        [currentAsset.id]: { status: checkStatus, tagFixed, obs, date: new Date().toISOString() }
      });

      if (session) {
        onInventoryAction(currentAsset, session, checkStatus, obs);
      } else {
        alert('Item coletado, mas nenhuma sessão ativa vinculada.');
      }

      setCurrentAsset(null);
      setScanningId('');
      setObs('');
      setCheckStatus('LOCALIZADO');
      setTagFixed(true);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-24">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", isOnline ? "bg-success" : "bg-danger")} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <button 
            onClick={() => setIsOnline(!isOnline)}
            className="text-[10px] font-bold text-primary hover:underline"
          >
            Alternar Modo
          </button>
        </div>

        <div className="flex items-center justify-between bg-panel border border-line p-4 rounded-2xl card-gradient">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
              <Smartphone size={20} />
            </div>
            <div>
              <h2 className="font-black text-lg">Coletor de Dados</h2>
              <p className="text-[10px] text-muted uppercase font-bold tracking-widest">Inventário Mobile</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setCollectorView('dash')}
              className={cn("p-2 rounded-lg transition-all", collectorView === 'dash' ? "bg-primary text-white" : "bg-bg text-muted")}
            >
              <LayoutDashboard size={20} />
            </button>
            <button 
              onClick={() => setCollectorView('consult')}
              className={cn("p-2 rounded-lg transition-all", collectorView === 'consult' ? "bg-primary text-white" : "bg-bg text-muted")}
            >
              <Search size={20} />
            </button>
            <button 
              onClick={() => setCollectorView('start')}
              className={cn("p-2 rounded-lg transition-all", collectorView === 'start' ? "bg-primary text-white" : "bg-bg text-muted")}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      </div>

      {collectorView === 'dash' && (
        <div className="space-y-6">
          <div className="flex gap-4">
            <button 
              onClick={handleLoadBase}
              className="flex-1 py-3 bg-bg border border-line rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-line transition-all flex items-center justify-center gap-2"
            >
              <Download size={16} /> Carregar Base
            </button>
            <button 
              onClick={handleSync}
              disabled={isSyncing}
              className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary/80 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {isSyncing ? <Clock size={16} className="animate-spin" /> : <ArrowLeftRight size={16} />}
              {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-panel border border-line p-6 rounded-2xl card-gradient text-center">
              <p className="text-[10px] text-muted uppercase font-bold mb-1">Total para Inventariar</p>
              <p className="text-3xl font-black text-primary">{totalItems}</p>
            </div>
            <div className="bg-panel border border-line p-6 rounded-2xl card-gradient text-center">
              <p className="text-[10px] text-muted uppercase font-bold mb-1">Itens Checados</p>
              <p className="text-3xl font-black text-success">{checkedCount}</p>
            </div>
          </div>

          <div className="bg-panel border border-line p-6 rounded-2xl card-gradient">
            <h3 className="font-bold text-sm uppercase tracking-widest mb-6 text-center">Status da Coleta</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.length > 0 ? chartData : [{ name: 'Sem dados', value: 1, color: '#22304f' }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                    {chartData.length === 0 && <Cell fill="#22304f" />}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111a2e', border: '1px solid #22304f', borderRadius: '12px' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-panel border border-line p-6 rounded-2xl card-gradient">
            <h3 className="font-bold text-sm uppercase tracking-widest mb-4">Sessão de Inventário Ativa</h3>
            <select 
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full bg-bg border border-line rounded-xl px-4 py-3 text-xs font-bold font-mono"
            >
              <option value="">Selecione uma sessão...</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.id} - {s.branchName}</option>
              ))}
            </select>
            {selectedSessionId && (
              <div className="mt-4 p-4 bg-primary/5 rounded-xl border border-primary/20 space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase text-muted">
                  <span>Progresso da Sessão</span>
                  <span>{sessions.find(s => s.id === selectedSessionId)?.found || 0} de {sessions.find(s => s.id === selectedSessionId)?.totalItems || 0}</span>
                </div>
                <div className="w-full h-1.5 bg-line rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500" 
                    style={{ width: `${((sessions.find(s => s.id === selectedSessionId)?.found || 0) / (sessions.find(s => s.id === selectedSessionId)?.totalItems || 1)) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-panel border border-line p-6 rounded-2xl card-gradient">
            <h3 className="font-bold text-sm uppercase tracking-widest mb-4">Prazo do Inventário</h3>
            <div className="flex items-center justify-between text-sm">
              <div className="text-center">
                <p className="text-[10px] text-muted uppercase font-bold">Início</p>
                <p className="font-mono">{new Date(inventoryPeriod.start).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="h-px flex-1 bg-line mx-4" />
              <div className="text-center">
                <p className="text-[10px] text-muted uppercase font-bold">Fim</p>
                <p className="font-mono">{new Date(inventoryPeriod.end).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {collectorView === 'consult' && (
        <div className="space-y-6">
          <div className="bg-panel border border-line p-4 rounded-2xl card-gradient">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
              <input 
                type="text" 
                className="w-full pl-10 pr-4 py-3 bg-bg border border-line rounded-xl focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder="Digite número ou nome do ativo..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            {assets.filter(a => a.id.includes(searchTerm) || a.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10).map(asset => (
              <button 
                key={asset.id}
                onClick={() => { setCurrentAsset(asset); setCollectorView('start'); }}
                className="w-full bg-panel border border-line p-4 rounded-2xl card-gradient flex items-center justify-between hover:border-primary transition-all text-left"
              >
                <div>
                  <p className="font-bold">{asset.name}</p>
                  <p className="text-xs text-muted font-mono">{asset.id}/{asset.sub}</p>
                </div>
                <ChevronRight size={20} className="text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}

      {collectorView === 'start' && (
        <div className="space-y-6">
          {!currentAsset ? (
            <div className="bg-panel border border-line p-8 rounded-2xl card-gradient text-center space-y-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                <Camera size={40} />
              </div>
              <div>
                <h3 className="font-bold text-lg">Iniciar Coleta</h3>
                <p className="text-sm text-muted">Bipe o QR Code ou digite o número do patrimônio.</p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    className="w-full bg-bg border border-line rounded-xl px-4 py-3 font-mono text-center text-xl"
                    placeholder="000000"
                    value={scanningId}
                    onChange={e => setScanningId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleScan()}
                  />
                  {scanningId && (
                    <button 
                      onClick={() => setScanningId('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-line rounded-full text-muted transition-all"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
                <button 
                  onClick={handleScan}
                  className="px-6 bg-primary text-white rounded-xl font-bold"
                >
                  OK
                </button>
              </div>
              <button className="w-full py-4 bg-line hover:bg-line/80 rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                <Camera size={20} /> ABRIR CÂMERA
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-panel border border-line rounded-2xl overflow-hidden card-gradient">
                <div className="aspect-video bg-bg relative">
                  {currentAsset.photo ? (
                    <img src={currentAsset.photo} alt={currentAsset.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted">
                      <Camera size={48} className="opacity-20" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Patrimônio</p>
                    <h3 className="text-xl font-black">{currentAsset.id}/{currentAsset.sub}</h3>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    {fieldConfigs.filter(f => f.collectorVisible).map(config => {
                      let value = currentAsset[config.id];
                      
                      // Format special values
                      if (config.id === 'brand') value = `${currentAsset.brand} / ${currentAsset.model}`;
                      if (config.id === 'model') return null; // Combined with brand
                      if (config.id === 'name') value = currentAsset.name;
                      if (config.id === 'serialNumber') value = currentAsset.serialNumber || 'N/A';
                      if (config.id === 'costCenterCode') value = currentAsset.costCenterDescription;

                      if (!value && !['brand', 'name', 'serialNumber', 'costCenterCode'].includes(config.id)) return null;

                      return (
                        <div key={config.id}>
                          <p className="text-muted uppercase font-bold mb-1">{config.label}</p>
                          <p className={cn("font-bold", config.id === 'serialNumber' && "font-mono")}>
                            {value || '---'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-4 border-t border-line">
                    <p className="text-muted uppercase font-bold mb-1 text-[10px]">Localização</p>
                    <p className="text-sm font-bold">{currentAsset.location}</p>
                  </div>
                </div>
              </div>

              <div className="bg-panel border border-line p-6 rounded-2xl card-gradient space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Plaqueta Fixada?</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setTagFixed(true)}
                      className={cn("px-4 py-2 rounded-lg font-bold text-xs transition-all", tagFixed ? "bg-success text-white" : "bg-bg text-muted")}
                    >
                      SIM
                    </button>
                    <button 
                      onClick={() => setTagFixed(false)}
                      className={cn("px-4 py-2 rounded-lg font-bold text-xs transition-all", !tagFixed ? "bg-danger text-white" : "bg-bg text-muted")}
                    >
                      NÃO
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted uppercase">Status do Ativo</label>
                  <select 
                    className="w-full bg-bg border border-line rounded-xl px-4 py-3"
                    value={checkStatus}
                    onChange={e => setCheckStatus(e.target.value)}
                  >
                    <option value="LOCALIZADO">Localizado</option>
                    <option value="NAO_LOCALIZADO">Não Localizado</option>
                    <option value="BAIXA">Baixa</option>
                    <option value="SOBRA_FISICA">Sobra Física</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted uppercase">Observações do Inventário</label>
                  <textarea 
                    className="w-full bg-bg border border-line rounded-xl px-4 py-3 h-24"
                    placeholder="Informe aqui se houver divergências ou observações..."
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                  />
                </div>

                {checkStatus === 'OUTROS' && (
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                    <p className="text-[10px] font-bold text-primary uppercase">Nota:</p>
                    <p className="text-xs text-muted italic">Situação atípica registrada. O gestor será notificado.</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    onClick={() => setCurrentAsset(null)}
                    className="flex-1 py-4 bg-line hover:bg-line/80 rounded-xl font-bold transition-all"
                  >
                    VOLTAR
                  </button>
                  <button 
                    onClick={handleCheck}
                    className="flex-[2] py-4 bg-success hover:bg-success/80 text-white rounded-xl font-bold shadow-lg shadow-success/20 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={20} /> CHECK
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function ExecutiveSummary({ user, assets, movements }: { user: User, assets: Asset[], movements: any[] }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      try {
        const result = await getExecutiveSummary(user, assets, movements);
        setSummary(result);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [assets.length]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      
      const response = await chatWithAI(user, userMsg, history, assets, movements);
      setMessages(prev => [...prev, { role: 'model', text: response || 'Desculpe, não consegui responder.' }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: 'Houve um erro na conexão com a IA.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div id="chat-panel" className={cn(
      "bg-panel/40 backdrop-blur-md border border-line rounded-3xl p-6 mb-8 card-gradient overflow-hidden relative transition-all duration-300 shadow-2xl",
      isCollapsed ? "h-20" : "h-auto max-h-[800px] flex flex-col"
    )}>
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
          <div className="p-2 bg-primary/10 rounded-xl text-primary">
            <Sparkles size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-widest text-[color:var(--text-base)] flex items-center gap-2">
              ASSET IA
              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">EM TEMPO REAL</span>
            </h3>
            {isCollapsed && <p className="text-[10px] text-muted font-bold">Clique para expandir e conversar com a IA</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isCollapsed && messages.length > 0 && (
            <button 
              onClick={() => setMessages([])}
              className="p-2 hover:bg-line rounded-xl text-muted hover:text-primary transition-all"
              title="Limpar conversa"
            >
              <X size={20} />
            </button>
          )}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 hover:bg-line rounded-xl text-muted hover:text-primary transition-all"
          >
            {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto custom-scrollbar flex-1 space-y-6 pr-4 mb-4">
            {/* Initial Summary */}
            <div className="bg-bg/40 p-5 rounded-2xl border border-line/30">
              <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3 flex items-center gap-2">
                <Info size={12} /> Resumo Executivo
              </h4>
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-line rounded-full w-3/4"></div>
                  <div className="h-4 bg-line rounded-full w-full"></div>
                </div>
              ) : summary ? (
                <div className="prose prose-invert prose-sm max-w-none text-muted leading-relaxed font-medium">
                  <Markdown>{summary}</Markdown>
                </div>
              ) : (
                <p className="text-sm text-muted italic">Carregando resumo...</p>
              )}
            </div>

            {/* Chat Messages */}
            {messages.map((msg, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "flex flex-col gap-2 max-w-[85%]",
                  msg.role === 'user' ? "ml-auto items-end" : "items-start"
                )}
              >
                <div className={cn(
                  "px-4 py-3 rounded-2xl text-sm font-medium leading-relaxed",
                  msg.role === 'user' 
                    ? "bg-primary text-white rounded-tr-none shadow-lg shadow-primary/10" 
                    : "bg-panel border border-line rounded-tl-none text-muted prose prose-invert prose-sm"
                )}>
                  {msg.role === 'user' ? (
                    msg.text
                  ) : (
                    <Markdown>{msg.text}</Markdown>
                  )}
                </div>
                <span className="text-[9px] font-bold text-muted uppercase">
                  {msg.role === 'user' ? 'Você' : 'Asset'}
                </span>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2 items-center text-muted">
                <Sparkles size={16} className="animate-spin text-primary" />
                <span className="text-xs font-bold animate-pulse">Pensando...</span>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="mt-auto pt-4 border-t border-line flex gap-3 flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre seus ativos ou como usar o sistema..."
              className="flex-1 bg-bg/50 border border-line rounded-2xl px-6 py-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="p-3 bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:hover:bg-primary text-white rounded-2xl transition-all shadow-lg shadow-primary/20"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      )}

      {/* Background decoration */}
      <div className="absolute top-0 right-0 p-8 text-primary/5 -mr-4 -mt-4 transform rotate-12 pointer-events-none">
        <Sparkles size={120} />
      </div>
    </div>
  );
}

const CITY_COORDINATES: Record<string, { lat: number, lng: number }> = {
  'São Paulo': { lat: -23.5505, lng: -46.6333 },
  'Rio de Janeiro': { lat: -22.9068, lng: -43.1729 },
  'Belo Horizonte': { lat: -19.9167, lng: -43.9345 },
  'Curitiba': { lat: -25.4284, lng: -49.2733 },
  'Porto Alegre': { lat: -30.0346, lng: -51.2177 },
  'Brasília': { lat: -15.7801, lng: -47.9292 },
  'Salvador': { lat: -12.9714, lng: -38.5014 },
  'Recife': { lat: -8.0476, lng: -34.8770 },
  'Fortaleza': { lat: -3.7172, lng: -38.5433 },
  'Manaus': { lat: -3.1190, lng: -60.0217 },
  'Belém': { lat: -1.4558, lng: -48.4902 },
  'Cuiabá': { lat: -15.6014, lng: -56.0978 },
  'Goiânia': { lat: -16.6869, lng: -49.2648 },
  'Campinas': { lat: -22.9056, lng: -47.0608 },
  'Sede SP': { lat: -23.5505, lng: -46.6333 },
  'Filial RJ': { lat: -22.9068, lng: -43.1729 },
  'Centro Logístico MG': { lat: -19.9167, lng: -43.9345 },
  'Planta Manaus': { lat: -3.1190, lng: -60.0217 },
  'Sede Salvador': { lat: -12.9714, lng: -38.5014 },
  'Filial Recife': { lat: -8.0476, lng: -34.8770 },
  'Filial Porto Alegre': { lat: -30.0346, lng: -51.2177 },
  'Filial Curitiba': { lat: -25.4284, lng: -49.2733 },
  'Default': { lat: -15.7801, lng: -47.9292 },
};

const BRAZIL_GEO_URL = 'https://raw.githubusercontent.com/luizalg/brazil-geojson/master/brazil_geo.json';

import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icons in Leaflet + React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function AssetMap({ assets, isDarkMode }: { assets: Asset[], isDarkMode: boolean }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const cityData = assets.reduce((acc, a) => {
    let cityName = '';
    if (CITY_COORDINATES[a.branchName]) cityName = a.branchName;
    else if (CITY_COORDINATES[a.location]) cityName = a.location;
    else {
      const found = Object.keys(CITY_COORDINATES).find(key => 
        (a.location && a.location.includes(key)) || (a.branchName && a.branchName.includes(key))
      );
      if (found) cityName = found;
    }
    if (cityName && cityName !== 'Default') {
      acc[cityName] = (acc[cityName] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const colorScale = d3.scaleOrdinal(d3.schemeTableau10);
  const cities = Object.entries(cityData).map(([name, count]) => {
    const coords = CITY_COORDINATES[name];
    if (!coords) return null;
    return { name, count, coords, color: colorScale(name) };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  const maxCount = Math.max(...cities.map(c => c.count), 1);
  const sizeScale = d3.scaleSqrt().domain([0, maxCount]).range([4, 12]);

  const mapContent = (
    <div className={cn(
      "relative transition-all duration-500 rounded-2xl overflow-hidden shadow-inner bg-bg border border-line",
      isFullscreen ? "fixed inset-0 z-[1000] p-0 m-0 border-none rounded-none" : "w-full h-full"
    )}>
      <div className="absolute top-4 right-4 z-[1001] flex gap-2">
        <button 
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-2 bg-panel/80 backdrop-blur border border-line hover:bg-white/10 rounded-lg text-white transition-all shadow-xl"
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>

      <MapContainer 
        center={[-15.78, -47.93]} 
        zoom={4} 
        style={{ height: '100%', width: '100%', background: isDarkMode ? '#0b1220' : '#f5f6f7' }}
        scrollWheelZoom={true}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={isDarkMode 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          }
        />
        
        {cities.map((city) => (
          <CircleMarker
            key={city.name}
            center={[city.coords.lat, city.coords.lng]}
            radius={sizeScale(city.count)}
            pathOptions={{
              fillColor: city.color,
              fillOpacity: 0.7,
              color: 'white',
              weight: 2,
            }}
          >
            <LeafletTooltip direction="top" offset={[0, -10]} opacity={1} permanent={false}>
              <div className={cn(
                "p-2 rounded-lg border min-w-[120px]",
                isDarkMode ? "bg-panel border-line text-white" : "bg-white border-gray-200 text-gray-900 shadow-xl"
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: city.color }} />
                  <p className="text-[10px] font-black uppercase tracking-wider">{city.name}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black">{city.count}</span>
                  <span className={cn("text-[9px] uppercase font-bold tracking-widest", isDarkMode ? "text-muted" : "text-gray-500")}>Ativos</span>
                </div>
              </div>
            </LeafletTooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );

  return isFullscreen ? (
    <div className={cn(
      "fixed inset-0 z-[1000] flex items-center justify-center p-4",
      isDarkMode ? "bg-black/90 backdrop-blur-xl" : "bg-white/90 backdrop-blur-xl"
    )}>
      {mapContent}
    </div>
  ) : mapContent;
}

function DashboardView({ assets, movements, baixaRequests, currency, searchTerm, setView, reportDate, depreciationMethod, companies, branches, user, isDarkMode }: { assets: Asset[], movements: Movement[], baixaRequests: BaixaRequest[], currency: 'BRL' | 'USD', searchTerm: string, setView: (v: any) => void, reportDate: string, depreciationMethod: 'FISCAL' | 'ACCOUNTING', companies: Company[], branches: Branch[], user: User, isDarkMode: boolean }) {
  const [proportionType, setProportionType] = useState<'empresa' | 'filial' | 'custo' | 'conta'>('conta');

  useEffect(() => {
    const types: ('empresa' | 'filial' | 'custo' | 'conta')[] = ['empresa', 'filial', 'custo', 'conta'];
    const interval = setInterval(() => {
      setProportionType(prev => {
        const nextIndex = (types.indexOf(prev) + 1) % types.length;
        return types[nextIndex];
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatValue = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(val);
  };

  const filteredAssets = assets.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAcquisition = filteredAssets.reduce((s, a) => s + (currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD), 0);
  
  const depTotals = filteredAssets.reduce((acc, a) => {
    const { accumulated, bookValue } = calculateDepreciation(a, reportDate, depreciationMethod, currency);
    return {
      accumulated: acc.accumulated + accumulated,
      bookValue: acc.bookValue + bookValue
    };
  }, { accumulated: 0, bookValue: 0 });

  const pendingMovements = movements.filter(m => m.status === 'PENDENTE').length;
  
  // Pendências de Gestão
  const pendingValidation = assets.filter(a => a.status === 'EM_VALIDACAO').length;
  const inAlteration = assets.filter(a => a.status === 'EM_ALTERACAO').length;
  const pendingDeletion = assets.filter(a => a.status === 'EM_EXCLUSAO').length;
  const pendingBaixas = baixaRequests.filter(b => b.status === 'PENDENTE').length;

  // Ativos em Manutenção/Conserto
  const maintenanceAssets = movements
    .filter(m => m.type === 'CONSERTO' && m.status === 'EXECUTADO')
    .flatMap(m => m.items.map(item => {
      const asset = assets.find(a => a.id === item.assetId);
      const daysOut = Math.floor((new Date().getTime() - new Date(m.requestDate).getTime()) / (1000 * 60 * 60 * 24));
      return {
        ...item,
        daysOut,
        movementId: m.id,
        status: asset?.status
      };
    }));

  // Dynamic Proportion Distribution
  const distributionCounts: Record<string, { count: number, totalValue: number }> = {};
  
  filteredAssets.forEach(a => {
    let key = 'Outros';
    if (proportionType === 'empresa') {
      const company = companies.find(c => c.id === a.companyId);
      key = company?.name || 'Outros';
    }
    else if (proportionType === 'filial') {
      const branch = branches.find(b => b.id === a.branchId);
      key = branch?.name || 'Outros';
    }
    else if (proportionType === 'custo') key = a.costCenterDescription || 'Outros';
    else if (proportionType === 'conta') key = a.accountDescription || 'Outros';

    if (!distributionCounts[key]) {
      distributionCounts[key] = { count: 0, totalValue: 0 };
    }
    distributionCounts[key].count += 1;
    distributionCounts[key].totalValue += (currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD);
  });
  
  const distributionData = Object.entries(distributionCounts).map(([label, data]) => ({
    label,
    percentage: Math.round((data.count / filteredAssets.length) * 100),
    count: data.count,
    totalValue: data.totalValue
  })).sort((a, b) => b.count - a.count);

  // Status Distribution for Pie Chart
  const statusCounts = filteredAssets.reduce((acc: Record<string, number>, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ 
    name: name.replace('_', ' '), 
    value 
  }));

  const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a855f7'];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <ExecutiveSummary user={user} assets={filteredAssets} movements={movements} />
      
      <div id="stats-summary" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard title="Total de Ativos" value={filteredAssets.length} icon={<Package className="text-primary" />} />
        <StatCard title={`V. Aquisição (${currency})`} value={formatValue(totalAcquisition)} icon={<BarChart3 className="text-success" />} />
        <StatCard title="Depreciação Acumulada" value={formatValue(depTotals.accumulated)} icon={<TrendingDown className="text-danger" />} />
        <StatCard title="Valor Contábil" value={formatValue(depTotals.bookValue)} icon={<Shield className="text-purple-500" />} />
        <StatCard 
          title="Movimentações Pendentes" 
          value={pendingMovements} 
          icon={<Bell className={cn("transition-all", pendingMovements > 0 ? "text-danger animate-pulse" : "text-muted")} />} 
          onClick={() => setView('movements')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-panel border border-line rounded-2xl p-6 card-gradient h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold">Aquisições Recentes</h3>
              {searchTerm && <span className="text-xs text-primary font-bold uppercase">Filtrado por: {searchTerm}</span>}
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-muted uppercase border-b border-line">
                    <th className="pb-4 font-medium">Ativo</th>
                    <th className="pb-4 font-medium">Data</th>
                    <th className="pb-4 font-medium">Valor</th>
                    <th className="pb-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredAssets.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-muted">Nenhum ativo encontrado.</td></tr>
                  ) : (
                    [...filteredAssets]
                      .sort((a, b) => new Date(b.acquisitionDate).getTime() - new Date(a.acquisitionDate).getTime())
                      .slice(0, 5)
                      .map(asset => (
                      <tr key={asset.id} className="border-b border-line/50 last:border-0 hover:bg-white/5 transition-colors">
                        <td className="py-3 font-medium">
                          <p>{asset.name}</p>
                          <p className="text-[10px] text-muted font-mono">{asset.id}</p>
                        </td>
                        <td className="py-3 text-muted">{new Date(asset.acquisitionDate).toLocaleDateString('pt-BR')}</td>
                        <td className="py-3">{formatValue(currency === 'BRL' ? asset.acquisitionValueBRL : asset.acquisitionValueUSD)}</td>
                        <td className="py-3">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                            asset.status === 'ATIVO' ? "bg-success/10 text-success" : 
                            asset.status === 'EM_VALIDACAO' ? "bg-amber-400/10 text-amber-400" :
                            asset.status === 'BAIXADO' ? "bg-danger/10 text-danger" :
                            "bg-primary/10 text-primary"
                          )}>
                            {asset.status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-panel border border-line rounded-2xl p-6 card-gradient flex flex-col h-full">
            <h3 className="font-bold uppercase tracking-widest text-[10px] text-purple-500 mb-6">Status do Patrimônio</h3>
            <div className="flex-1 w-full relative group h-[400px]">
              <AssetMap assets={filteredAssets} isDarkMode={isDarkMode} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-panel border border-line rounded-2xl p-6 card-gradient h-full">
            <h3 className="font-bold mb-6">Pendências de Gestão</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <button 
                onClick={() => setView('assets')}
                className="p-4 bg-bg rounded-xl border border-line text-left hover:border-amber-400 transition-all group"
              >
                <p className="text-[10px] text-muted uppercase font-bold mb-1 group-hover:text-amber-400">Para Validar</p>
                <p className="text-xl font-black text-amber-400">{pendingValidation}</p>
              </button>
              <button 
                onClick={() => setView('movements')}
                className="p-4 bg-bg rounded-xl border border-line text-left hover:border-primary transition-all group"
              >
                <p className="text-[10px] text-muted uppercase font-bold mb-1 group-hover:text-primary">Em Alteração</p>
                <p className="text-xl font-black text-primary">{inAlteration}</p>
              </button>
              <button 
                onClick={() => setView('baixa')}
                className="p-4 bg-bg rounded-xl border border-line text-left hover:border-danger transition-all group"
              >
                <p className="text-[10px] text-muted uppercase font-bold mb-1 group-hover:text-danger">Para Baixar</p>
                <p className="text-xl font-black text-danger">{pendingBaixas}</p>
              </button>
              <button 
                onClick={() => setView('assets')}
                className="p-4 bg-bg rounded-xl border border-line text-left hover:border-danger transition-all group"
              >
                <p className="text-[10px] text-muted uppercase font-bold mb-1 group-hover:text-danger">Em Exclusão</p>
                <p className="text-xl font-black text-danger">{pendingDeletion}</p>
              </button>
            </div>

            <h4 className="text-xs font-bold uppercase text-muted mb-4">Ativos em Manutenção / Conserto</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-muted uppercase border-b border-line">
                    <th className="pb-2 font-medium">Ativo</th>
                    <th className="pb-2 font-medium">Dias Fora</th>
                    <th className="pb-2 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {maintenanceAssets.length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-center text-muted italic">Nenhum ativo em manutenção externa.</td></tr>
                  ) : (
                    maintenanceAssets.map(item => (
                      <tr key={`${item.assetId}-${item.movementId}`} className="border-b border-line/30 last:border-0">
                        <td className="py-3">
                          <p className="font-bold">{item.assetName}</p>
                          <p className="text-[10px] text-muted">{item.assetId}</p>
                        </td>
                        <td className="py-3">
                          <span className={cn(
                            "font-black",
                            item.daysOut > 120 ? "text-danger" : item.daysOut > 90 ? "text-amber-400" : "text-success"
                          )}>
                            {item.daysOut} dias
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button 
                            onClick={() => setView('movements')}
                            className="px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg font-bold transition-all"
                          >
                            Consultar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-panel border border-line rounded-2xl p-6 card-gradient flex flex-col h-full">
            <div className="flex flex-col mb-6">
              <h3 className="font-bold uppercase tracking-widest text-[10px] text-primary mb-1">Distribuição por Valor</h3>
              <p className="text-base font-black uppercase">
                {proportionType === 'empresa' && 'Por Empresa'}
                {proportionType === 'filial' && 'Por Filial'}
                {proportionType === 'custo' && 'Por Centro de Custo'}
                {proportionType === 'conta' && 'Por Conta Contábil'}
              </p>
            </div>
            
            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {distributionData.length === 0 ? (
                <p className="text-center text-muted py-8">Sem dados.</p>
              ) : (
                distributionData.slice(0, 12).map((item, idx) => (
                  <ProgressItem 
                    key={item.label} 
                    label={item.label} 
                    value={item.percentage} 
                    rawValue={formatValue(item.totalValue)}
                    color={['bg-primary', 'bg-success', 'bg-amber-400', 'bg-danger', 'bg-purple-500', 'bg-blue-400'][idx % 6]} 
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// StatCard and ProgressItem imported from components/common/UIComponents.tsx

function AssetsListView({ 
  assets, 
  currency, 
  searchTerm, 
  reportDate, 
  setReportDate, 
  depreciationMethod, 
  onEdit, 
  onConsult,
  onDelete,
  onImport,
  user
}: { 
  assets: Asset[], 
  currency: 'BRL' | 'USD', 
  searchTerm: string, 
  reportDate: string, 
  setReportDate: (d: string) => void, 
  depreciationMethod: 'FISCAL' | 'ACCOUNTING', 
  onEdit: (a: Asset) => void, 
  onConsult: (a: Asset) => void,
  onDelete: (a: Asset) => void,
  onImport: (assets: Asset[]) => void,
  user: User
}) {
  const [sortConfig, setSortConfig] = useState<{ key: keyof Asset | 'totalValue' | 'accumulated' | 'bookValue', direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  const formatValue = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(val);
  };

  const filteredAssets = assets.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    let aValue: any = a[sortConfig.key as keyof Asset];
    let bValue: any = b[sortConfig.key as keyof Asset];

    if (sortConfig.key === 'totalValue') {
      aValue = currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD;
      bValue = currency === 'BRL' ? b.acquisitionValueBRL : b.acquisitionValueUSD;
    }

    if (sortConfig.key === 'acquisitionDate') {
      aValue = new Date(a.acquisitionDate).getTime();
      bValue = new Date(b.acquisitionDate).getTime();
    }

    if (sortConfig.key === 'accumulated' || sortConfig.key === 'bookValue') {
      const { accumulated: aAcc, bookValue: aBook } = calculateDepreciation(a, reportDate, depreciationMethod, currency);
      const { accumulated: bAcc, bookValue: bBook } = calculateDepreciation(b, reportDate, depreciationMethod, currency);
      aValue = sortConfig.key === 'accumulated' ? aAcc : aBook;
      bValue = sortConfig.key === 'accumulated' ? bAcc : bBook;
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const downloadTemplate = () => {
    const headers = ['ID', 'Sub', 'Nome', 'Data Aquisição (AAAA-MM-DD)', 'Data Incorporação (AAAA-MM-DD)', 'Valor BRL', 'Valor USD', 'Código Conta', 'Descrição Conta', 'Código Classe', 'Descrição Classe', 'Código C.Custo', 'Descrição C.Custo', 'Localização', 'Responsável', 'Condição (NOVO/BOM/REGULAR/RUIM)', 'NCM'];
    const csvContent = headers.join(",") + "\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "modelo_importacao_ativos.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totals = sortedAssets.reduce((acc, a) => {
    const acqVal = currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD;
    const { accumulated, bookValue } = calculateDepreciation(a, reportDate, depreciationMethod, currency);
    return {
      acquisition: acc.acquisition + acqVal,
      accumulated: acc.accumulated + accumulated,
      bookValue: acc.bookValue + bookValue
    };
  }, { acquisition: 0, accumulated: 0, bookValue: 0 });

  const handleSort = (key: keyof Asset | 'totalValue' | 'accumulated' | 'bookValue') => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const exportCSV = () => {
    const headers = ['ID', 'Sub', 'Nome', 'Classe', 'C.Custo', 'Valor Aquisição', 'Status'];
    const rows = sortedAssets.map(a => [
      a.id,
      a.sub,
      a.name,
      a.classDescription,
      a.costCenterDescription,
      currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD,
      a.status
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "ativos.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const importedAssets: Asset[] = results.data.map((row: any) => ({
          id: row['ID'] || '',
          sub: parseInt(row['Sub']) || 0,
          name: row['Nome'] || '',
          acquisitionDate: row['Data Aquisição (AAAA-MM-DD)'] || new Date().toISOString().split('T')[0],
          incorporationDate: row['Data Incorporação (AAAA-MM-DD)'] || new Date().toISOString().split('T')[0],
          acquisitionValueBRL: parseFloat(row['Valor BRL']) || 0,
          acquisitionValueUSD: parseFloat(row['Valor USD']) || 0,
          residualValueBRL: 0,
          residualPercentageBRL: 0,
          residualValueUSD: 0,
          residualPercentageUSD: 0,
          accountCode: row['Código Conta'] || '',
          accountDescription: row['Descrição Conta'] || '',
          classCode: row['Código Classe'] || '',
          classDescription: row['Descrição Classe'] || '',
          costCenterCode: row['Código C.Custo'] || '',
          costCenterDescription: row['Descrição C.Custo'] || '',
          location: row['Localização'] || '',
          responsible: row['Responsável'] || '',
          condition: (row['Condição (NOVO/BOM/REGULAR/RUIM)'] || 'NOVO') as any,
          ncm: row['NCM'] || '',
          status: 'ATIVO',
          isNew: true,
          history: [{
            id: Math.random().toString(36).substr(2, 9),
            date: new Date().toISOString(),
            type: 'CRIACAO',
            user: 'Sistema (Importação)',
            description: 'Ativo importado via planilha.'
          }],
          incentives: { 
            incentivosCreditos: false, ciap: false, depIncentivada: false, depCSLL: false, 
            depAcelerada: false, recap: false, creditoImediato: false, drawback: false, 
            sudamSudene: false, zfm: false, repes: false, others: false 
          },
          fiscalUsefulLifeYears: 0,
          fiscalUsefulLifeMonths: 0,
          fiscalAnnualRate: 0,
          accountingUsefulLifeYears: 0,
          accountingUsefulLifeMonths: 0,
          accountingAnnualRate: 0
        }));
        onImport(importedAssets);
      }
    });
  };

  const totalQty = sortedAssets.length;
  const totalValue = sortedAssets.reduce((s, a) => s + (currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD), 0);

  const SortIcon = ({ column }: { column: keyof Asset | 'totalValue' | 'accumulated' | 'bookValue' }) => {
    if (sortConfig.key !== column) return <ArrowLeftRight size={10} className="ml-1 opacity-30 rotate-90" />;
    return sortConfig.direction === 'asc' ? <TrendingUp size={10} className="ml-1 text-primary" /> : <TrendingDown size={10} className="ml-1 text-primary" />;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-panel border border-line rounded-2xl p-4 card-gradient flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Package size={20} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase font-bold">Qtd Ativos</p>
            <p className="text-lg font-black">{sortedAssets.length}</p>
          </div>
        </div>
        <div className="bg-panel border border-line rounded-2xl p-4 card-gradient flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase font-bold">Total Aquisição</p>
            <p className="text-lg font-black">{formatValue(totals.acquisition)}</p>
          </div>
        </div>
        <div className="bg-panel border border-line rounded-2xl p-4 card-gradient flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center text-danger">
            <TrendingDown size={20} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase font-bold">Depr. Acumulada</p>
            <p className="text-lg font-black">{formatValue(totals.accumulated)}</p>
          </div>
        </div>
        <div className="bg-panel border border-line rounded-2xl p-4 card-gradient flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
            <Shield size={20} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase font-bold">Valor Contábil</p>
            <p className="text-lg font-black">{formatValue(totals.bookValue)}</p>
          </div>
        </div>
      </div>

      <div className="bg-panel border border-line rounded-2xl overflow-hidden card-gradient overflow-x-auto">
        <div className="p-6 border-b border-line flex flex-wrap items-center justify-between gap-4 min-w-[800px]">
          <div>
            <h3 className="font-bold">Listagem de Ativos</h3>
            <p className="text-xs text-muted mt-1">Total de {sortedAssets.length} ativos encontrados</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3 bg-bg border border-line px-4 py-2 rounded-xl">
              <label className="text-[10px] font-bold text-muted uppercase">Data do Relatório:</label>
              <input 
                type="date" 
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="bg-transparent border-none text-xs font-bold focus:ring-0 outline-none p-0 w-28"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={downloadTemplate}
                className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
              >
                <Download size={16} /> Modelo Importação
              </button>
              <div className="relative">
                <button className="px-4 py-2 bg-success/10 hover:bg-success/20 text-success rounded-xl text-sm font-bold flex items-center gap-2 transition-all">
                  <Plus size={16} /> Importar Planilha
                </button>
                <input 
                  type="file" 
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
              <button 
                onClick={() => exportToCSV(sortedAssets.map(a => {
                  const { accumulated, bookValue } = calculateDepreciation(a, reportDate, depreciationMethod, currency);
                  return {
                    'Imobilizado': `${a.id}/${a.sub}`,
                    'Data Aquisição': new Date(a.acquisitionDate).toLocaleDateString('pt-BR'),
                    'Denominação': a.name,
                    'Classe': a.classDescription,
                    'C. Custo': a.costCenterDescription,
                    'V. Aquisição': currency === 'BRL' ? a.acquisitionValueBRL : a.acquisitionValueUSD,
                    'Depr. Acumulada': accumulated,
                    'Valor Contábil': bookValue,
                    'Status': a.status
                  };
                }), 'listagem-ativos')}
                className="px-4 py-2 bg-line hover:bg-primary/20 text-primary rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
              >
                <Download size={16} /> Exportar CSV
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1200px]">
            <thead>
              <tr className="text-[10px] text-muted uppercase border-b border-line bg-bg/30">
                <th className="p-6 font-bold tracking-widest">Foto</th>
                <th className="p-6 font-bold tracking-widest cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('id')}>
                  <div className="flex items-center">Imobilizado <SortIcon column="id" /></div>
                </th>
                <th className="p-6 font-bold tracking-widest cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('acquisitionDate')}>
                  <div className="flex items-center">Data Aquisição <SortIcon column="acquisitionDate" /></div>
                </th>
                <th className="p-6 font-bold tracking-widest cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center">Denominação <SortIcon column="name" /></div>
                </th>
                <th className="p-6 font-bold tracking-widest cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('classDescription')}>
                  <div className="flex items-center">Classe <SortIcon column="classDescription" /></div>
                </th>
                <th className="p-6 font-bold tracking-widest cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('costCenterDescription')}>
                  <div className="flex items-center">C. Custo <SortIcon column="costCenterDescription" /></div>
                </th>
                <th className="p-6 font-bold tracking-widest text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('totalValue')}>
                  <div className="flex items-center justify-end">V. Aquisição <SortIcon column="totalValue" /></div>
                </th>
                <th className="p-6 font-bold tracking-widest text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('accumulated')}>
                  <div className="flex items-center justify-end">Depr. Acumulada <SortIcon column="accumulated" /></div>
                </th>
                <th className="p-6 font-bold tracking-widest text-right cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('bookValue')}>
                  <div className="flex items-center justify-end">Valor Contábil <SortIcon column="bookValue" /></div>
                </th>
                <th className="p-6 font-bold tracking-widest cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center">Status <SortIcon column="status" /></div>
                </th>
                <th className="p-6 font-bold tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedAssets.length === 0 ? (
                <tr><td colSpan={11} className="p-12 text-center text-muted italic">Nenhum ativo encontrado.</td></tr>
              ) : (
                sortedAssets.map(asset => {
                  const { accumulated, bookValue } = calculateDepreciation(asset, reportDate, depreciationMethod, currency);
                  return (
                    <tr 
                      key={`${asset.id}-${asset.sub}`} 
                      className={cn(
                        "border-b border-line/50 hover:bg-line/20 transition-all group",
                        asset.status === 'EM_ALTERACAO' && "bg-amber-400/5",
                        asset.status === 'EM_EXCLUSAO' && "bg-warning/5"
                      )}
                    >
                      <td className="p-6">
                        <div className="w-12 h-12 rounded-lg bg-bg border border-line overflow-hidden relative">
                          {asset.photo ? (
                            <img src={asset.photo} alt={asset.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted">
                              <Package size={20} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-6 font-mono text-xs">{asset.id}/{asset.sub}</td>
                      <td className="p-6">
                        <p className="text-xs font-bold">{new Date(asset.acquisitionDate).toLocaleDateString('pt-BR')}</p>
                      </td>
                      <td className="p-6">
                        <p className="font-bold text-primary">{asset.name}</p>
                        <p className="text-[10px] text-muted uppercase">{asset.location}</p>
                      </td>
                      <td className="p-6 text-muted text-xs uppercase">{asset.classDescription}</td>
                      <td className="p-6 text-muted text-xs uppercase">{asset.costCenterDescription}</td>
                      <td className="p-6 text-right font-bold">
                        {formatValue(currency === 'BRL' ? asset.acquisitionValueBRL : asset.acquisitionValueUSD)}
                      </td>
                      <td className="p-6 text-right font-bold text-danger">
                        {formatValue(accumulated)}
                      </td>
                      <td className="p-6 text-right font-bold text-success">
                        {formatValue(bookValue)}
                      </td>
                      <td className="p-6">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          asset.status === 'ATIVO' ? "bg-success/10 text-success" : 
                          asset.status === 'EM_EXCLUSAO' ? "bg-warning/10 text-warning" :
                          asset.status === 'EM_ALTERACAO' ? "bg-amber-400/10 text-amber-400" :
                          "bg-danger/10 text-danger"
                        )}>
                          {asset.status === 'EM_EXCLUSAO' ? 'EM EXCLUSÃO' : 
                           asset.status === 'EM_ALTERACAO' ? 'EM ALTERAÇÃO' : 
                           asset.status}
                        </span>
                      </td>
                      <td className="p-6">
                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => onConsult(asset)}
                            className="p-2 hover:bg-primary/20 text-primary rounded-lg transition-all"
                            title="Consultar"
                          >
                            <Search size={16} />
                          </button>
                          {user.role !== 'USUARIO' && (
                            <button 
                              onClick={() => onEdit(asset)}
                              className="p-2 hover:bg-primary/20 text-primary rounded-lg transition-all"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          {(user.role === 'ADMINISTRADOR' || user.role === 'GESTOR') && (
                            <button 
                              onClick={() => onDelete(asset)}
                              className="p-2 hover:bg-danger/20 text-danger rounded-lg transition-all"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}


const formatCurrencyBR = (value: number | undefined | null) => {
  if (value === undefined || value === null) return '0,00';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const parseCurrencyBR = (value: string) => {
  const cleanValue = value.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(cleanValue) || 0;
};

// InputWithClear imported from components/common/UIComponents.tsx

function AssetFormView({ 
  asset, 
  assets = [],
  onSave, 
  onCancel, 
  onImport,
  fieldConfigs,
  companies,
  branches,
  accounts,
  classes,
  costCenters,
  ncms,
  currency,
  readOnly = false
}: { 
  asset: Asset | null, 
  assets?: Asset[],
  onSave: (a: Asset) => void, 
  onCancel: () => void, 
  onImport?: (assets: Asset[]) => void,
  fieldConfigs: FieldConfig[],
  companies: Company[],
  branches: Branch[],
  accounts: AccountingAccount[],
  classes: AssetClass[],
  costCenters: CostCenter[],
  ncms: NCM[],
  currency: 'BRL' | 'USD',
  readOnly?: boolean
}) {
  const [activeTab, setActiveTab] = useState('gerais');
  const [formData, setFormData] = useState<Partial<Asset>>(asset ? {
    ...asset,
    incentives: {
      incentivosCreditos: false,
      ciap: false,
      depIncentivada: false,
      depCSLL: false,
      depAcelerada: false,
      recap: false,
      creditoImediato: false,
      drawback: false,
      sudamSudene: false,
      zfm: false,
      repes: false,
      others: false,
      ...asset.incentives
    },
    incentiveValues: asset.incentiveValues || {}
  } : {
    id: '',
    sub: 0,
    name: '',
    status: 'ATIVO',
    acquisitionDate: new Date().toISOString().split('T')[0],
    incorporationDate: new Date().toISOString().split('T')[0],
    acquisitionValueBRL: 0,
    residualValueBRL: 0,
    residualPercentageBRL: 0,
    acquisitionValueUSD: 0,
    residualValueUSD: 0,
    residualPercentageUSD: 0,
    incentives: { 
      incentivosCreditos: false, 
      ciap: false, 
      depIncentivada: false, 
      depCSLL: false, 
      depAcelerada: false, 
      recap: false, 
      creditoImediato: false, 
      drawback: false, 
      sudamSudene: false, 
      zfm: false, 
      repes: false, 
      others: false 
    },
    incentiveValues: {},
    fiscalUsefulLifeYears: 0,
    fiscalUsefulLifeMonths: 0,
    fiscalAnnualRate: 0,
    accountingUsefulLifeYears: 0,
    accountingUsefulLifeMonths: 0,
    accountingAnnualRate: 0,
    fiscalMonthlyDepreciationBRL: 0,
    fiscalAnnualDepreciationBRL: 0,
    fiscalMonthlyDepreciationUSD: 0,
    fiscalAnnualDepreciationUSD: 0,
    accountingMonthlyDepreciationBRL: 0,
    accountingAnnualDepreciationBRL: 0,
    accountingMonthlyDepreciationUSD: 0,
    accountingAnnualDepreciationUSD: 0,
    history: [],
    condition: 'NOVO',
    isNew: true,
    labelType: 'QR',
    supplierId: '',
    supplierName: '',
    supplierFantasyName: '',
    supplierContact: '',
    supplierEmail: '',
    supplierPhone: '',
    supplierAttachment: '',
    supplierObservations: '',
    nfeAttachment: '',
    insurance: {
      companyCode: '',
      companyName: '',
      policyNumber: '',
      susepNumber: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      contact: '',
      email: '',
      phone: '',
      startDate: '',
      endDate: '',
      value: 0,
      attachment: '',
      observations: ''
    },
    maintenance: {
      programming: '',
      review: '',
      calibration: '',
      lastMaintenanceDate: '',
      nextMaintenanceDate: '',
      observations: ''
    },
    leasing: {
      contractNumber: '',
      startDate: '',
      endDate: '',
      value: 0,
      attachment: '',
      observations: ''
    },
    documents: [],
    items_description: ''
  });

  useEffect(() => {
    const yearsFiscal = formData.fiscalUsefulLifeYears || 0;
    const monthsFiscal = yearsFiscal * 12;
    const yearsAccounting = formData.accountingUsefulLifeYears || 0;
    const monthsAccounting = yearsAccounting * 12;
    
    const acqBRL = formData.acquisitionValueBRL || 0;
    const acqUSD = formData.acquisitionValueUSD || 0;

    const fiscalMonthlyBRL = monthsFiscal > 0 ? acqBRL / monthsFiscal : 0;
    const fiscalAnnualBRL = fiscalMonthlyBRL * 12;
    const fiscalMonthlyUSD = monthsFiscal > 0 ? acqUSD / monthsFiscal : 0;
    const fiscalAnnualUSD = fiscalMonthlyUSD * 12;

    const accMonthlyBRL = monthsAccounting > 0 ? acqBRL / monthsAccounting : 0;
    const accAnnualBRL = accMonthlyBRL * 12;

    const accMonthlyUSD = monthsAccounting > 0 ? acqUSD / monthsAccounting : 0;
    const accAnnualUSD = accMonthlyUSD * 12;

    if (
      monthsFiscal !== formData.fiscalUsefulLifeMonths ||
      monthsAccounting !== formData.accountingUsefulLifeMonths ||
      fiscalMonthlyBRL !== formData.fiscalMonthlyDepreciationBRL ||
      fiscalAnnualBRL !== formData.fiscalAnnualDepreciationBRL ||
      fiscalMonthlyUSD !== formData.fiscalMonthlyDepreciationUSD ||
      fiscalAnnualUSD !== formData.fiscalAnnualDepreciationUSD ||
      accMonthlyBRL !== formData.accountingMonthlyDepreciationBRL ||
      accAnnualBRL !== formData.accountingAnnualDepreciationBRL ||
      accMonthlyUSD !== formData.accountingMonthlyDepreciationUSD ||
      accAnnualUSD !== formData.accountingAnnualDepreciationUSD
    ) {
      setFormData(prev => ({
        ...prev,
        fiscalUsefulLifeMonths: monthsFiscal,
        accountingUsefulLifeMonths: monthsAccounting,
        fiscalMonthlyDepreciationBRL: fiscalMonthlyBRL,
        fiscalAnnualDepreciationBRL: fiscalAnnualBRL,
        fiscalMonthlyDepreciationUSD: fiscalMonthlyUSD,
        fiscalAnnualDepreciationUSD: fiscalAnnualUSD,
        accountingMonthlyDepreciationBRL: accMonthlyBRL,
        accountingAnnualDepreciationBRL: accAnnualBRL,
        accountingMonthlyDepreciationUSD: accMonthlyUSD,
        accountingAnnualDepreciationUSD: accAnnualUSD
      }));
    }
  }, [
    formData.acquisitionValueBRL, 
    formData.acquisitionValueUSD, 
    formData.fiscalUsefulLifeYears, 
    formData.accountingUsefulLifeYears
  ]);

  const isVisible = (id: string) => {
    return fieldConfigs.find(c => c.id === id)?.visible ?? true;
  };

  const tabs = [
    { id: 'gerais', label: 'Dados Gerais' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'localizacao', label: 'Localização' },
    { id: 'fiscal', label: 'Fiscal' },
    { id: 'vidautil', label: 'Vida Útil' },
    { id: 'fornecedor', label: 'Fornecedor', configId: 'tab_fornecedor' },
    { id: 'seguros', label: 'Seguros', configId: 'tab_seguros' },
    { id: 'manutencao', label: 'Manutenção', configId: 'tab_manutencao' },
    { id: 'leasing', label: 'Leasing', configId: 'tab_leasing' },
    { id: 'documentos', label: 'DOCUMENTOS', configId: 'tab_documentos' },
    { id: 'etiquetagem', label: 'ETIQUETAGEM', configId: 'tab_etiquetagem' },
    { id: 'historico', label: 'HISTÓRICO', configId: 'tab_historico' },
  ];

  const filteredTabs = tabs.filter(tab => !tab.configId || isVisible(tab.configId));

  const standardFieldIds = [
    'brand', 'model', 'serialNumber', 'chassis', 'engine', 'rpm', 'dimensions', 'tag', 'equipmentNumber', 'unit', 'capacity', 'color',
    'acquisitionDate', 'incorporationDate', 'acquisitionValueBRL', 'residualValueBRL', 'acquisitionValueUSD', 'residualValueUSD',
    'accountCode', 'previousAccount', 'classCode', 'previousClass', 'costCenterCode', 'previousCostCenter', 'location', 'room', 'environment', 'collaborator', 'responsible', 'condition', 'observations',
    'nfe', 'nfeKey', 'nfeAttachment', 'ncm', 'ncmDescription', 'fiscalUsefulLifeYears', 'fiscalUsefulLifeMonths', 'fiscalAnnualRate', 'accountingUsefulLifeYears', 'accountingUsefulLifeMonths', 'accountingAnnualRate', 'items_description'
  ];

  const clearField = (field: keyof Asset) => {
    setFormData({ ...formData, [field]: '' as any });
  };

  const handleNCMLookup = (ncmCode: string) => {
    const data = ncms.find(n => n.code === ncmCode);
    if (data) {
      setFormData({
        ...formData,
        ncm: data.code,
        ncmDescription: data.description,
        fiscalUsefulLifeYears: data.fiscalYears,
        fiscalAnnualRate: data.fiscalRate
      });
    }
  };

  const [ncmSearch, setNcmSearch] = useState('');
  const [showNcmSearch, setShowNcmSearch] = useState(false);
  const [isProcessingNF, setIsProcessingNF] = useState(false);

  const handleProcessNF = async (file: File) => {
    setIsProcessingNF(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await extractInvoiceData(base64, file.type);
        if (result) {
          setFormData(prev => ({
            ...prev,
            name: result.denomination || prev.name,
            ncm: result.ncm || prev.ncm,
            acquisitionValueBRL: result.value || prev.acquisitionValueBRL,
            supplierName: result.supplier || prev.supplierName
          }));
          if (result.ncm) handleNCMLookup(result.ncm);
          alert('Dados extraídos com sucesso via IA!');
        }
      };
    } catch (error) {
      console.error(error);
      alert('Erro ao processar Nota Fiscal.');
    } finally {
      setIsProcessingNF(false);
    }
  };

  const handleSave = () => {
    // Check for duplicate ID
    if (!asset && formData.id) {
      const exists = assets.some(a => a.id === formData.id && a.sub === (formData.sub || 0));
      if (exists) {
        alert(`O imobilizado ${formData.id}/${formData.sub || 0} já existe no sistema!`);
        return;
      }
    }
    onSave(formData as Asset);
  };

  const downloadTemplate = () => {
    const headers = [
      'ID', 'Sub', 'Nome', 'Data Aquisição (AAAA-MM-DD)', 'Data Incorporação (AAAA-MM-DD)', 
      'Valor BRL', 'Valor USD', 'Código Conta', 'Descrição Conta', 'Código Classe', 
      'Descrição Classe', 'Código C.Custo', 'Descrição C.Custo', 'Localização', 
      'Responsável', 'Condição (NOVO/BOM/REGULAR/RUIM)', 'NCM'
    ];
    const csvContent = [headers].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "modelo_importacao_ativos.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImport) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const importedAssets: Asset[] = results.data.map((row: any) => ({
          id: row['ID'] || '',
          sub: parseInt(row['Sub']) || 0,
          name: row['Nome'] || '',
          status: 'ATIVO',
          acquisitionDate: row['Data Aquisição (AAAA-MM-DD)'] || new Date().toISOString().split('T')[0],
          incorporationDate: row['Data Incorporação (AAAA-MM-DD)'] || new Date().toISOString().split('T')[0],
          acquisitionValueBRL: parseFloat(row['Valor BRL']) || 0,
          acquisitionValueUSD: parseFloat(row['Valor USD']) || 0,
          residualValueBRL: 0,
          residualPercentageBRL: 0,
          residualValueUSD: 0,
          residualPercentageUSD: 0,
          accountCode: row['Código Conta'] || '',
          accountDescription: row['Descrição Conta'] || '',
          classCode: row['Código Classe'] || '',
          classDescription: row['Descrição Classe'] || '',
          costCenterCode: row['Código C.Custo'] || '',
          costCenterDescription: row['Descrição C.Custo'] || '',
          location: row['Localização'] || '',
          responsible: row['Responsável'] || '',
          condition: (row['Condição (NOVO/BOM/REGULAR/RUIM)'] as any) || 'NOVO',
          ncm: row['NCM'] || '',
          isNew: true,
          history: [{
            id: Math.random().toString(36).substr(2, 9),
            date: new Date().toISOString(),
            type: 'CRIACAO',
            description: 'Ativo importado via planilha.',
            user: 'SISTEMA'
          }],
          incentives: { 
            incentivosCreditos: false, ciap: false, depIncentivada: false, depCSLL: false, 
            depAcelerada: false, recap: false, creditoImediato: false, drawback: false, 
            sudamSudene: false, zfm: false, repes: false, others: false 
          },
          fiscalUsefulLifeYears: 0,
          fiscalUsefulLifeMonths: 0,
          fiscalAnnualRate: 0,
          accountingUsefulLifeYears: 0,
          accountingUsefulLifeMonths: 0,
          accountingAnnualRate: 0
        }));
        onImport(importedAssets);
      }
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-6xl mx-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black">{readOnly ? `Consultar Ativo: ${asset?.id}` : (asset ? `Editar Ativo: ${asset.id}` : 'Novo Cadastro de Ativo')}</h2>
          <p className="text-muted text-sm">{readOnly ? 'Visualização em modo somente leitura.' : 'Preencha os dados do patrimônio conforme as normas contábeis e fiscais.'}</p>
        </div>
        <div className="flex gap-3">
          {!readOnly && onImport && (
            <>
              <button onClick={downloadTemplate} className="px-4 py-2 bg-line hover:bg-line/80 rounded-xl text-xs font-bold flex items-center gap-2">
                <Download size={14} /> Modelo Importação
              </button>
              <div className="relative">
                <button className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold flex items-center gap-2">
                  <Upload size={14} /> Cadastrar em Massa
                </button>
                <input 
                  type="file" 
                  accept=".csv" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={handleFileUpload}
                />
              </div>
            </>
          )}
          <button onClick={onCancel} className="px-6 py-2 bg-line hover:bg-line/80 rounded-xl font-bold">{readOnly ? 'Fechar' : 'Cancelar'}</button>
          {!readOnly && (
            <button 
              onClick={handleSave}
              className="px-8 py-2 bg-primary hover:bg-primary/80 text-white rounded-xl font-bold shadow-lg shadow-primary/20"
            >
              Salvar Ativo
            </button>
          )}
        </div>
      </div>

      <div className="bg-panel border border-line rounded-2xl overflow-hidden card-gradient">
        <div className="flex border-b border-line bg-bg/30 overflow-x-auto scrollbar-hide">
          {filteredTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-6 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap",
                activeTab === tab.id ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted hover:text-primary"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-8">
          {activeTab === 'gerais' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <InputWithClear 
                  label="Nº do Item" 
                  value={formData.id} 
                  onChange={v => {
                    if (!asset && v) {
                      const exists = assets.some(a => a.id === v && a.sub === (formData.sub || 0));
                      if (exists) {
                        alert(`O imobilizado ${v}/${formData.sub || 0} já existe no sistema!`);
                        return; // Prevent setting the value
                      }
                    }
                    setFormData({...formData, id: v});
                  }} 
                  onClear={() => clearField('id')} 
                  isVisible={isVisible} 
                />
                <InputWithClear 
                  label="Subitem" 
                  value={formData.sub} 
                  onChange={v => {
                    const newSub = parseInt(v) || 0;
                    if (!asset && formData.id) {
                      const exists = assets.some(a => a.id === formData.id && a.sub === newSub);
                      if (exists) {
                        alert(`O imobilizado ${formData.id}/${newSub} já existe no sistema!`);
                        return;
                      }
                    }
                    setFormData({...formData, sub: newSub});
                  }} 
                  onClear={() => setFormData({...formData, sub: 0})} 
                  type="number" 
                  isVisible={isVisible} 
                />
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Status</label>
                  <select className="w-full" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                    <option value="ATIVO">Ativo</option>
                    <option value="PENDENTE_APROVACAO">Pendente Aprovação</option>
                    <option value="TRANSFERIDO">Transferido</option>
                    <option value="BAIXADO">Baixado</option>
                  </select>
                </div>
                <InputWithClear label="Origem" value={formData.origin} onChange={v => setFormData({...formData, origin: v})} onClear={() => clearField('origin')} isVisible={isVisible} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                  <InputWithClear label="Denominação do Imobilizado" value={formData.name} onChange={v => setFormData({...formData, name: v})} onClear={() => clearField('name')} isVisible={isVisible} />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Foto Principal</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="text" className="w-full pr-10" placeholder="URL da Foto" value={formData.photo} onChange={e => setFormData({...formData, photo: e.target.value})} />
                      {formData.photo && <button onClick={() => clearField('photo')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-danger">✕</button>}
                    </div>
                    <div className="relative">
                      <button className="p-2 bg-line hover:bg-primary/20 text-primary rounded-lg transition-all">
                        <Camera size={20} />
                      </button>
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setFormData({...formData, photo: URL.createObjectURL(file)});
                      }} />
                    </div>
                  </div>
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Foto Secundária</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="text" className="w-full pr-10" placeholder="URL da Foto 2" value={formData.photo2} onChange={e => setFormData({...formData, photo2: e.target.value})} />
                      {formData.photo2 && <button onClick={() => clearField('photo2')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-danger">✕</button>}
                    </div>
                    <div className="relative">
                      <button className="p-2 bg-line hover:bg-primary/20 text-primary rounded-lg transition-all">
                        <Camera size={20} />
                      </button>
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setFormData({...formData, photo2: URL.createObjectURL(file)});
                      }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <InputWithClear label="Marca" value={formData.brand} onChange={v => setFormData({...formData, brand: v})} onClear={() => clearField('brand')} configId="brand" isVisible={isVisible} />
                <InputWithClear label="Modelo" value={formData.model} onChange={v => setFormData({...formData, model: v})} onClear={() => clearField('model')} configId="model" isVisible={isVisible} />
                {formData.accountDescription?.toUpperCase().includes('VEÍCULOS') && (
                  <InputWithClear label="Placa do Veículo" value={formData.licensePlate} onChange={v => setFormData({...formData, licensePlate: v})} onClear={() => clearField('licensePlate')} isVisible={isVisible} />
                )}
                <InputWithClear label="Nº Série" value={formData.serialNumber} onChange={v => setFormData({...formData, serialNumber: v})} onClear={() => clearField('serialNumber')} configId="serialNumber" isVisible={isVisible} />
                <InputWithClear label="Chassi" value={formData.chassis} onChange={v => setFormData({...formData, chassis: v})} onClear={() => clearField('chassis')} configId="chassis" isVisible={isVisible} />
                <InputWithClear label="Motor / Modelo" value={formData.engine} onChange={v => setFormData({...formData, engine: v})} onClear={() => clearField('engine')} configId="engine" isVisible={isVisible} />
                <InputWithClear label="RPM" value={formData.rpm} onChange={v => setFormData({...formData, rpm: v})} onClear={() => clearField('rpm')} configId="rpm" isVisible={isVisible} />
                <InputWithClear label="Tamanho / Dimensão" value={formData.dimensions} onChange={v => setFormData({...formData, dimensions: v})} onClear={() => clearField('dimensions')} configId="dimensions" isVisible={isVisible} />
                <InputWithClear label="TAG" value={formData.tag} onChange={v => setFormData({...formData, tag: v})} onClear={() => clearField('tag')} configId="tag" isVisible={isVisible} />
                <InputWithClear label="Nº Equipamento" value={formData.equipmentNumber} onChange={v => setFormData({...formData, equipmentNumber: v})} onClear={() => clearField('equipmentNumber')} configId="equipmentNumber" isVisible={isVisible} />
                <InputWithClear label="Unidade Medida" value={formData.unit} onChange={v => setFormData({...formData, unit: v})} onClear={() => clearField('unit')} configId="unit" isVisible={isVisible} />
                <InputWithClear label="Capacidade / Peso" value={formData.capacity} onChange={v => setFormData({...formData, capacity: v})} onClear={() => clearField('capacity')} configId="capacity" isVisible={isVisible} />
                <InputWithClear label="Cor" value={formData.color} onChange={v => setFormData({...formData, color: v})} onClear={() => clearField('color')} configId="color" isVisible={isVisible} />
                
                {/* Dynamic Custom Fields */}
                {fieldConfigs.filter(c => (c as any).category === 'gerais' && isVisible(c.id) && !standardFieldIds.includes(c.id)).map(config => (
                  <InputWithClear 
                    key={config.id}
                    label={config.label} 
                    value={formData[config.id] || ''} 
                    onChange={v => setFormData({...formData, [config.id]: v})} 
                    onClear={() => setFormData({...formData, [config.id]: ''})} 
                  />
                ))}
              </div>

              <div className="relative group/field pt-6 border-t border-line">
                <label className="block text-xs font-bold text-muted mb-2 uppercase">Itens / Componentes</label>
                <textarea 
                  className="w-full h-32" 
                  placeholder="Liste aqui os itens ou componentes que fazem parte deste ativo..."
                  value={formData.items_description || ''}
                  onChange={e => setFormData({...formData, items_description: e.target.value})}
                />
              </div>
            </div>
          )}

          {activeTab === 'financeiro' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <InputWithClear label="Data de Aquisição" value={formData.acquisitionDate} onChange={v => setFormData({...formData, acquisitionDate: v})} onClear={() => clearField('acquisitionDate')} type="date" configId="acquisitionDate" isVisible={isVisible} />
                <InputWithClear label="Data de Incorporação" value={formData.incorporationDate} onChange={v => setFormData({...formData, incorporationDate: v})} onClear={() => clearField('incorporationDate')} type="date" configId="incorporationDate" isVisible={isVisible} />
                <InputWithClear label="Data de Desativação" value={formData.deactivationDate} onChange={v => setFormData({...formData, deactivationDate: v})} onClear={() => clearField('deactivationDate')} type="date" isVisible={isVisible} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-bg/50 p-6 rounded-xl border border-line space-y-4">
                  <h4 className="text-sm font-bold text-primary uppercase tracking-widest">Valores em Reais (BRL)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <InputWithClear label="V. Aquisição" value={formData.acquisitionValueBRL} onChange={v => setFormData({...formData, acquisitionValueBRL: v})} onClear={() => setFormData({...formData, acquisitionValueBRL: 0})} type="currency" configId="acquisitionValueBRL" isVisible={isVisible} />
                    <InputWithClear label="V. Residual" value={formData.residualValueBRL} onChange={v => setFormData({...formData, residualValueBRL: v})} onClear={() => setFormData({...formData, residualValueBRL: 0})} type="currency" configId="residualValueBRL" isVisible={isVisible} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <InputWithClear label="% Residual" value={formData.residualPercentageBRL} onChange={v => setFormData({...formData, residualPercentageBRL: v})} onClear={() => setFormData({...formData, residualPercentageBRL: 0})} type="currency" isVisible={isVisible} />
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Valor Depreciável</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((formData.acquisitionValueBRL || 0) - (formData.residualValueBRL || 0))}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-bg/50 p-6 rounded-xl border border-line space-y-4">
                  <h4 className="text-sm font-bold text-success uppercase tracking-widest">Valores em Dólar (USD)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <InputWithClear label="V. Aquisição" value={formData.acquisitionValueUSD} onChange={v => setFormData({...formData, acquisitionValueUSD: v})} onClear={() => setFormData({...formData, acquisitionValueUSD: 0})} type="currency" configId="acquisitionValueUSD" isVisible={isVisible} />
                    <InputWithClear label="V. Residual" value={formData.residualValueUSD} onChange={v => setFormData({...formData, residualValueUSD: v})} onClear={() => setFormData({...formData, residualValueUSD: 0})} type="currency" configId="residualValueUSD" isVisible={isVisible} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <InputWithClear label="% Residual" value={formData.residualPercentageUSD} onChange={v => setFormData({...formData, residualPercentageUSD: v})} onClear={() => setFormData({...formData, residualPercentageUSD: 0})} type="currency" isVisible={isVisible} />
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Valor Depreciável</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format((formData.acquisitionValueUSD || 0) - (formData.residualValueUSD || 0))}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Custom Fields for Financeiro */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-line">
                {fieldConfigs.filter(c => (c as any).category === 'financeiro' && isVisible(c.id) && !standardFieldIds.includes(c.id)).map(config => (
                  <InputWithClear 
                    key={config.id}
                    label={config.label} 
                    value={formData[config.id] || ''} 
                    onChange={v => setFormData({...formData, [config.id]: v})} 
                    onClear={() => setFormData({...formData, [config.id]: ''})} 
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'localizacao' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Estrutura Organizacional</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <MasterDataSelector 
                      label="Empresa"
                      value={formData.companyId || ''}
                      description={formData.companyName || ''}
                      options={companies.map(c => ({ id: c.id, name: c.name }))}
                      onSelect={(id, name) => setFormData({...formData, companyId: id, companyName: name})}
                      isVisible={isVisible('companyId')}
                    />
                    <MasterDataSelector 
                      label="Filial"
                      value={formData.branchId || ''}
                      description={formData.branchName || ''}
                      options={branches.filter(b => !formData.companyId || b.companyId === formData.companyId).map(b => ({ id: b.id, name: b.name }))}
                      onSelect={(id, name) => setFormData({...formData, branchId: id, branchName: name})}
                      isVisible={isVisible('branchId')}
                    />
                  </div>
                  
                  <h4 className="text-sm font-bold uppercase tracking-widest text-primary mt-6">Classificação Contábil</h4>
                  {isVisible('accountCode') && (
                    <MasterDataSelector 
                      label="Conta Contábil"
                      value={formData.accountCode || ''}
                      description={formData.accountDescription || ''}
                      options={accounts.map(a => ({ id: a.code, name: a.description }))}
                      onSelect={(id, name) => setFormData({...formData, accountCode: id, accountDescription: name})}
                    />
                  )}
                  <InputWithClear label="Conta Anterior" value={formData.previousAccount} onChange={v => setFormData({...formData, previousAccount: v})} onClear={() => clearField('previousAccount')} isVisible={isVisible} />
                  {isVisible('classCode') && (
                    <MasterDataSelector 
                      label="Classe do Ativo"
                      value={formData.classCode || ''}
                      description={formData.classDescription || ''}
                      options={classes.map(c => ({ id: c.code, name: c.description }))}
                      onSelect={(id, name) => setFormData({...formData, classCode: id, classDescription: name})}
                    />
                  )}
                  <InputWithClear label="Classe Anterior" value={formData.previousClass} onChange={v => setFormData({...formData, previousClass: v})} onClear={() => clearField('previousClass')} isVisible={isVisible} />
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-success">Localização Física</h4>
                  {isVisible('costCenterCode') && (
                    <MasterDataSelector 
                      label="Centro de Custo"
                      value={formData.costCenterCode || ''}
                      description={formData.costCenterDescription || ''}
                      options={costCenters.map(c => ({ id: c.code, name: c.description }))}
                      onSelect={(id, name) => setFormData({...formData, costCenterCode: id, costCenterDescription: name})}
                    />
                  )}
                  <InputWithClear label="C. Custo Anterior" value={formData.previousCostCenter} onChange={v => setFormData({...formData, previousCostCenter: v})} onClear={() => clearField('previousCostCenter')} isVisible={isVisible} />
                  <div className="grid grid-cols-2 gap-4">
                    <InputWithClear label="Localização" value={formData.location} onChange={v => setFormData({...formData, location: v})} onClear={() => clearField('location')} configId="location" isVisible={isVisible} />
                    <InputWithClear label="Sala" value={formData.room} onChange={v => setFormData({...formData, room: v})} onClear={() => clearField('room')} configId="room" isVisible={isVisible} />
                    <InputWithClear label="Ambiente" value={formData.environment} onChange={v => setFormData({...formData, environment: v})} onClear={() => clearField('environment')} configId="environment" isVisible={isVisible} />
                    <InputWithClear label="Colaborador" value={formData.collaborator} onChange={v => setFormData({...formData, collaborator: v})} onClear={() => clearField('collaborator')} configId="collaborator" isVisible={isVisible} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-line">
                <InputWithClear label="Responsável" value={formData.responsible} onChange={v => setFormData({...formData, responsible: v})} onClear={() => clearField('responsible')} configId="responsible" isVisible={isVisible} />
                <div className="relative group/field">
                  <label className={cn("block text-xs font-bold text-muted mb-2 uppercase", !isVisible('condition') && "hidden")}>Condição de Uso</label>
                  <select className={cn("w-full", !isVisible('condition') && "hidden")} value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value as any})}>
                    <option value="NOVO">Novo</option>
                    <option value="BOM">Bom</option>
                    <option value="REGULAR">Regular</option>
                    <option value="RUIM">Ruim</option>
                  </select>
                </div>
              </div>
              <div className={cn("relative group/field", !isVisible('observations') && "hidden")}>
                <label className="block text-xs font-bold text-muted mb-2 uppercase">Observações</label>
                <textarea className="w-full h-24" value={formData.observations} onChange={e => setFormData({...formData, observations: e.target.value})} />
              </div>

              {/* Dynamic Custom Fields for Localizacao */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-line">
                {fieldConfigs.filter(c => (c as any).category === 'localizacao' && isVisible(c.id) && !standardFieldIds.includes(c.id)).map(config => (
                  <InputWithClear 
                    key={config.id}
                    label={config.label} 
                    value={formData[config.id] || ''} 
                    onChange={v => setFormData({...formData, [config.id]: v})} 
                    onClear={() => setFormData({...formData, [config.id]: ''})} 
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'fiscal' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputWithClear label="Nota Fiscal (NF-e)" value={formData.nfe} onChange={v => setFormData({...formData, nfe: v})} onClear={() => clearField('nfe')} configId="nfe" isVisible={isVisible} />
                <InputWithClear label="Chave de Acesso" value={formData.nfeKey} onChange={v => setFormData({...formData, nfeKey: v})} onClear={() => clearField('nfeKey')} configId="nfeKey" isVisible={isVisible} />
              </div>
              <div className={cn("relative group/field", !isVisible('nfeAttachment') && "hidden")}>
                <label className="block text-xs font-bold text-muted mb-2 uppercase">Anexo da Nota Fiscal</label>
                <div className="flex gap-2">
                  <input type="text" className="flex-1" placeholder="URL do PDF/Arquivo" value={formData.nfeAttachment} onChange={e => setFormData({...formData, nfeAttachment: e.target.value})} />
                  <div className="relative">
                    <button className={cn(
                      "px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2",
                      isProcessingNF ? "bg-primary/20 text-muted" : "bg-line hover:bg-primary/20 text-primary"
                    )}>
                      {isProcessingNF ? <Clock size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {isProcessingNF ? 'Processando IA...' : 'Anexar e Ler NF'}
                    </button>
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFormData({...formData, nfeAttachment: URL.createObjectURL(file)});
                        await handleProcessNF(file);
                      }
                    }} />
                  </div>
                </div>
                <p className="text-[9px] text-muted mt-1 font-bold italic">* Ao anexar um arquivo, a IA tentará extrair dados (Nome, NCM, Valor, Fornecedor).</p>
              </div>

              <div className="bg-bg/50 p-6 rounded-2xl border border-line">
                <h4 className="text-sm font-bold mb-4 uppercase tracking-widest text-primary">Incentivos / Créditos Fiscais</h4>
                
                {/* Checkboxes Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mb-8">
                  {['incentivosCreditos', 'ciap', 'depIncentivada', 'depCSLL', 'depAcelerada', 'recap', 'creditoImediato', 'drawback', 'sudamSudene', 'zfm', 'repes', 'others'].map((key) => {
                    const value = (formData.incentives as any)?.[key] || false;
                    const configId = `incentive_${key}`;
                    if (!isVisible(configId)) return null;
                    return (
                      <label key={key} className="flex items-center gap-2 p-2 bg-panel rounded-lg border border-line cursor-pointer hover:border-primary transition-all">
                        <input 
                          type="checkbox" 
                          checked={value} 
                          onChange={e => setFormData({
                            ...formData, 
                            incentives: { ...formData.incentives!, [key]: e.target.checked }
                          })}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-[10px] font-bold uppercase leading-tight">{INCENTIVE_LABELS[key] || key}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Values Section - Only shown if at least one incentive is checked */}
                {Object.values(formData.incentives || {}).some(v => v) && (
                  <div className="pt-6 border-t border-line/30">
                    <h5 className="text-[10px] font-black mb-4 uppercase tracking-widest text-muted">Valores dos Incentivos</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(formData.incentives || {}).map(([key, isChecked]) => {
                        if (!isChecked) return null;
                        return (
                          <div key={key} className="space-y-2">
                            <label className="block text-[10px] font-bold text-muted uppercase">{INCENTIVE_LABELS[key] || key}</label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-xs font-bold">
                                {currency === 'BRL' ? 'R$' : '$'}
                              </span>
                              <input 
                                type="text"
                                className="w-full pl-12 pr-4 py-2 bg-bg border border-line rounded-xl text-xs font-bold focus:border-primary transition-all"
                                placeholder="0,00"
                                value={formatCurrencyBR(formData.incentiveValues?.[key] || 0)}
                                onChange={e => {
                                  const clean = e.target.value.replace(/[^\d,]/g, '');
                                  const parsed = parseCurrencyBR(clean);
                                  setFormData({
                                    ...formData,
                                    incentiveValues: {
                                      ...formData.incentiveValues,
                                      [key]: parsed
                                    }
                                  });
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'vidautil' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={cn("relative group/field", !isVisible('ncm') && "hidden")}>
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">NCM</label>
                  <select className="w-full" value={formData.ncm} onChange={e => handleNCMLookup(e.target.value)}>
                    <option value="">Selecione...</option>
                    {ncms.map(n => <option key={n.code} value={n.code}>{n.code} - {n.description}</option>)}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Pesquisar NCM</label>
                  <button 
                    onClick={() => setShowNcmSearch(true)}
                    className="w-full h-[42px] bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all border border-primary/20"
                  >
                    <Search size={18} /> Clique aqui para Pesquisar NCM
                  </button>
                </div>
              </div>
              
              <div className={cn("relative group/field", !isVisible('ncmDescription') && "hidden")}>
                <label className="block text-xs font-bold text-muted mb-2 uppercase">Descrição NCM</label>
                <input 
                  type="text"
                  className="w-full bg-bg/50 border-line text-muted cursor-not-allowed"
                  value={formData.ncmDescription || ''}
                  readOnly
                  placeholder="A descrição aparecerá automaticamente ao selecionar um NCM"
                />
              </div>

              {showNcmSearch && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-panel border border-line rounded-3xl p-8 max-w-2xl w-full shadow-2xl">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-black">Consultar NCM</h3>
                      <button onClick={() => setShowNcmSearch(false)} className="text-muted hover:text-danger">✕</button>
                    </div>
                    <div className="relative mb-6">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
                      <input 
                        type="text" 
                        placeholder="Buscar por código ou descrição..." 
                        className="w-full pl-12 pr-4 py-3 bg-bg border border-line rounded-xl"
                        value={ncmSearch}
                        onChange={e => setNcmSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                      {ncms.filter(n => n.code.includes(ncmSearch) || n.description.toLowerCase().includes(ncmSearch.toLowerCase())).map(n => (
                        <button 
                          key={n.code}
                          onClick={() => {
                            handleNCMLookup(n.code);
                            setShowNcmSearch(false);
                          }}
                          className="w-full text-left p-4 bg-bg border border-line rounded-xl hover:border-primary transition-all group"
                        >
                          <p className="text-sm font-bold group-hover:text-primary">{n.code}</p>
                          <p className="text-xs text-muted">{n.description}</p>
                          <div className="flex gap-4 mt-2">
                            <span className="text-[10px] font-bold text-success uppercase">Vida Útil: {n.fiscalYears} anos</span>
                            <span className="text-[10px] font-bold text-primary uppercase">Taxa: {n.fiscalRate}%</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-bg/50 p-6 rounded-xl border border-line space-y-6">
                  <h4 className="text-sm font-bold text-primary uppercase tracking-widest">Vida Útil Fiscal</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <InputWithClear label="Anos" value={formData.fiscalUsefulLifeYears} onChange={v => setFormData({...formData, fiscalUsefulLifeYears: parseInt(v) || 0})} onClear={() => setFormData({...formData, fiscalUsefulLifeYears: 0})} type="number" configId="fiscalUsefulLifeYears" isVisible={isVisible} />
                    <InputWithClear label="Meses" value={formData.fiscalUsefulLifeMonths} onChange={v => setFormData({...formData, fiscalUsefulLifeMonths: parseInt(v) || 0})} onClear={() => setFormData({...formData, fiscalUsefulLifeMonths: 0})} type="number" configId="fiscalUsefulLifeMonths" isVisible={isVisible} />
                    <InputWithClear label="Taxa Anual (%)" value={formData.fiscalAnnualRate} onChange={v => setFormData({...formData, fiscalAnnualRate: v})} onClear={() => setFormData({...formData, fiscalAnnualRate: 0})} type="currency" configId="fiscalAnnualRate" isVisible={isVisible} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Depr. Mensal (BRL)</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.fiscalMonthlyDepreciationBRL || 0)}</p>
                    </div>
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Depr. Anual (BRL)</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.fiscalAnnualDepreciationBRL || 0)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Depr. Mensal (USD)</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(formData.fiscalMonthlyDepreciationUSD || 0)}</p>
                    </div>
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Depr. Anual (USD)</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(formData.fiscalAnnualDepreciationUSD || 0)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-bg/50 p-6 rounded-xl border border-line space-y-6">
                  <h4 className="text-sm font-bold text-success uppercase tracking-widest">Vida Útil Contábil</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <InputWithClear label="Anos" value={formData.accountingUsefulLifeYears} onChange={v => setFormData({...formData, accountingUsefulLifeYears: parseInt(v) || 0})} onClear={() => setFormData({...formData, accountingUsefulLifeYears: 0})} type="number" configId="accountingUsefulLifeYears" isVisible={isVisible} />
                    <InputWithClear label="Meses" value={formData.accountingUsefulLifeMonths} onChange={v => setFormData({...formData, accountingUsefulLifeMonths: parseInt(v) || 0})} onClear={() => setFormData({...formData, accountingUsefulLifeMonths: 0})} type="number" configId="accountingUsefulLifeMonths" isVisible={isVisible} />
                    <InputWithClear label="Taxa Anual (%)" value={formData.accountingAnnualRate} onChange={v => setFormData({...formData, accountingAnnualRate: v})} onClear={() => setFormData({...formData, accountingAnnualRate: 0})} type="currency" configId="accountingAnnualRate" isVisible={isVisible} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Depr. Mensal (BRL)</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.accountingMonthlyDepreciationBRL || 0)}</p>
                    </div>
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Depr. Anual (BRL)</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.accountingAnnualDepreciationBRL || 0)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Depr. Mensal (USD)</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(formData.accountingMonthlyDepreciationUSD || 0)}</p>
                    </div>
                    <div className="p-3 bg-bg rounded-xl border border-line">
                      <p className="text-[10px] text-muted uppercase font-bold mb-1">Depr. Anual (USD)</p>
                      <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(formData.accountingAnnualDepreciationUSD || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Custom Fields for Vida Util */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-line">
                {fieldConfigs.filter(c => (c as any).category === 'vidautil' && isVisible(c.id) && !standardFieldIds.includes(c.id)).map(config => (
                  <InputWithClear 
                    key={config.id}
                    label={config.label} 
                    value={formData[config.id] || ''} 
                    onChange={v => setFormData({...formData, [config.id]: v})} 
                    onClear={() => setFormData({...formData, [config.id]: ''})} 
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'fornecedor' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputWithClear label="Razão Social" value={formData.supplierName || ''} onChange={v => setFormData({...formData, supplierName: v})} onClear={() => clearField('supplierName')} isVisible={isVisible} />
                <InputWithClear label="Nome Fantasia" value={formData.supplierFantasyName || ''} onChange={v => setFormData({...formData, supplierFantasyName: v})} onClear={() => setFormData({...formData, supplierFantasyName: ''})} isVisible={isVisible} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputWithClear label="CNPJ" value={formData.supplierId || ''} onChange={v => setFormData({...formData, supplierId: v})} onClear={() => clearField('supplierId')} placeholder="00.000.000/0000-00" isVisible={isVisible} />
                <InputWithClear label="CEP" value={formData.zipCode || ''} onChange={v => setFormData({...formData, zipCode: v})} onClear={() => setFormData({...formData, zipCode: ''})} isVisible={isVisible} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <InputWithClear label="Endereço" value={formData.address || ''} onChange={v => setFormData({...formData, address: v})} onClear={() => setFormData({...formData, address: ''})} isVisible={isVisible} />
                </div>
                <InputWithClear label="Número" value={formData.number || ''} onChange={v => setFormData({...formData, number: v})} onClear={() => setFormData({...formData, number: ''})} isVisible={isVisible} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <InputWithClear label="Bairro" value={formData.neighborhood || ''} onChange={v => setFormData({...formData, neighborhood: v})} onClear={() => setFormData({...formData, neighborhood: ''})} isVisible={isVisible} />
                <InputWithClear label="Cidade" value={formData.city || ''} onChange={v => setFormData({...formData, city: v})} onClear={() => setFormData({...formData, city: ''})} isVisible={isVisible} />
                <InputWithClear label="Estado" value={formData.state || ''} onChange={v => setFormData({...formData, state: v})} onClear={() => setFormData({...formData, state: ''})} isVisible={isVisible} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-line">
                <InputWithClear label="Contato" value={formData.supplierContact || ''} onChange={v => setFormData({...formData, supplierContact: v})} onClear={() => clearField('supplierContact')} isVisible={isVisible} />
                <InputWithClear label="E-mail" value={formData.supplierEmail || ''} onChange={v => setFormData({...formData, supplierEmail: v})} onClear={() => clearField('supplierEmail')} type="email" isVisible={isVisible} />
                <InputWithClear label="Telefone" value={formData.supplierPhone || ''} onChange={v => setFormData({...formData, supplierPhone: v})} onClear={() => clearField('supplierPhone')} isVisible={isVisible} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-line">
                <div className="relative group/field">
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Anexo do Fornecedor</label>
                  <div className="flex gap-2">
                    <input type="text" className="flex-1" placeholder="URL do Arquivo" value={formData.supplierAttachment} onChange={e => setFormData({...formData, supplierAttachment: e.target.value})} />
                    <div className="relative">
                      <button className="px-4 py-2 bg-line hover:bg-primary/20 text-primary rounded-xl font-bold transition-all">Upload</button>
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setFormData({...formData, supplierAttachment: URL.createObjectURL(file)});
                      }} />
                    </div>
                  </div>
                </div>
                <div className="relative group/field">
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Observações do Fornecedor</label>
                  <textarea className="w-full h-20" value={formData.supplierObservations} onChange={e => setFormData({...formData, supplierObservations: e.target.value})} />
                </div>
              </div>

              {/* Dynamic Custom Fields for Fornecedor */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-line">
                {fieldConfigs.filter(c => (c as any).category === 'fornecedor' && isVisible(c.id) && !standardFieldIds.includes(c.id)).map(config => (
                  <InputWithClear 
                    key={config.id}
                    label={config.label} 
                    value={formData[config.id] || ''} 
                    onChange={v => setFormData({...formData, [config.id]: v})} 
                    onClear={() => setFormData({...formData, [config.id]: ''})} 
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'seguros' && (
            <div className="space-y-8">
              <div className="bg-bg/50 p-8 rounded-2xl border border-line space-y-6">
                <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Dados da Seguradora</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <InputWithClear label="Código Seguradora" value={formData.insurance?.companyCode || ''} onChange={v => setFormData({...formData, insurance: {...formData.insurance!, companyCode: v}})} onClear={() => setFormData({...formData, insurance: {...formData.insurance!, companyCode: ''}})} isVisible={isVisible} />
                  <div className="md:col-span-2">
                    <InputWithClear label="Nome da Seguradora" value={formData.insurance?.companyName || ''} onChange={v => setFormData({...formData, insurance: {...formData.insurance!, companyName: v}})} onClear={() => setFormData({...formData, insurance: {...formData.insurance!, companyName: ''}})} isVisible={isVisible} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputWithClear label="Nº da Apólice" value={formData.insurance?.policyNumber || ''} onChange={v => setFormData({...formData, insurance: {...formData.insurance!, policyNumber: v}})} onClear={() => setFormData({...formData, insurance: {...formData.insurance!, policyNumber: ''}})} isVisible={isVisible} />
                  <InputWithClear label="Nº SUSEP" value={formData.insurance?.susepNumber || ''} onChange={v => setFormData({...formData, insurance: {...formData.insurance!, susepNumber: v}})} onClear={() => setFormData({...formData, insurance: {...formData.insurance!, susepNumber: ''}})} isVisible={isVisible} />
                </div>
              </div>

              <div className="bg-bg/50 p-8 rounded-2xl border border-line space-y-6">
                <h4 className="text-sm font-bold uppercase tracking-widest text-success">Vigência e Valores</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <InputWithClear label="Início Vigência" value={formData.insurance?.startDate || ''} onChange={v => setFormData({...formData, insurance: {...formData.insurance!, startDate: v}})} onClear={() => setFormData({...formData, insurance: {...formData.insurance!, startDate: ''}})} type="date" isVisible={isVisible} />
                  <InputWithClear label="Fim Vigência" value={formData.insurance?.endDate || ''} onChange={v => setFormData({...formData, insurance: {...formData.insurance!, endDate: v}})} onClear={() => setFormData({...formData, insurance: {...formData.insurance!, endDate: ''}})} type="date" isVisible={isVisible} />
                  <InputWithClear label="Valor Segurado" value={formData.insurance?.value || 0} onChange={v => setFormData({...formData, insurance: {...formData.insurance!, value: v}})} onClear={() => setFormData({...formData, insurance: {...formData.insurance!, value: 0}})} type="currency" isVisible={isVisible} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-line">
                <div className="relative group/field">
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Anexo do Seguro</label>
                  <div className="flex gap-2">
                    <input type="text" className="flex-1" placeholder="URL do Arquivo" value={formData.insurance?.attachment} onChange={e => setFormData({...formData, insurance: {...formData.insurance!, attachment: e.target.value}})} />
                    <div className="relative">
                      <button className="px-4 py-2 bg-line hover:bg-primary/20 text-primary rounded-xl font-bold transition-all">Upload</button>
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setFormData({...formData, insurance: {...formData.insurance!, attachment: URL.createObjectURL(file)}});
                      }} />
                    </div>
                  </div>
                </div>
                <div className="relative group/field">
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Observações do Seguro</label>
                  <textarea className="w-full h-20" value={formData.insurance?.observations} onChange={e => setFormData({...formData, insurance: {...formData.insurance!, observations: e.target.value}})} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'manutencao' && (
            <div className="space-y-8">
              <div className="bg-bg/50 p-8 rounded-2xl border border-line space-y-6">
                <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Controle de Manutenção</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <InputWithClear label="Programação" value={formData.maintenance?.programming || ''} onChange={v => setFormData({...formData, maintenance: {...formData.maintenance!, programming: v}})} onClear={() => setFormData({...formData, maintenance: {...formData.maintenance!, programming: ''}})} isVisible={isVisible} />
                  <InputWithClear label="Revisão" value={formData.maintenance?.review || ''} onChange={v => setFormData({...formData, maintenance: {...formData.maintenance!, review: v}})} onClear={() => setFormData({...formData, maintenance: {...formData.maintenance!, review: ''}})} isVisible={isVisible} />
                  <InputWithClear label="Calibração" value={formData.maintenance?.calibration || ''} onChange={v => setFormData({...formData, maintenance: {...formData.maintenance!, calibration: v}})} onClear={() => setFormData({...formData, maintenance: {...formData.maintenance!, calibration: ''}})} isVisible={isVisible} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputWithClear label="Última Manutenção" value={formData.maintenance?.lastMaintenanceDate || ''} onChange={v => setFormData({...formData, maintenance: {...formData.maintenance!, lastMaintenanceDate: v}})} onClear={() => setFormData({...formData, maintenance: {...formData.maintenance!, lastMaintenanceDate: ''}})} type="date" isVisible={isVisible} />
                  <InputWithClear label="Próxima Manutenção" value={formData.maintenance?.nextMaintenanceDate || ''} onChange={v => setFormData({...formData, maintenance: {...formData.maintenance!, nextMaintenanceDate: v}})} onClear={() => setFormData({...formData, maintenance: {...formData.maintenance!, nextMaintenanceDate: ''}})} type="date" isVisible={isVisible} />
                </div>
                <div className="relative group/field pt-4">
                  <label className="block text-xs font-bold text-muted mb-2 uppercase">Observações de Manutenção</label>
                  <textarea className="w-full h-24" value={formData.maintenance?.observations} onChange={e => setFormData({...formData, maintenance: {...formData.maintenance!, observations: e.target.value}})} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'leasing' && (
            <div className="space-y-8">
              <div className="bg-bg/50 p-8 rounded-2xl border border-line space-y-6">
                <h4 className="text-sm font-bold uppercase tracking-widest text-purple-500">Contrato de Leasing (IFRS 16)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputWithClear label="Número do Contrato" value={formData.leasing?.contractNumber || ''} onChange={v => setFormData({...formData, leasing: {...formData.leasing!, contractNumber: v}})} onClear={() => setFormData({...formData, leasing: {...formData.leasing!, contractNumber: ''}})} isVisible={isVisible} />
                  <InputWithClear label="Valor do Contrato" value={formData.leasing?.value || 0} onChange={v => setFormData({...formData, leasing: {...formData.leasing!, value: v}})} onClear={() => setFormData({...formData, leasing: {...formData.leasing!, value: 0}})} type="currency" isVisible={isVisible} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InputWithClear label="Início do Contrato" value={formData.leasing?.startDate || ''} onChange={v => setFormData({...formData, leasing: {...formData.leasing!, startDate: v}})} onClear={() => setFormData({...formData, leasing: {...formData.leasing!, startDate: ''}})} type="date" isVisible={isVisible} />
                  <InputWithClear label="Fim do Contrato" value={formData.leasing?.endDate || ''} onChange={v => setFormData({...formData, leasing: {...formData.leasing!, endDate: v}})} onClear={() => setFormData({...formData, leasing: {...formData.leasing!, endDate: ''}})} type="date" isVisible={isVisible} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-line">
                  <div className="relative group/field">
                    <label className="block text-xs font-bold text-muted mb-2 uppercase">Anexo do Contrato</label>
                    <div className="flex gap-2">
                      <input type="text" className="flex-1" placeholder="URL do Arquivo" value={formData.leasing?.attachment} onChange={e => setFormData({...formData, leasing: {...formData.leasing!, attachment: e.target.value}})} />
                      <div className="relative">
                        <button className="px-4 py-2 bg-line hover:bg-primary/20 text-primary rounded-xl font-bold transition-all">Upload</button>
                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) setFormData({...formData, leasing: {...formData.leasing!, attachment: URL.createObjectURL(file)}});
                        }} />
                      </div>
                    </div>
                  </div>
                  <div className="relative group/field">
                    <label className="block text-xs font-bold text-muted mb-2 uppercase">Observações do Leasing</label>
                    <textarea className="w-full h-20" value={formData.leasing?.observations} onChange={e => setFormData({...formData, leasing: {...formData.leasing!, observations: e.target.value}})} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documentos' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-widest text-primary">GBA - Gestão de Documentos</h4>
                <div className="relative">
                  <button className="px-4 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all">
                    <Plus size={14} /> Novo Documento
                  </button>
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const newDoc = {
                        id: Math.random().toString(36).substr(2, 9),
                        name: file.name,
                        type: file.type.split('/')[1].toUpperCase(),
                        uploadDate: new Date().toISOString(),
                        url: URL.createObjectURL(file)
                      };
                      setFormData({
                        ...formData,
                        documents: [...(formData.documents || []), newDoc as any]
                      });
                    }
                  }} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {formData.documents && formData.documents.length > 0 ? (
                  formData.documents.map((doc, idx) => (
                    <div key={idx} className="p-4 bg-bg/30 rounded-2xl border border-line group hover:border-primary transition-all">
                      <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-primary/10 text-primary rounded-xl">
                          <FileCheck size={24} />
                        </div>
                        <div className="flex gap-1">
                          <button className="p-2 hover:bg-line rounded-lg text-muted hover:text-primary transition-all">
                            <Download size={16} />
                          </button>
                          <button 
                            onClick={() => {
                              const newDocs = formData.documents?.filter((_, i) => i !== idx);
                              setFormData({...formData, documents: newDocs});
                            }}
                            className="p-2 hover:bg-danger/10 rounded-lg text-muted hover:text-danger transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <h5 className="font-bold text-sm truncate mb-1">{doc.name}</h5>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black bg-line px-2 py-0.5 rounded text-muted">{doc.type}</span>
                        <span className="text-[10px] text-muted">{doc.uploadDate ? new Date(doc.uploadDate).toLocaleDateString() : '-'}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-12 text-center bg-bg/20 rounded-3xl border border-dashed border-line">
                    <FileCheck size={48} className="mx-auto text-muted mb-4 opacity-20" />
                    <p className="text-muted font-bold italic">Nenhum documento anexado ao imobilizado.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'etiquetagem' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Sistema de Etiquetagem</h4>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setFormData({...formData, labelType: 'QR'})}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      formData.labelType === 'QR' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-line text-muted hover:text-primary"
                    )}
                  >
                    Gerar QR Code
                  </button>
                  <button 
                    onClick={() => setFormData({...formData, labelType: 'BARCODE'})}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      formData.labelType === 'BARCODE' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-line text-muted hover:text-primary"
                    )}
                  >
                    Gerar Cód. Barras
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="bg-bg/50 p-6 rounded-3xl border border-line space-y-6">
                  <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 flex items-start gap-4">
                    <Info className="text-primary mt-1" size={20} />
                    <p className="text-xs text-muted leading-relaxed">
                      A etiqueta é gerada automaticamente com base no <span className="font-bold text-primary">Número do Imobilizado / Subitem</span>. 
                      Você pode imprimir esta etiqueta e anexá-la fisicamente ao patrimônio para controle via mobile.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-muted uppercase">Conteúdo da Etiqueta</label>
                    <div className="p-4 bg-bg rounded-xl border border-line text-sm font-mono font-bold text-primary">
                      {formData.id}/{formData.sub}
                    </div>
                  </div>

                  <button className="w-full py-3 bg-line hover:bg-primary/20 text-primary rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                    <Download size={18} /> Baixar Etiqueta em Alta Resolução
                  </button>
                </div>

                <div className="flex flex-col items-center">
                  <label className="block text-xs font-bold text-muted mb-4 uppercase">Pré-visualização da Etiqueta</label>
                  <div className="p-2 border-4 border-dashed border-line rounded-3xl">
                    <AssetLabel 
                      asset={{
                        ...formData,
                        id: formData.id || 'AG-000',
                        sub: formData.sub || 0,
                        name: formData.name || 'NOME DO ATIVO',
                        companyName: companies.find(c => c.id === formData.companyId)?.name || 'EMPRESA EXAMPLO',
                        branchName: branches.find(b => b.id === formData.branchId)?.name || 'FILIAL EXAMPLO'
                      } as Asset} 
                      type={formData.labelType || 'QR'} 
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'historico' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Histórico de Alterações</h4>
                <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                  <FileText size={14} /> Exportar Log
                </button>
              </div>
              <div className="space-y-4">
                {formData.history && formData.history.length > 0 ? (
                  formData.history.map((item, idx) => (
                    <div key={idx} className="p-4 bg-bg/30 rounded-xl border border-line flex items-start gap-4">
                      <div className="p-2 bg-primary/10 text-primary rounded-lg">
                        <History size={16} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold uppercase">{item.type}</span>
                          <span className="text-[10px] text-muted">{new Date(item.date).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="text-sm text-muted">{item.description}</p>
                        <span className="text-[10px] font-bold text-primary mt-2 block">USUÁRIO: {item.user}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 bg-bg/20 rounded-2xl border border-dashed border-line">
                    <History size={48} className="mx-auto text-muted mb-4 opacity-20" />
                    <p className="text-muted font-bold">Nenhum histórico registrado para este ativo.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CompaniesManagementView({ companies, onAdd, onUpdate, onDelete }: { companies: Company[], onAdd: (c: any) => void, onUpdate: (id: string, c: any) => void, onDelete: (id: string) => void }) {
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', cnpj: '', email: '', phone: '', address: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'add') {
      onAdd(formData);
    } else if (modalMode === 'edit' && editingId) {
      onUpdate(editingId, formData);
    }
    setFormData({ name: '', cnpj: '', email: '', phone: '', address: '' });
    setModalMode(null);
    setEditingId(null);
  };

  const handleEdit = (company: Company) => {
    setFormData({
      name: company.name,
      cnpj: company.cnpj,
      email: company.email || '',
      phone: company.phone || '',
      address: company.address || ''
    });
    setEditingId(company.id);
    setModalMode('edit');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight">Gestão de Empresas</h2>
          <p className="text-sm text-muted">Controle de clientes e filiais integradas ao ecossistema.</p>
        </div>
        <button 
          onClick={() => { setFormData({ name: '', cnpj: '', email: '', phone: '', address: '' }); setModalMode('add'); }}
          className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary/80 transition-all shadow-lg shadow-primary/20"
        >
          <Plus size={20} /> Nova Empresa
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map(company => (
          <div key={company.id} className="bg-panel border border-line rounded-[32px] p-6 hover:border-primary/50 transition-all group overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-all flex gap-2">
              <button 
                onClick={() => handleEdit(company)}
                className="p-2 text-muted hover:text-primary bg-bg/50 rounded-lg"
              >
                <Settings size={16} />
              </button>
              <button 
                onClick={() => onDelete(company.id)}
                className="p-2 text-muted hover:text-danger bg-bg/50 rounded-lg"
              >
                <Trash2 size={16} />
              </button>
            </div>
            
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 bg-bg border border-line rounded-2xl flex items-center justify-center shrink-0">
                {company.logo ? (
                  <img src={company.logo} alt="" className="w-12 h-12 object-contain" />
                ) : (
                  <Building2 size={32} className="text-muted/20" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight mb-1">{company.name}</h3>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">{company.cnpj}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs text-muted">
                <Mail size={14} className="text-primary" />
                <span className="truncate">{company.email || 'Não informado'}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted">
                <Phone size={14} className="text-primary" />
                <span>{company.phone || 'Não informado'}</span>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-line flex items-center justify-between">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-panel bg-bg flex items-center justify-center text-[8px] font-bold">
                    U{i}
                  </div>
                ))}
              </div>
              <button className="text-[10px] font-bold text-primary hover:underline uppercase tracking-widest flex items-center gap-1">
                Acessar Painel <ExternalLink size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {modalMode && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-panel border border-line rounded-[32px] p-8 w-full max-w-lg shadow-2xl"
            >
              <h3 className="text-xl font-black uppercase tracking-tight mb-6">
                {modalMode === 'add' ? 'Cadastrar Nova Empresa' : 'Editar Empresa'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-muted uppercase ml-2 mb-1 block">Razão Social / Nome</label>
                    <input 
                      type="text" 
                      required
                      className="w-full"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase ml-2 mb-1 block">CNPJ</label>
                    <input 
                      type="text" 
                      required
                      className="w-full"
                      value={formData.cnpj}
                      onChange={e => setFormData({...formData, cnpj: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase ml-2 mb-1 block">Telefone</label>
                    <input 
                      type="text" 
                      className="w-full"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-muted uppercase ml-2 mb-1 block">E-mail de Contato</label>
                    <input 
                      type="email" 
                      className="w-full"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-muted uppercase ml-2 mb-1 block">Endereço Completo</label>
                    <input 
                      type="text" 
                      className="w-full"
                      value={formData.address}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-8">
                  <button type="button" onClick={() => setModalMode(null)} className="flex-1 py-3 bg-line rounded-xl font-bold">CANCELAR</button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20">
                    {modalMode === 'add' ? 'CADASTRAR' : 'SALVAR ALTERAÇÕES'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function UsersManagementView({ users, companies, onAddUser, onUpdateRole, onUpdateCompany, onDeleteUser }: { 
  users: User[], 
  companies: Company[], 
  onAddUser: (user: Partial<User>) => void,
  onUpdateRole: (uid: string, role: string) => void,
  onUpdateCompany: (uid: string, companyId: string) => void,
  onDeleteUser: (uid: string) => void
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'USUARIO' as UserRole, companyId: 'ALL' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddUser(newUser);
    setNewUser({ name: '', email: '', role: 'USUARIO' as UserRole, companyId: 'ALL' });
    setIsAdding(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight">Gestão de Usuários</h2>
          <p className="text-sm text-muted">Controle de acessos, permissões e perfis cadastrados no sistema.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl text-primary flex items-center gap-2">
            <Users size={18} />
            <span className="font-bold text-sm tracking-widest">{users.length} ATIVOS</span>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary/80 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={20} /> Novo Usuário
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-3 space-y-4">
          <div className="bg-panel border border-line rounded-3xl overflow-hidden shadow-xl">
            <table className="w-full text-left">
              <thead className="bg-bg/50 border-b border-line">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">Usuário</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">Empresa Vinculada</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">Nível de Acesso</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-white/5 transition-all">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img src={u.avatar} alt="" className="w-10 h-10 rounded-xl border border-line" />
                        <div>
                          <p className="text-sm font-bold">{u.name}</p>
                          <p className="text-[10px] text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select 
                        value={u.companyId || 'ALL'}
                        onChange={(e) => onUpdateCompany(u.id, e.target.value)}
                        className="bg-bg/50 border border-line rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary focus:border-primary transition-all w-full max-w-[200px]"
                      >
                        <option value="ALL">Todas as Empresas</option>
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <select 
                        value={u.role}
                        onChange={(e) => onUpdateRole(u.id, e.target.value)}
                        className="bg-bg/50 border border-line rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary focus:border-primary transition-all"
                      >
                        <option value="ADMINISTRADOR">Administrador</option>
                        <option value="GESTOR">Gestor</option>
                        <option value="ANALISTA">Analista</option>
                        <option value="USUARIO">Usuário</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => { if(confirm(`Excluir usuário ${u.name}?`)) onDeleteUser(u.id); }}
                        className="p-2 text-muted hover:text-danger transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-panel border border-line rounded-[32px] p-8 w-full max-w-lg shadow-2xl"
            >
              <h3 className="text-xl font-black uppercase tracking-tight mb-6">Cadastrar Usuário</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-muted uppercase ml-2 mb-1 block">Nome Completo</label>
                  <input 
                    type="text" 
                    required
                    className="w-full"
                    value={newUser.name}
                    onChange={e => setNewUser({...newUser, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted uppercase ml-2 mb-1 block">E-mail</label>
                  <input 
                    type="email" 
                    required
                    className="w-full"
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                    placeholder="email@dominio.com"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase ml-2 mb-1 block">Nível de Acesso</label>
                    <select 
                      className="w-full"
                      value={newUser.role}
                      onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                    >
                      <option value="ADMINISTRADOR">Administrador</option>
                      <option value="GESTOR">Gestor</option>
                      <option value="ANALISTA">Analista</option>
                      <option value="USUARIO">Usuário</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase ml-2 mb-1 block">Empresa</label>
                    <select 
                      className="w-full"
                      value={newUser.companyId}
                      onChange={e => setNewUser({...newUser, companyId: e.target.value})}
                    >
                      <option value="ALL">Todas</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                  <p className="text-[10px] text-primary italic leading-tight">
                    * Após o cadastro, o usuário poderá acessar o sistema utilizando este e-mail através do Login com Google ou criando sua senha no primeiro acesso.
                  </p>
                </div>
                <div className="flex gap-3 mt-8">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-line rounded-xl font-bold">CANCELAR</button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20">CADASTRAR</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<'portal' | 'asset' | 'accounting' | 'app'>('portal');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#asset') setCurrentPage('asset');
      else if (hash === '#accounting') setCurrentPage('accounting');
      else if (hash === '#assetsystem' || hash === '#app') setCurrentPage('app');
      else if (hash === '#portal' || !hash) setCurrentPage('portal');
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handlePageChange = (page: 'portal' | 'asset' | 'accounting' | 'app') => {
    setCurrentPage(page);
    const hash = page === 'app' ? '#assetsystem' : `#${page}`;
    window.history.pushState(null, '', hash);
  };

  return (
    <div className="min-h-screen">
      {currentPage === 'portal' && (
        <Portal 
          onSelectAsset={() => handlePageChange('asset')} 
          onSelectAccounting={() => handlePageChange('accounting')} 
          onEnterSystem={() => handlePageChange('app')}
        />
      )}
      {currentPage === 'asset' && (
        <LandingPage 
          onEnterSystem={() => handlePageChange('app')} 
          onSelectAccounting={() => handlePageChange('accounting')}
          onSelectPortal={() => handlePageChange('portal')}
        />
      )}
      {currentPage === 'accounting' && (
        <AccountingLanding 
          onBack={() => handlePageChange('portal')} 
          onEnterSystem={() => handlePageChange('app')} 
          onSelectAsset={() => handlePageChange('asset')}
          onSelectPortal={() => handlePageChange('portal')}
        />
      )}
      {currentPage === 'app' && (
        <InternalApp onGoBack={() => handlePageChange('portal')} />
      )}
    </div>
  );
}
