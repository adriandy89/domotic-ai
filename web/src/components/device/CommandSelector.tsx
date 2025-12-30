import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Edit, Loader2, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useDevicesStore } from '../../store/useDevicesStore';
import type { DeviceLearnedCommand } from '../../store/useDevicesStore';

interface CommandSelectorProps {
  deviceId: string;
  commands: DeviceLearnedCommand[];
  isOpen: boolean;
  onClose: () => void;
  onCommand: (command: Record<string, unknown>) => void;
}

export default function CommandSelector({
  deviceId,
  commands,
  isOpen,
  onClose,
  onCommand,
}: CommandSelectorProps) {
  const [selectedCommandId, setSelectedCommandId] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { updateDevice } = useDevicesStore();

  const selectedCommand = commands.find((c) => c.id === selectedCommandId);

  const handleSend = async () => {
    if (!selectedCommand) return;

    setIsSending(true);
    try {
      // Send the IR code to the device
      onCommand({ ir_code_to_send: selectedCommand.command });
      // Simulate a small delay for better UX
      await new Promise((resolve) => setTimeout(resolve, 500));
      onClose(); // Close modal on success
    } catch (error) {
      console.error('Error sending command:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleEdit = () => {
    if (!selectedCommand) return;
    setEditName(selectedCommand.name);
    setShowEditDialog(true);
  };

  const confirmEdit = async () => {
    if (!selectedCommand || !editName.trim()) return;

    setIsEditing(true);
    try {
      await api.put(`/devices/command/${selectedCommand.id}`, {
        name: editName.trim(),
      });
      // Refresh only this device
      const response = await api.get(`/devices/${deviceId}`);
      if (response.data) {
        updateDevice(deviceId, response.data);
      }
      setShowEditDialog(false);
    } catch (error) {
      console.error('Error updating command:', error);
    } finally {
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (!selectedCommand) return;
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!selectedCommand) return;

    setIsDeleting(true);
    try {
      await api.delete(`/devices/command/${selectedCommand.id}`);
      // Refresh only this device
      const response = await api.get(`/devices/${deviceId}`);
      if (response.data) {
        updateDevice(deviceId, response.data);
      }
      setSelectedCommandId(''); // Reset selection
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Error deleting command:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:min-w-full">
          <DialogHeader>
            <DialogTitle>Select IR Command</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 py-4">
            <Select
              value={selectedCommandId}
              onValueChange={setSelectedCommandId}
            >
              <SelectTrigger className="flex-1 min-w-[200px]">
                <SelectValue placeholder="Select a command">
                  {selectedCommand ? selectedCommand.name : 'Select a command'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {commands.map((cmd) => (
                  <SelectItem key={cmd.id} value={cmd.id}>
                    {cmd.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={handleEdit}
              disabled={!selectedCommandId}
              title="Edit Name"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleDelete}
              disabled={!selectedCommandId}
              className="text-red-500 hover:text-red-600"
              title="Delete Command"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={handleSend}
              disabled={!selectedCommandId || isSending}
              className="min-w-[100px]"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[325px]">
          <DialogHeader>
            <DialogTitle>Edit Command Name</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Command name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmEdit}
              disabled={isEditing || !editName.trim()}
            >
              {isEditing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[375px]">
          <DialogHeader>
            <DialogTitle>Delete Command</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Are you sure you want to delete "{selectedCommand?.name}"? This
            action cannot be undone.
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
