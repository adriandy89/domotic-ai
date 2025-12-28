import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { IDeviceHomeTable } from "./schema.interface";
import { useState } from "react";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { AddDeviceModal } from "./AddDeviceModal";

export function DataTableRowActions({ device }: { device: IDeviceHomeTable }) {
  const [open, setOpen] = useState(false);
  const [selectDevice, setSelectDevice] = useState<IDeviceHomeTable>();

  const handleCloseDevicesEdit = () => {
    setOpen(false);
  };

  const onModal = (device: IDeviceHomeTable) => {
    setSelectDevice(device);
    setOpen(true);
  };

  return (
    <>
      <Menubar className="bg-transparent border-0 w-auto">
        <MenubarMenu>
          <MenubarTrigger className="mx-auto p-0 flex justify-center items-center">
            <button className="pointer p-1">
              <DotsHorizontalIcon className="h-4 w-4" />
              <span className="sr-only">Menu</span>
            </button>
          </MenubarTrigger>
          <MenubarContent className="min-w-[8rem]">
            <MenubarItem onClick={() => onModal(device)}>Edit</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      {open && (
        <AddDeviceModal
          showAddModal={open}
          handleClose={handleCloseDevicesEdit}
          selectedDevice={selectDevice}
        />
      )}
    </>
  );
}
