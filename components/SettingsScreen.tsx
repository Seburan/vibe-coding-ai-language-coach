import React, { useState } from 'react';
import { UserSettings } from '../types';
import { LANGUAGES, SKILL_LEVELS } from '../constants';
import { saveSettings } from '../services/localStorageService';

interface SettingsScreenProps {
  onSave: (settings: UserSettings) => void;
  currentSettings: UserSettings | null;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onSave, currentSettings }) => {
  const [nativeLanguage, setNativeLanguage] = useState(currentSettings?.nativeLanguage || LANGUAGES[0]);
  const [targetLanguage, setTargetLanguage] = useState(currentSettings?.targetLanguage || LANGUAGES[1]);
  const [skillLevel, setSkillLevel] = useState(currentSettings?.skillLevel || SKILL_LEVELS[0]);

  const handleSave = () => {
    const newSettings: UserSettings = { nativeLanguage, targetLanguage, skillLevel };
    saveSettings(newSettings);
    onSave(newSettings);
  };

  const SelectInput: React.FC<{label: string, value: string, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void, options: string[]}> = ({ label, value, onChange, options }) => (
    <div className="mb-6">
      <label className="block text-gray-300 text-sm font-bold mb-2">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="block w-full bg-gray-700 border border-gray-600 text-white py-3 px-4 rounded-lg focus:outline-none focus:bg-gray-600 focus:border-cyan-500"
      >
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );

  return (
    <div className="p-8 bg-gray-800 rounded-2xl shadow-2xl max-w-md mx-auto">
      <h2 className="text-3xl font-bold text-center text-cyan-400 mb-8">Settings</h2>
      
      <SelectInput 
        label="Your Native Language"
        value={nativeLanguage}
        onChange={(e) => setNativeLanguage(e.target.value)}
        options={LANGUAGES}
      />
      
      <SelectInput 
        label="Language to Learn"
        value={targetLanguage}
        onChange={(e) => setTargetLanguage(e.target.value)}
        options={LANGUAGES}
      />

      <SelectInput 
        label="Your Skill Level"
        value={skillLevel}
        onChange={(e) => setSkillLevel(e.target.value)}
        options={SKILL_LEVELS}
      />

      <button
        onClick={handleSave}
        className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-full text-lg transition-transform transform hover:scale-105 mt-4"
      >
        Save and Continue
      </button>
    </div>
  );
};

export default SettingsScreen;
