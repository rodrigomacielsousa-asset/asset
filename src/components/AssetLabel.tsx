import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import { Asset } from '../types';

interface AssetLabelProps {
  asset: Asset;
  type?: 'QR' | 'BARCODE';
  size?: number;
}

export const AssetLabel: React.FC<AssetLabelProps> = ({ asset, type = 'QR', size = 128 }) => {
  const value = `${asset.id}/${asset.sub}`;
  
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl shadow-sm border border-line h-full min-h-[200px]">
      <div className="mb-4 text-center">
        <p className="text-[10px] font-black text-black uppercase tracking-widest leading-tight">{asset.companyName}</p>
        <p className="text-[8px] font-bold text-gray-500 uppercase">{asset.branchName}</p>
      </div>
      
      <div className="bg-white p-2 rounded-lg">
        {type === 'QR' ? (
          <QRCodeSVG 
            value={value} 
            size={size} 
            level="H"
            includeMargin={true}
          />
        ) : (
          <Barcode 
            value={value} 
            width={1.5} 
            height={40} 
            fontSize={12}
            background="#FFFFFF"
          />
        )}
      </div>
      
      <div className="mt-4 text-center">
        <p className="text-xs font-black text-black">{value}</p>
        <p className="text-[9px] font-bold text-gray-600 truncate max-w-[150px]">{asset.name}</p>
      </div>
    </div>
  );
};
