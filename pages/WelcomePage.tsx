
import React from 'react';
import { STRINGS } from '../constants';

interface WelcomePageProps {
  onGetStarted: () => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onGetStarted }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-200 p-4 text-center overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-slate-900 via-sky-900/50 to-slate-900 animate-gradient-bg" style={{ backgroundSize: '200% 200%' }}></div>
        
        <div className="relative z-10 flex flex-col items-center">
            <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
                <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-sky-500">
                    {STRINGS.welcomeTitle}
                </h1>
            </div>
            <div className="animate-fade-in" style={{ animationDelay: '0.7s' }}>
                <p className="mt-4 text-xl md:text-3xl text-sky-400 tracking-wider font-bold italic">
                    {STRINGS.welcomeSubtitle}
                </p>
            </div>

            <div className="animate-fade-in mt-12" style={{ animationDelay: '1.2s' }}>
                <button
                    onClick={onGetStarted}
                    className="bg-sky-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-sky-500 transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-sky-500/50 shadow-lg shadow-sky-600/30"
                >
                    {STRINGS.getStarted}
                </button>
            </div>
        </div>
    </div>
  );
};

export default WelcomePage;
