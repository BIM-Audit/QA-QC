
import React from 'react';

interface CheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const Checkbox: React.FC<CheckboxProps> = ({ id, label, checked, onChange }) => {
  return (
    <div className="flex items-center">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 text-sky-500 bg-slate-700 border-slate-500 rounded focus:ring-sky-600 ring-offset-slate-800 focus:ring-2 cursor-pointer"
      />
      <label htmlFor={id} className="ml-2 text-sm font-medium text-slate-300 cursor-pointer">
        {label}
      </label>
    </div>
  );
};

export default Checkbox;
