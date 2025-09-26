import React, { useState, useEffect } from 'react';
import WelcomeScreen from './components/WelcomeScreen';
import SettingsScreen from './components/SettingsScreen';
import LiveSessionScreen from './components/LiveSessionScreen';
import { UserSettings, ChatMessage } from './types';
import { getSettings, getHistory, saveHistory } from './services/localStorageService';

type Screen = 'welcome' | 'settings' | 'session';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('welcome');
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const settings = getSettings();
    const history = getHistory();
    if (settings) {
      setUserSettings(settings);
    }
    setConversationHistory(history);
  }, []);

  const handleStartSession = () => {
    if (userSettings) {
      setCurrentScreen('session');
    } else {
      setCurrentScreen('settings');
    }
  };

  const handleShowSettings = () => {
    setCurrentScreen('settings');
  };

  const handleSettingsSaved = (settings: UserSettings) => {
    setUserSettings(settings);
    setCurrentScreen('welcome');
  };
  
  const handleSessionEnd = (finalHistory: ChatMessage[]) => {
    saveHistory(finalHistory);
    setConversationHistory(finalHistory);
    setCurrentScreen('welcome');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'settings':
        return <SettingsScreen onSave={handleSettingsSaved} currentSettings={userSettings} />;
      case 'session':
        return userSettings ? (
          <LiveSessionScreen 
            userSettings={userSettings} 
            history={conversationHistory}
            onSessionEnd={handleSessionEnd}
          />
        ) : <WelcomeScreen onStart={handleStartSession} onSettings={handleShowSettings} hasSettings={!!userSettings} />;
      case 'welcome':
      default:
        return <WelcomeScreen onStart={handleStartSession} onSettings={handleShowSettings} hasSettings={!!userSettings} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-4xl mx-auto">
        {renderScreen()}
      </div>
    </div>
  );
};

export default App;
