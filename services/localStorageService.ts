import { UserSettings, ChatMessage } from '../types';
import { LOCAL_STORAGE_SETTINGS_KEY, LOCAL_STORAGE_HISTORY_KEY } from '../constants';

export const saveSettings = (settings: UserSettings): void => {
  try {
    const settingsJson = JSON.stringify(settings);
    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, settingsJson);
  } catch (error) {
    console.error("Could not save settings to local storage", error);
  }
};

export const getSettings = (): UserSettings | null => {
  try {
    const settingsJson = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (settingsJson) {
      return JSON.parse(settingsJson) as UserSettings;
    }
    return null;
  } catch (error) {
    console.error("Could not retrieve settings from local storage", error);
    return null;
  }
};

export const saveHistory = (history: ChatMessage[]): void => {
  try {
    const historyJson = JSON.stringify(history);
    localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, historyJson);
  } catch (error) {
    console.error("Could not save history to local storage", error);
  }
};

export const getHistory = (): ChatMessage[] => {
  try {
    const historyJson = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
    if (historyJson) {
      return JSON.parse(historyJson) as ChatMessage[];
    }
    return [];
  } catch (error) {
    console.error("Could not retrieve history from local storage", error);
    return [];
  }
};
