import { useState, useRef } from 'react';
import { useDevicesStore } from '../../store/useDevicesStore';
import type { Device } from '../../store/useDevicesStore';
import type { Home } from '../../store/useHomesStore';
import { useHomesStore } from '../../store/useHomesStore';
import { DeviceMarker } from './DeviceMarker';
import { MapContextMenu } from './MapContextMenu';
import { HomeImageSelector } from './HomeImageSelector';
import { Edit, Eye, Image, MapPinOff } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import DeviceCard from '../device/DeviceCard';
import { api } from '../../lib/api';

interface HomeMapProps {
  home: Home;
}

export function HomeMap({ home }: HomeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { getDevicesByHomeId, updateDevice } = useDevicesStore();
  const { updateHome } = useHomesStore();
  const devices = getDevicesByHomeId(home.id);

  const [isEditMode, setIsEditMode] = useState(false);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number; // Pixels (UI)
    y: number; // Pixels (UI)
    mapX: number; // Percentages (Logic)
    mapY: number; // Percentages (Logic)
  } | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Dragging state
  const draggingRef = useRef<{
    id: string;
    startX: number;
    startY: number;
  } | null>(null);
  const hasDraggedRef = useRef(false);

  // Filter devices for map and unassigned list
  const assignedDevices = devices.filter((d: Device) => d.show_on_map);
  const unassignedDevices = devices.filter((d: Device) => !d.show_on_map);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isEditMode || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mapX = ((e.clientX - rect.left) / rect.width) * 100;
    const mapY = ((e.clientY - rect.top) / rect.height) * 100;

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      mapX,
      mapY,
    });
    setSelectedDeviceId(null);
  };

  const handleAddDevice = async (device: Device) => {
    if (!contextMenu) return;

    const updates = {
      show_on_map: true,
      x: contextMenu.mapX,
      y: contextMenu.mapY,
    };

    // Optimistic update
    updateDevice(device.id, updates);
    setContextMenu(null);

    try {
      const response = await api.put<{ ok: boolean; data: any }>(
        `/devices/position/${device.id}`,
        updates,
      );
      if (response.data?.ok && response.data?.data) {
        updateDevice(device.id, response.data.data);
      }
    } catch (error) {
      console.error('Failed to update device map position', error);
      // Revert on error could be implemented here
    }
  };

  const handleRemoveDevice = async (device: Device, e?: React.MouseEvent) => {
    e?.preventDefault(); // Prevent context menu
    if (!isEditMode && e) return; // Only check edit mode if from context menu

    // Right click on device in edit mode removes it
    const updates = { show_on_map: false };
    updateDevice(device.id, updates);

    try {
      const response = await api.put<{ ok: boolean; data: Device }>(
        `/devices/position/${device.id}`,
        updates,
      );
      if (response.data?.ok && response.data?.data) {
        updateDevice(device.id, response.data.data);
      }
    } catch (error) {
      console.error('Failed to remove device from map', error);
    }
  };

  const handleDeviceMouseDown = (device: Device, e: React.MouseEvent) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation(); // Prevent map context menu

    hasDraggedRef.current = false; // Reset drag flag
    draggingRef.current = {
      id: device.id,
      startX: e.clientX,
      startY: e.clientY,
    };

    // Add global listeners
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (!draggingRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    // Calculate new position in percentage relative to container
    // Clamp between 0 and 100
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;

    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    hasDraggedRef.current = true; // Mark that we've actually dragged

    // Update store optimistically for smooth drag
    updateDevice(draggingRef.current.id, { x, y });
  };

  const handleGlobalMouseUp = async () => {
    if (!draggingRef.current) return;

    const deviceId = draggingRef.current.id;
    const device = getDevicesByHomeId(home.id).find((d) => d.id === deviceId);

    // Clean up
    draggingRef.current = null;
    window.removeEventListener('mousemove', handleGlobalMouseMove);
    window.removeEventListener('mouseup', handleGlobalMouseUp);

    if (device) {
      try {
        const response = await api.put<{ ok: boolean; data: Device }>(
          `/devices/position/${device.id}`,
          { x: device.x, y: device.y },
        );
        if (response.data?.ok && response.data?.data) {
          updateDevice(device.id, response.data.data);
        }
      } catch (error) {
        console.error('Failed to save device position', error);
      }
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full h-full">
      <div
        ref={containerRef}
        className="relative w-full aspect-[5/3] group select-none rounded-xl overflow-hidden border border-border bg-card/40 backdrop-blur-xl shadow-lg"
        onContextMenu={handleContextMenu}
        onClick={() => {
          setContextMenu(null);
          setSelectedDeviceId(null);
        }}
      >
        {home.image ? (
          <img
            src={home.image}
            alt="Floor Plan"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none rounded-md"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none">
            No floor plan image available
          </div>
        )}

        {assignedDevices.map((device: Device) => {
          const deviceData = useDevicesStore
            .getState()
            .getDeviceDataById(device.id);
          return (
            <DeviceMarker
              key={device.id}
              device={device}
              data={deviceData?.data}
              isSelected={selectedDeviceId === device.id}
              onClick={(e) => {
                e.stopPropagation();
                // Only open modal if we didn't drag
                if (!hasDraggedRef.current) {
                  setSelectedDeviceId(device.id);
                  setShowDeviceModal(true);
                }
              }}
              onContextMenu={(e) => handleRemoveDevice(device, e)}
              onMouseDown={(e) => handleDeviceMouseDown(device, e)}
            />
          );
        })}

        {isEditMode && unassignedDevices.length > 0 && !contextMenu && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            Right click to add devices
          </div>
        )}
      </div>

      {/* Context Menu - rendered outside map container for proper fixed positioning */}
      {contextMenu && isEditMode && (
        <MapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          unassignedDevices={unassignedDevices}
          onSelect={handleAddDevice}
          onClose={() => setContextMenu(null)}
        />
      )}

      <div className="text-xs text-muted-foreground text-center">
        {isEditMode
          ? 'Right-click on map to add devices. Right-click on existing device to remove. Drag to move.'
          : 'Interact with devices to view details.'}
      </div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-card/40 border border-border p-2 rounded-xl backdrop-blur-xl">
        <div className="flex items-center justify-between sm:justify-around w-full gap-2">
          <span className="text-xs font-medium">
            {isEditMode ? (
              <span className="text-primary font-bold">Editing</span>
            ) : (
              <span className="text-muted-foreground">Viewing</span>
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImageSelector(true)}
            className="flex items-center gap-1 text-xs"
          >
            <Image className="w-3 h-3" />
            <span className="hidden sm:inline">Change </span>Floor Plan
          </Button>
          <Button
            variant={isEditMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setIsEditMode(!isEditMode);
              setContextMenu(null);
            }}
            className="flex items-center gap-1 text-xs"
          >
            {isEditMode ? (
              <Edit className="w-3 h-3" />
            ) : (
              <Eye className="w-3 h-3" />
            )}
            {isEditMode ? 'Done' : 'Edit'}
          </Button>
        </div>
      </div>

      {/* Home Image Selector Modal */}
      <HomeImageSelector
        homeId={home.id}
        currentImage={home.image}
        isOpen={showImageSelector}
        onClose={() => setShowImageSelector(false)}
        onImageChange={(newImage) => {
          updateHome(home.id, { image: newImage });
        }}
      />

      {/* Device Detail Modal */}
      <Dialog
        open={showDeviceModal && !!selectedDeviceId}
        onOpenChange={(open) => {
          setShowDeviceModal(open);
          if (!open) setSelectedDeviceId(null);
        }}
      >
        <DialogContent className="sm:max-w-[450px] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-lg">Device Details</DialogTitle>
          </DialogHeader>

          {selectedDeviceId &&
            (() => {
              const selectedDevice = assignedDevices.find(
                (d) => d.id === selectedDeviceId,
              );
              const selectedDeviceData = useDevicesStore
                .getState()
                .getDeviceDataById(selectedDeviceId);

              if (!selectedDevice) return null;

              return (
                <div className="flex-1 overflow-y-auto px-4 pb-2">
                  <DeviceCard
                    device={selectedDevice}
                    deviceData={selectedDeviceData ?? undefined}
                  />
                </div>
              );
            })()}

          <DialogFooter className="p-4 pt-2 border-t border-border gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                const device = assignedDevices.find(
                  (d) => d.id === selectedDeviceId,
                );
                if (device) {
                  handleRemoveDevice(device);
                  setShowDeviceModal(false);
                  setSelectedDeviceId(null);
                }
              }}
              className="flex items-center gap-2"
            >
              <MapPinOff className="w-4 h-4" />
              Remove from Map
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowDeviceModal(false);
                setSelectedDeviceId(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
