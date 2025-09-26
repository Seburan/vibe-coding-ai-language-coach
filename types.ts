export interface UserSettings {
  nativeLanguage: string;
  targetLanguage: string;
  skillLevel: string;
}

export enum Speaker {
  User = 'You',
  Coach = 'Coach',
  System = 'System'
}

export interface ChatMessage {
  speaker: Speaker;
  text: string;
  isFeedback?: boolean;
}
