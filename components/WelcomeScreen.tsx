import React from 'react';
import { SettingsIcon, PlayIcon } from './Icons';

interface WelcomeScreenProps {
  onStart: () => void;
  onSettings: () => void;
  hasSettings: boolean;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart, onSettings, hasSettings }) => {
  return (
    <div className="text-center p-8 bg-gray-800 rounded-2xl shadow-2xl">
      <h1 className="text-5xl font-bold text-cyan-400 mb-4">AI Language Coach</h1>
      <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
        Practice speaking a new language with your personal AI tutor. Get real-time feedback and build your confidence.
      </p>
      <div className="flex justify-center items-center space-x-4">
        <button
          onClick={onStart}
          className="flex items-center justify-center bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-8 rounded-full text-lg transition-transform transform hover:scale-105"
        >
          <PlayIcon className="w-6 h-6 mr-2"/>
          {hasSettings ? 'Start New Session' : 'Get Started'}
        </button>
        <button
          onClick={onSettings}
          className="flex items-center justify-center bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-full text-lg transition-transform transform hover:scale-105"
        >
          <SettingsIcon className="w-6 h-6 mr-2" />
          Settings
        </button>
      </div>
    </div>
  );
};

export default WelcomeScreen;
