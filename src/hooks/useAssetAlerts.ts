import { useState, useEffect } from 'react';
import { Asset } from '../types';

export interface Alert {
  id: string;
  type: 'INSURANCE' | 'MAINTENANCE' | 'MOVEMENT';
  title: string;
  description: string;
  severity: 'INFO' | 'WARNING' | 'DANGER';
  date: string;
  assetId: string;
  read: boolean;
}

export function useAssetAlerts(assets: Asset[]) {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const newAlerts: Alert[] = [];
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    assets.forEach(asset => {
      // Insurance Alerts
      if (asset.insurance?.endDate) {
        const endDate = new Date(asset.insurance.endDate);
        if (endDate < today) {
          newAlerts.push({
            id: `ins-overdue-${asset.id}`,
            type: 'INSURANCE',
            title: 'Seguro Vencido',
            description: `A apólice do ativo ${asset.name} (${asset.id}) venceu em ${endDate.toLocaleDateString('pt-BR')}.`,
            severity: 'DANGER',
            date: asset.insurance.endDate,
            assetId: asset.id,
            read: false
          });
        } else if (endDate < thirtyDaysFromNow) {
          newAlerts.push({
            id: `ins-soon-${asset.id}`,
            type: 'INSURANCE',
            title: 'Vencimento de Seguro',
            description: `A apólice do ativo ${asset.name} (${asset.id}) vence em ${endDate.toLocaleDateString('pt-BR')}.`,
            severity: 'WARNING',
            date: asset.insurance.endDate,
            assetId: asset.id,
            read: false
          });
        }
      }

      // Maintenance Alerts
      if (asset.maintenance?.nextMaintenanceDate) {
        const nextDate = new Date(asset.maintenance.nextMaintenanceDate);
        if (nextDate < today) {
          newAlerts.push({
            id: `maint-overdue-${asset.id}`,
            type: 'MAINTENANCE',
            title: 'Manutenção Atrasada',
            description: `A manutenção do ativo ${asset.name} (${asset.id}) está atrasada desde ${nextDate.toLocaleDateString('pt-BR')}.`,
            severity: 'DANGER',
            date: asset.maintenance.nextMaintenanceDate,
            assetId: asset.id,
            read: false
          });
        } else if (nextDate < thirtyDaysFromNow) {
          newAlerts.push({
            id: `maint-soon-${asset.id}`,
            type: 'MAINTENANCE',
            title: 'Próxima Manutenção',
            description: `Agendada manutenção para o ativo ${asset.name} (${asset.id}) em ${nextDate.toLocaleDateString('pt-BR')}.`,
            severity: 'INFO',
            date: asset.maintenance.nextMaintenanceDate,
            assetId: asset.id,
            read: false
          });
        }
      }
    });

    setAlerts(newAlerts);
  }, [assets]);

  const markAsRead = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  const deleteAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return {
    alerts,
    unreadCount: alerts.filter(a => !a.read).length,
    markAsRead,
    deleteAlert
  };
}
