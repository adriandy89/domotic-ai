import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { IHomeTable } from "./schema.interface";
import { useState } from "react";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { AddHomeModal } from "./AddHomeModal";
import { LinkHomeUsers } from "./LinkHomeUsers";

export function DataTableRowActions({ home }: { home: IHomeTable }) {
  const [open, setOpen] = useState(false);
  const [selectHome, setSelectHome] = useState<IHomeTable>();
  const [openLinks, setOpenLinks] = useState(false);

  const openModalLinks = (home: IHomeTable) => {
    setSelectHome(home);
    setOpenLinks(true);
  };

  const handleCloseHomesEdit = () => {
    setOpen(false);
  };

  const onModal = (home: IHomeTable) => {
    setSelectHome(home);
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
            <MenubarItem onClick={() => onModal(home)}>Edit</MenubarItem>
            <MenubarItem onClick={() => openModalLinks(home)}>
              Link Users
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      {open && (
        <AddHomeModal
          showAddModal={open}
          handleClose={handleCloseHomesEdit}
          selectedHome={selectHome}
        />
      )}
      {openLinks && selectHome && (
        <LinkHomeUsers
          showAddModal={openLinks}
          handleClose={() => setOpenLinks(false)}
          selectedUser={selectHome}
        />
      )}
    </>
  );
}
