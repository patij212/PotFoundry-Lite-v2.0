import { useState } from 'react';
import { Settings } from 'lucide-react';
import { AppSettingsModal } from './AppSettingsModal';
import './AppSettings.css';

export function AppSettingsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="app-settings-trigger"
        onClick={() => setOpen(true)}
        aria-label="App settings"
        title="Settings"
      >
        <Settings size={18} />
      </button>
      <AppSettingsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
