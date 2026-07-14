import React from 'react';
import { UserAddress } from '../../types/address';
import { MapPin, Phone, User, Check, Edit, Trash2 } from 'lucide-react';

interface AddressCardProps {
  address: UserAddress;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const AddressCard: React.FC<AddressCardProps> = ({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  isSelectionMode = false,
  isSelected = false,
  onSelect
}) => {
  return (
    <div
      onClick={isSelectionMode && onSelect ? onSelect : undefined}
      className={`bg-white p-5 rounded-2xl border transition-all ${
        isSelectionMode && onSelect ? 'cursor-pointer' : ''
      } ${
        isSelected
          ? 'border-[#E94F2F] ring-1 ring-[#E94F2F]'
          : 'border-[#EADFD8] hover:border-[#E94F2F]/30 shadow-xs'
      } flex flex-col justify-between gap-4`}
    >
      <div className="space-y-3">
        {/* Label and Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#F7F4EF] text-[#5C534E] border border-[#EADFD8]">
              {address.label}
            </span>
            {address.isDefault && (
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                Padrão
              </span>
            )}
          </div>

          {isSelectionMode && (
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
              isSelected ? 'bg-[#E94F2F] border-[#E94F2F] text-white' : 'border-[#EADFD8] bg-white'
            }`}>
              {isSelected && <Check className="w-3 h-3 stroke-[3px]" />}
            </div>
          )}
        </div>

        {/* Address Body */}
        <div className="space-y-1.5 text-xs text-[#5C534E] font-semibold">
          <p className="text-sm font-black text-[#201A17] flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-[#E94F2F] shrink-0" />
            <span>
              {address.street}, {address.number}
              {address.complement && ` - ${address.complement}`}
            </span>
          </p>
          <p className="pl-5.5 text-gray-500 font-semibold">
            {address.neighborhood} • {address.cityName} - {address.state}
          </p>
          {address.reference && (
            <p className="pl-5.5 text-[11px] text-gray-400 italic">
              Ref: {address.reference}
            </p>
          )}
          <p className="pl-5.5 text-[11px] text-gray-400">
            CEP: {address.zipCode}
          </p>

          <div className="h-px bg-[#F7F4EF] my-2" />

          {/* Recipient Details */}
          <div className="space-y-1 text-[11px] text-[#756B66]">
            <p className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400" />
              <span>Entregar para: <strong className="text-[#201A17] font-black">{address.recipientName}</strong></span>
            </p>
            <p className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-400" />
              <span>Contato: <strong className="text-[#201A17] font-bold">{address.phone}</strong></span>
            </p>
          </div>
        </div>
      </div>

      {/* Actions (if not in selection mode or optionally inside) */}
      {!isSelectionMode && (
        <div className="flex items-center justify-between gap-2 border-t border-[#F7F4EF] pt-3">
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 rounded-lg border border-[#EADFD8] text-[#5C534E] hover:bg-[#F7F4EF] hover:text-[#201A17] transition-all cursor-pointer"
              title="Editar Endereço"
            >
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded-lg border border-rose-200 text-rose-600 bg-rose-50/20 hover:bg-rose-50 hover:text-rose-700 transition-all cursor-pointer"
              title="Excluir Endereço"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {!address.isDefault && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetDefault();
              }}
              className="text-[10px] font-black uppercase text-[#E94F2F] hover:text-[#BD351C] transition-all bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-lg border border-orange-200/50 cursor-pointer"
            >
              Tornar Padrão
            </button>
          )}
        </div>
      )}
    </div>
  );
};
