import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useDevicesStore } from '../../store/useDevicesStore';
import { cn } from '../../lib/utils';

interface LearnIRModalProps {
  deviceId: string;
  isOpen: boolean;
  onClose: () => void;
  learnedIrCode?: string;
  onCommand: (command: Record<string, unknown>) => void;
}

export default function LearnIRModal({
  deviceId,
  isOpen,
  onClose,
  learnedIrCode,
  onCommand,
}: LearnIRModalProps) {
  const [name, setName] = useState('');
  const [isLearning, setIsLearning] = useState(false);
  const [learningResult, setLearningResult] = useState<{
    success: boolean;
    message: string;
    command?: string;
  } | null>(null);
  const [initialIrCode, setInitialIrCode] = useState<string>('');
  const { updateDevice } = useDevicesStore();

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setName('');
      setLearningResult(null);
      setIsLearning(false);
    }
  }, [isOpen]);

  // Watch for changes in learned_ir_code
  useEffect(() => {
    // Check if we are in learning mode, we have a code, and it's DIFFERENT from the initial code
    if (isLearning && learnedIrCode && learnedIrCode !== initialIrCode) {
      const saveCommand = async () => {
        try {
          // Use the correct endpoint for saving commands
          await api.post('/devices/command', {
            device_id: deviceId,
            name: name,
            command: learnedIrCode,
          });

          setLearningResult({
            success: true,
            message: 'Command learned successfully',
            command: learnedIrCode,
          });

          // Refresh only this device to get the updated learning commands list
          const response = await api.get(`/devices/${deviceId}`);
          if (response.data) {
            updateDevice(deviceId, response.data);
          }
        } catch (error) {
          console.error('Error saving command:', error);
          setLearningResult({
            success: false,
            message: 'Error saving command',
          });
        } finally {
          setIsLearning(false);
        }
      };

      saveCommand();
    }
  }, [learnedIrCode, isLearning, initialIrCode, deviceId, name, updateDevice]);

  const handleLearn = () => {
    if (!name.trim()) return;

    setInitialIrCode(learnedIrCode || '');
    setIsLearning(true);
    setLearningResult(null);
    // Send command to device to start learning
    onCommand({ learn_ir_code: 'ON' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Learn New IR Command</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
              placeholder="e.g., Power On"
              disabled={isLearning || (learningResult?.success ?? false)}
            />
          </div>

          {!learningResult && isLearning && (
            <div className="text-center text-sm text-blue-500 py-2">
              Point the remote at the device and press the button you want to
              learn.
            </div>
          )}

          {learningResult && (
            <div
              className={cn(
                'text-center text-sm font-medium py-2',
                learningResult.success ? 'text-emerald-500' : 'text-red-500',
              )}
            >
              {learningResult.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {learningResult?.success ? 'Close' : 'Cancel'}
          </Button>
          {!learningResult?.success && (
            <Button onClick={handleLearn} disabled={isLearning || !name.trim()}>
              {isLearning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Learning...
                </>
              ) : (
                'Start Learning'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
