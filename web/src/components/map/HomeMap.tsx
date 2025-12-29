import { useState, useRef } from 'react';
import { useDevicesStore } from '../../store/useDevicesStore';
import type { Device } from '../../store/useDevicesStore';
import type { Home } from '../../store/useHomesStore';
import { DeviceMarker } from './DeviceMarker';
import { MapContextMenu } from './MapContextMenu';
import { Edit, Eye } from 'lucide-react';
import { Button } from '../ui/button';
import { api } from '../../lib/api';

interface HomeMapProps {
  home: Home;
}

export function HomeMap({ home }: HomeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { getDevicesByHomeId, updateDevice } = useDevicesStore();
  const devices = getDevicesByHomeId(home.id);

  const [isEditMode, setIsEditMode] = useState(false);
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

  const handleRemoveDevice = async (device: Device, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent context menu
    if (!isEditMode) return;

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
    <div className="flex flex-col gap-4 w-full h-full">
      <div
        className="relative w-full group select-none"
        style={{ aspectRatio: '16/9' }}
      >
        <div
          ref={containerRef}
          className="absolute inset-0 rounded-lg overflow-hidden border bg-muted/20 shadow-inner"
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
              className="absolute inset-0 w-full h-full object-contain bg-background pointer-events-none"
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
                  setSelectedDeviceId(device.id);
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

        {contextMenu && isEditMode && (
          <MapContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            unassignedDevices={unassignedDevices}
            onSelect={handleAddDevice}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>

      <div className="text-xs text-muted-foreground text-center">
        {isEditMode
          ? 'Right-click on map to add devices. Right-click on existing device to remove. Drag to move.'
          : 'Interact with devices to view details.'}
      </div>
      <div className="flex justify-between items-center bg-card p-2 rounded-lg border shadow-sm">
        <div className="font-semibold text-sm px-2">
          Map Mode:{' '}
          {isEditMode ? (
            <span className="text-primary font-bold">Editing</span>
          ) : (
            <span className="text-muted-foreground">Viewing</span>
          )}
        </div>
        <Button
          variant={isEditMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setIsEditMode(!isEditMode);
            setContextMenu(null);
          }}
          className="flex items-center gap-2"
        >
          {isEditMode ? (
            <Edit className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
          {isEditMode ? 'Done Editing' : 'Edit Map'}
        </Button>
      </div>
    </div>
  );
}
