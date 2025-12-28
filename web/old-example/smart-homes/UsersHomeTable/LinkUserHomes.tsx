/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DialogDescription } from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { IUserHomeTable } from "./schema.interface";
import { DataTableFull } from "@/components/data-table/components/data-table-full";
import { ITableOptions } from "@/components/data-table/interfaces/options.interface";
import i18n from "@/utils/i18n/config";
import { DataTableColumnHeader } from "@/components/data-table/components/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";
import { IHomeTable } from "../HomesTable/schema.interface";
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/api";
import { statuses } from "../HomesTable/data-icons";
import { FormError } from "@/components/form-error";
import { useToast } from "@/hooks/use-toast";

interface Props {
  showAddModal: boolean;
  handleClose: () => void;
  selectedUser: IUserHomeTable;
}

interface IHomeLink {
  disabled: boolean;
  id: number;
  linked: boolean;
  name: string;
  uniqueId: string;
}

const userRegisterOptions: ITableOptions = {
  enableFilters: true,
  dataSearch: "uniqueId",
  enableColumnSelection: false,
};

const columns: ColumnDef<Partial<IHomeTable>>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="w-6 flex justify-center m-auto pr-2">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value: any) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
          className="m-auto"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="w-6 flex justify-center m-auto pr-2">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value: any) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="m-auto"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "uniqueId",
    meta: { title: i18n.t("homeIdentifier") },
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("homeIdentifier")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] font-medium">
            {row.getValue("uniqueId")}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "name",
    meta: { title: i18n.t("sharedName") },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("sharedName")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">
            {row.getValue("name")}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "disabled",
    meta: { title: i18n.t("enable") },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("enable")} />
    ),
    cell: ({ row }) => {
      const status = statuses.find(
        (status) => status.value === row.getValue("disabled")
      );

      if (!status) {
        return null;
      }

      return (
        <div className="flex w-[100px] items-center">
          {status.icon && (
            <status.icon className="mr-2 h-4 w-4 text-muted-foreground" />
          )}
          <span className={!status.value ? "text-green-500" : "text-red-500"}>
            {i18n.t(status.label)}
          </span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
];

export const LinkUserHomes: React.FC<Props> = ({
  showAddModal,
  handleClose,
  selectedUser,
}) => {
  const [items, setItems] = useState<IHomeLink[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState(false);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const { toast } = useToast();

  const handleSave = async (selectedHomesIds: number[]) => {
    const data: {
      toUpdate: number[];
      toDelete: number[];
      ids: number[];
    } = {
      toUpdate: [],
      toDelete: [],
      ids: [selectedUser.id],
    };
    data.toDelete = items
      .filter(
        (element) => !selectedHomesIds.includes(element.id) && element.linked
      )
      .map((element) => element.id);
    data.toUpdate = selectedHomesIds.filter(
      (element) => !items.find((item) => item.id === element && item.linked)
    );
    if (data.toUpdate.length > 0 || data.toDelete.length > 0) {
      setLoading(true);
      setError(false);
      await api
        .put("/api/v1/user-home/links/homes", data)
        .then(() => {
          toast({
            title: "Links Success",
            description: "User homes linked successfully",
            duration: 5000,
            variant: "default",
          });
          handleClose();
        })
        .catch((err) => {
          console.error(err);
          setError(true);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await api
        .get("/api/v1/user-home/list/all-link/" + selectedUser.id)
        .then(({ data }) => {
          if (data.homes) {
            setItems(data.homes);
            const initiallySelected = data.homes
              .filter((home: IHomeLink) => home.linked)
              .map((home: IHomeLink) => home.id);
            setSelectedRows(initiallySelected);
          }
        })
        .catch((error) => {
          console.error(error);
          setError(true);
        })
        .finally(() => {
          setLoading(false);
        });
    };
    fetchData();
  }, []);

  return (
    <Dialog open={showAddModal} onOpenChange={handleClose}>
      <DialogContent
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        className="max-h-[100vh] w-full md:w-auto md:min-w-[680px] max-w-[100vw] flex flex-col overflow-hidden p-4 m-0"
        aria-describedby={"link-user-homes"}
      >
        <ScrollArea className="h-screen md:h-auto">
          <DialogHeader className="p-1 ">
            <DialogTitle className="text-center pb-2">
              Link User Homes
            </DialogTitle>
            <DialogDescription />
            <div className="flex flex-col justify-center gap-2">
              <DataTableFull
                options={userRegisterOptions}
                columns={columns}
                data={items}
                error={error}
                loading={loading}
                handleSaveSelected={handleSave}
                initialSelectedRows={selectedRows}
              />
            </div>
          </DialogHeader>
          {error && <FormError message={error ? "Error in request" : ""} />}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
