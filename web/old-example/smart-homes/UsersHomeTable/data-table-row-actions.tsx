import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { AddUserModal } from "./AddUserModal";
import { IUserHomeTable } from "./schema.interface";
import { LinkUserHomes } from "./LinkUserHomes";

export function DataTableRowActions({ user }: { user: IUserHomeTable }) {
  const [openAddDevice, setOpenAddDevice] = useState(false);
  const [openLinks, setOpenLinks] = useState(false);
  const [selectUser, setSelectUser] = useState<IUserHomeTable>();

  const handleCloseUsersEdit = () => {
    setOpenAddDevice(false);
  };

  const openModalUser = (user: IUserHomeTable) => {
    setSelectUser(user);
    setOpenAddDevice(true);
  };

  const openModalLinks = (user: IUserHomeTable) => {
    setSelectUser(user);
    setOpenLinks(true);
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
            <MenubarItem onClick={() => openModalUser(user)}>Edit</MenubarItem>
            <MenubarItem onClick={() => openModalLinks(user)}>
              Link Homes
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      {openAddDevice && (
        <AddUserModal
          showAddModal={openAddDevice}
          handleClose={handleCloseUsersEdit}
          selectedUser={selectUser}
        />
      )}
      {openLinks && selectUser && (
        <LinkUserHomes
          showAddModal={openLinks}
          handleClose={() => setOpenLinks(false)}
          selectedUser={selectUser}
        />
      )}
    </>
  );
}
