export const settings = {
  title: 'Settings',
  subtitle: 'Manage your profile and preferences',
  tabs: {
    general: 'General',
    notifications: 'Notifications',
    integrations: 'Integrations',
    energy: 'Energy',
  },
  language: {
    title: 'Language',
    description:
      'Language used for the interface and all of your notifications.',
    label: 'Language',
    updated: 'Language updated',
    error: 'Could not update language',
  },
};

export type SettingsNS = typeof settings;
