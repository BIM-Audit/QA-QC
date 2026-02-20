
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ResultDisplayProps {
  title: string;
  content: string | null;
  children?: React.ReactNode;
}

const ResultDisplay: React.FC<ResultDisplayProps> = ({ title, content, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (content) {
      // Use a timeout to allow the component to mount before animating
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [content]);

  if (!content) return null;

  return (
    <div className={`mt-8 w-full transition-all duration-700 ease-out transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
      <div className="bg-slate-800 shadow-lg rounded-xl overflow-hidden border border-slate-700">
        <div className="p-4 sm:p-6 bg-slate-800/50 border-b border-slate-700">
          <h3 className="text-lg font-bold text-slate-100">{title}</h3>
          {children}
        </div>
        <div className="p-4 sm:p-6 prose prose-invert prose-slate max-w-none prose-headings:text-sky-400 prose-a:text-sky-400 prose-code:bg-slate-700 prose-code:p-1 prose-code:rounded">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default ResultDisplay;
