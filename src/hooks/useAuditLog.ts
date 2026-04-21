import { useState, useCallback } from 'react';
import { AuditLog, User } from '../types';

export function useAuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([
    {
      id: 'L-001',
      timestamp: '2026-04-10T10:00:00Z',
      userId: '1',
      userName: 'Rodrigo Maciel',
      action: 'LOGIN',
      entity: 'SYSTEM',
      details: 'Usuário realizou login no sistema.'
    },
    {
      id: 'L-002',
      timestamp: '2026-04-12T14:20:00Z',
      userId: '1',
      userName: 'Rodrigo Maciel',
      action: 'CRIACAO',
      entity: 'ASSET',
      entityId: '124',
      details: 'Cadastro inicial do Veículo Utilitário Fiorino.'
    },
    {
      id: 'L-003',
      timestamp: '2026-04-15T09:15:00Z',
      userId: '2',
      userName: 'Ana Supervisor',
      action: 'APROVACAO',
      entity: 'MOVEMENT',
      entityId: 'MV-001',
      details: 'Aprovação de transferência de servidor para Filial RJ.'
    },
    {
      id: 'L-004',
      timestamp: '2026-04-17T08:45:00Z',
      userId: 'system',
      userName: 'Sistema',
      action: 'BACKUP',
      entity: 'SYSTEM',
      details: 'Backup automático do banco de dados realizado com sucesso.'
    },
    {
      id: 'L-005',
      timestamp: '2026-04-17T11:15:00Z',
      userId: '1',
      userName: 'Rodrigo Maciel',
      action: 'CONSULTA',
      entity: 'ASSET',
      entityId: '121',
      details: 'Consulta detalhada do Servidor PowerEdge para auditoria preventiva.'
    }
  ]);

  const addLog = useCallback((userId: string, userName: string, action: string, entity: AuditLog['entity'], entityId?: string, details: string = '', previousData?: any, newData?: any) => {
    const newLog: AuditLog = {
      id: `L-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      userId,
      userName,
      action,
      entity,
      entityId,
      details,
      previousData,
      newData
    };
    setLogs(prev => [...prev, newLog]);
  }, []);

  return { logs, addLog };
}
