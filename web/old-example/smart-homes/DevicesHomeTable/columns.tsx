/* eslint-disable @typescript-eslint/no-explicit-any */
import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/components/data-table-column-header";
import { statuses } from "./data-icons";
import { IDeviceHomeTable } from "./schema.interface";
import { formatTimeDayJs } from "@/lib/convert";
import i18n from "@/utils/i18n/config";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRightIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTableRowActions } from "./data-table-row-actions";

export const columns: ColumnDef<IDeviceHomeTable>[] = [
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
    accessorKey: "uniqueId",
    meta: { title: i18n.t("deviceIdentifier") },
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={i18n.t("deviceIdentifier")}
      />
    ),
    cell: ({ row }) => {
      // const label = labels.find((label) => label.value === row.original.label)

      return (
        <div className="flex space-x-2">
          {/* {label && <Badge variant="outline">{label.label}</Badge>} */}
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
    accessorKey: "model",
    meta: { title: i18n.t("deviceModel") },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("deviceModel")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">
            {row.getValue("model")}
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
  {
    accessorKey: "home",
    meta: { title: i18n.t("home") },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={i18n.t("home")} />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[500px] truncate font-medium">
            {row.original.home?.name ?? ""}
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
            {formatTimeDayJs(row.getValue("updatedAt"), "seconds", false)}
          </span>
        </div>
      );
    },
  },
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
            {formatTimeDayJs(row.getValue("createdAt"), "seconds", false)}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions device={row.original} />,
  },
];
