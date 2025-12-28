/* eslint-disable @typescript-eslint/no-explicit-any */
import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/components/data-table-column-header";
import { formatTimeDayJs } from "@/lib/convert";
import i18n from "@/utils/i18n/config";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  BanIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTableRowActions } from "./data-table-row-actions";
import { IUserHomeTable } from "./schema.interface";

export const columns: ColumnDef<IUserHomeTable>[] = [
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
    id: "expander",
    header: () => null,
    cell: ({ row }) => {
      return row.getCanExpand() ? (
        <div className="w-4 flex justify-center m-auto">
          <Button
            variant="ghost"
            size="icon"
            {...{
              onClick: row.getToggleExpandedHandler(),
            }}
            className="flex items-center justify-center"
          >
            {row.getIsExpanded() ? (
              <ChevronDownIcon className="w-5 h-5" />
            ) : (
              <ChevronRightIcon className="w-5 h-5" />
            )}
          </Button>
        </div>
      ) : null;
    },
  },
  {
    accessorKey: "username",
    meta: { title: i18n.t("email") },
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("email")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] font-medium">
            {row.getValue("username")}
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
    accessorKey: "phone",
    meta: { title: i18n.t("sharedPhone") },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("sharedPhone")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">
            {row.getValue("phone") ?? "-"}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "isActive",
    meta: { title: i18n.t("isActive") },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("isActive")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex w-[100px] items-center">
          {row.getValue("isActive") === true ? (
            <>
              <CheckCircleIcon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className={"text-green-500"}>{i18n.t("enabled")}</span>
            </>
          ) : (
            <>
              <BanIcon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className={"text-red-500"}>{i18n.t("disabled")}</span>
            </>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "role",
    meta: { title: i18n.t("role") },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("role")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">
            {row.getValue("role")}
          </span>
        </div>
      );
    },
  },
  // {
  //   accessorKey: "disabled",
  //   meta: { title: i18n.t("enable") },
  //   header: ({ column }) => (
  //     <DataTableColumnHeader column={column} title={i18n.t("enable")} />
  //   ),
  //   cell: ({ row }) => {
  //     const status = statuses.find(
  //       (status) => status.value === row.getValue("disabled")
  //     );

  //     if (!status) {
  //       return null;
  //     }

  //     return (
  //       <div className="flex w-[100px] items-center">
  //         {status.icon && (
  //           <status.icon className="mr-2 h-4 w-4 text-muted-foreground" />
  //         )}
  //         <span className={!status.value ? "text-green-500" : "text-red-500"}>
  //           {i18n.t(status.label)}
  //         </span>
  //       </div>
  //     );
  //   },
  //   filterFn: (row, id, value) => {
  //     return value.includes(row.getValue(id));
  //   },
  // },
  {
    accessorKey: "createdAt",
    meta: { title: i18n.t("createdAt") },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("createdAt")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">
            {formatTimeDayJs(row.getValue("createdAt"), "minutes", false)}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "updatedAt",
    meta: { title: i18n.t("updatedAt") },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("updatedAt")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">
            {formatTimeDayJs(row.getValue("updatedAt"), "minutes", false)}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions user={row.original} />,
  },
];
