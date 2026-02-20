
import React from 'react';

interface LoaderProps {
  text: string;
}

const Loader: React.FC<LoaderProps> = ({ text }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-4">
       <div className="flex items-center justify-center space-x-2">
            <div className="w-3 h-3 bg-sky-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
            <div className="w-3 h-3 bg-sky-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
            <div className="w-3 h-3 bg-sky-400 rounded-full animate-pulse"></div>
        </div>
      <p className="text-slate-300 text-lg font-medium">{text}</p>
    </div>
  );
};

export default Loader;
