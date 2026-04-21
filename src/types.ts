export type UserRole = 'ADMINISTRADOR' | 'GESTOR' | 'ANALISTA' | 'USUARIO';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  companyId?: string;
  branchId?: string;
  costCenterId?: string;
}

export interface Company {
  id: string;
  name: string;
  cnpj: string;
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  cnpj: string;
}

export interface AccountingAccount {
  id: string;
  code: string;
  description: string;
}

export interface AssetClass {
  id: string;
  code: string;
  description: string;
}

export interface CostCenter {
  id: string;
  code: string;
  description: string;
}

export interface NCM {
  id: string;
  code: string;
  description: string;
  fiscalYears: number;
  fiscalRate: number;
}

export interface AssetHistory {
  id: string;
  date: string;
  type: 'CRIACAO' | 'EDICAO' | 'TRANSFERENCIA' | 'BAIXA' | 'APROVACAO';
  user: string;
  description: string;
  previousValue?: string;
  newValue?: string;
  details?: any;
}

export interface Supplier {
  id: string;
  name: string;
  fantasyName?: string;
  cnpj: string;
  address?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  contact?: string;
  email?: string;
  phone?: string;
  observations?: string;
  attachment?: string;
}

export interface FieldConfig {
  id: string;
  label: string;
  visible: boolean;
  collectorVisible?: boolean;
}

export interface Asset {
  id: string;
  sub: number;
  name: string;
  description?: string;
  complement?: string;
  brand?: string;
  model?: string;
  origin?: string;
  serialNumber?: string;
  chassis?: string;
  engine?: string;
  rpm?: string;
  dimensions?: string;
  tag?: string;
  equipmentNumber?: string;
  unit?: string;
  capacity?: string;
  color?: string;
  licensePlate?: string;
  photo?: string;
  photo2?: string;
  labelType?: 'QR' | 'BARCODE';
  isNew: boolean;
  
  // Empresa e Filial
  companyId?: string;
  companyName?: string;
  branchId?: string;
  branchName?: string;
  
  // Financeiro
  acquisitionDate: string;
  incorporationDate: string;
  acquisitionValueBRL: number;
  residualValueBRL: number;
  residualPercentageBRL: number;
  acquisitionValueUSD: number;
  residualValueUSD: number;
  residualPercentageUSD: number;
  deactivationDate?: string;
  
  // Localização
  accountCode: string;
  accountDescription: string;
  previousAccount?: string;
  classCode: string;
  classDescription: string;
  previousClass?: string;
  costCenterCode: string;
  costCenterDescription: string;
  previousCostCenter?: string;
  location: string;
  room?: string;
  environment?: string;
  responsible: string;
  collaborator?: string;
  condition: 'NOVO' | 'BOM' | 'REGULAR' | 'RUIM' | 'EXCELENTE';
  observations?: string;
  
  // Fiscal
  nfe?: string;
  nfeKey?: string;
  nfeAttachment?: string;
  incentives: {
    incentivosCreditos?: boolean;
    ciap: boolean;
    depIncentivada: boolean;
    depCSLL: boolean;
    depAcelerada: boolean;
    recap: boolean;
    creditoImediato: boolean;
    drawback?: boolean;
    sudamSudene?: boolean;
    zfm?: boolean;
    repes?: boolean;
    others: boolean;
  };
  incentiveValues?: Record<string, number>;
  
  // Vida Útil
  ncm?: string;
  ncmDescription?: string;
  nlc?: string; // Financial useful life
  
  fiscalUsefulLifeYears: number;
  fiscalUsefulLifeMonths: number;
  fiscalAnnualRate: number;
  
  accountingUsefulLifeYears: number;
  accountingUsefulLifeMonths: number;
  accountingAnnualRate: number;
  
  // Depreciação
  fiscalMonthlyDepreciationBRL?: number;
  fiscalAnnualDepreciationBRL?: number;
  fiscalMonthlyDepreciationUSD?: number;
  fiscalAnnualDepreciationUSD?: number;
  
  accountingMonthlyDepreciationBRL?: number;
  accountingAnnualDepreciationBRL?: number;
  accountingMonthlyDepreciationUSD?: number;
  accountingAnnualDepreciationUSD?: number;
  
  // Fornecedor
  supplierId?: string;
  supplierName?: string;
  supplierFantasyName?: string;
  supplierContact?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  supplierAttachment?: string;
  supplierObservations?: string;
  
  // Seguro
  insurance?: {
    companyCode?: string;
    companyName?: string;
    company?: string; // Flexible for mock data
    policyNumber: string;
    susepNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    contact?: string;
    email?: string;
    phone?: string;
    startDate: string;
    endDate: string;
    value: number;
    attachment?: string;
    observations?: string;
  };

  // Manutenção
  maintenance?: {
    programming?: string;
    review?: string;
    calibration?: string;
    lastMaintenanceDate?: string;
    nextMaintenanceDate?: string;
    observations?: string;
    history?: any[];
  };

  // Leasing (IFRS 16)
  leasing?: {
    contractNumber: string;
    startDate: string;
    endDate: string;
    value: number;
    attachment?: string;
    observations?: string;
  };

  items_description?: string;
  
  // Status
  status: 'ATIVO' | 'TRANSFERIDO' | 'BAIXADO' | 'EM_VALIDACAO' | 'EM_EXCLUSAO' | 'EM_ALTERACAO';
  
  history: AssetHistory[];
  documents?: {
    id: string;
    type: 'NF' | 'CONTRATO' | 'CERTIFICADO' | 'OUTROS';
    name: string;
    date: string;
    uploadDate?: string;
    url: string;
  }[];
  [key: string]: any;
}

export interface Movement {
  id: string;
  number: string;
  type: 'TRANSFERENCIA' | 'COMODATO' | 'EMPRESTIMO' | 'CONSERTO' | 'ALTERACAO' | 'OUTROS';
  status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'EXECUTADO';
  requestDate: string;
  requesterId: string;
  requesterName: string;
  observations?: string;
  
  isThirdParty: boolean;
  
  origin: {
    company: string;
    branch: string;
    responsible: string;
    exitDate?: string;
    uploadDate?: string;
  };
  
  destination: {
    company: string;
    branch: string;
    responsible: string;
    arrivalDate?: string;
    receptionDate?: string;
  };
  
  thirdParty?: {
    name: string;
    cnpj: string;
  };
  
  items: {
    assetId: string;
    assetSub: number;
    assetName: string;
    currentCostCenter: string;
    bookValue: number;
    acquisitionValueBRL: number;
    acquisitionValueUSD: number;
  }[];
  
  photo?: string;
  approverId?: string;
  approvalDate?: string;
  details?: any;
}

export interface BaixaRequest {
  id: string;
  assetId: string;
  assetSub: number;
  assetName: string;
  assetCostCenter?: string;
  acquisitionValueBRL: number;
  acquisitionValueUSD: number;
  reason: string;
  date: string;
  photo?: string;
  attachment?: string;
  status: 'PENDENTE' | 'APROVADO' | 'REJEITADO';
  requesterId: string;
  requesterName: string;
  approverId?: string;
  approvalDate?: string;
  observations?: string;
  
  // Venda/Doação
  clientCode?: string;
  clientCnpj?: string;
  clientName?: string;
  value?: number;
}

export interface InventorySession {
  id: string;
  date: string;
  deadline: string;
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  executorId: string;
  executorName: string;
  status: 'PLANEJADO' | 'EM ANDAMENTO' | 'CONCLUÍDO' | 'CANCELADO';
  accuracy?: number;
  totalItems?: number;
  found?: number;
  missing?: number;
  surplus?: number;
  retired?: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  entity: 'ASSET' | 'MOVEMENT' | 'BAIXA' | 'COMPANY' | 'USER' | 'SYSTEM';
  entityId?: string;
  details: string;
  previousData?: any;
  newData?: any;
  ip?: string;
}
