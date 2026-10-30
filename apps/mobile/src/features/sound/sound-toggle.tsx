import { SoundToggleButton } from "@/shared/ui/sound-toggle-button";
import { useSoundPreference } from "./sound-preference";

/** The sound on/off button, wired to the learner's preference (screen headers). */
export function SoundToggle() {
  const { enabled, toggle } = useSoundPreference();
  return <SoundToggleButton enabled={enabled} onToggle={toggle} />;
}
